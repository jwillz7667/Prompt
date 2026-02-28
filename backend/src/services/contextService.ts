import { ProjectContext, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';
import { Redis } from 'ioredis';
import crypto from 'crypto';

interface ContextEmbedding {
  id: string;
  embedding: number[];
  metadata: any;
}

interface SimilarContext {
  context: ProjectContext;
  similarity: number;
}

interface ContextSearchOptions {
  query: string;
  userId: string;
  limit?: number;
  minSimilarity?: number;
  tags?: string[];
  includeGlobal?: boolean;
}

interface ContextCreateData {
  userId: string;
  name: string;
  description?: string;
  contextData: any;
  tags?: string[];
  isGlobal?: boolean;
}

interface ContextUpdateData {
  name?: string;
  description?: string;
  contextData?: any;
  tags?: string[];
  isGlobal?: boolean;
}

class ContextService {
  private openai: OpenAI | null = null;
  private redis: Redis | null = null;
  private embeddingModel = 'text-embedding-3-small';
  private embeddingDimensions = 1536;
  
  constructor() {
    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    
    // Initialize Redis for caching embeddings
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
    }
  }

  /**
   * Create a new project context with optional embedding
   */
  async createContext(data: ContextCreateData): Promise<ProjectContext> {
    try {
      // Create the context in database
      const context = await prisma.projectContext.create({
        data: {
          userId: data.userId,
          name: data.name,
          description: data.description,
          contextData: data.contextData as Prisma.InputJsonValue,
          tags: data.tags || [],
          isGlobal: data.isGlobal || false
        }
      });

      // Generate and store embedding if OpenAI is configured
      if (this.openai) {
        await this.generateAndStoreEmbedding(context);
      }

      logger.info({ contextId: context.id }, 'Context created successfully');
      return context;
    } catch (error) {
      logger.error({ error }, 'Failed to create context');
      throw error;
    }
  }

  /**
   * Update an existing context
   */
  async updateContext(
    contextId: string,
    userId: string,
    data: ContextUpdateData
  ): Promise<ProjectContext | null> {
    try {
      // Verify ownership
      const existing = await prisma.projectContext.findFirst({
        where: { id: contextId, userId }
      });

      if (!existing) {
        return null;
      }

      // Update the context
      const context = await prisma.projectContext.update({
        where: { id: contextId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.contextData && { contextData: data.contextData as Prisma.JsonValue }),
          ...(data.tags && { tags: data.tags }),
          ...(data.isGlobal !== undefined && { isGlobal: data.isGlobal })
        }
      });

      // Regenerate embedding if content changed
      if (this.openai && (data.name || data.description || data.contextData)) {
        await this.generateAndStoreEmbedding(context);
      }

      logger.info({ contextId }, 'Context updated successfully');
      return context;
    } catch (error) {
      logger.error({ error, contextId }, 'Failed to update context');
      throw error;
    }
  }

  /**
   * Delete a context
   */
  async deleteContext(contextId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.projectContext.deleteMany({
        where: { id: contextId, userId }
      });

      if (result.count === 0) {
        return false;
      }

      // Delete embedding from cache
      if (this.redis) {
        await this.redis.del(`embedding:context:${contextId}`);
      }

      logger.info({ contextId }, 'Context deleted successfully');
      return true;
    } catch (error) {
      logger.error({ error, contextId }, 'Failed to delete context');
      throw error;
    }
  }

  /**
   * Get a single context by ID
   */
  async getContext(contextId: string, userId: string): Promise<ProjectContext | null> {
    try {
      return await prisma.projectContext.findFirst({
        where: {
          id: contextId,
          OR: [
            { userId },
            { isGlobal: true }
          ]
        },
        include: {
          usages: {
            take: 5,
            orderBy: { usedAt: 'desc' }
          }
        }
      });
    } catch (error) {
      logger.error({ error, contextId }, 'Failed to get context');
      throw error;
    }
  }

  /**
   * List all contexts for a user
   */
  async listContexts(userId: string, includeGlobal = true): Promise<ProjectContext[]> {
    try {
      const where: Prisma.ProjectContextWhereInput = includeGlobal
        ? {
            OR: [
              { userId },
              { isGlobal: true }
            ]
          }
        : { userId };

      return await prisma.projectContext.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { usages: true }
          }
        }
      });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list contexts');
      throw error;
    }
  }

  /**
   * Search for similar contexts using semantic search
   */
  async searchSimilarContexts(options: ContextSearchOptions): Promise<SimilarContext[]> {
    if (!this.openai) {
      // Fallback to keyword search if embeddings not available
      return this.keywordSearch(options);
    }

    try {
      // Generate embedding for search query
      const queryEmbedding = await this.generateEmbedding(options.query);
      
      // Get all contexts for the user
      const contexts = await prisma.projectContext.findMany({
        where: {
          OR: [
            { userId: options.userId },
            ...(options.includeGlobal ? [{ isGlobal: true }] : [])
          ],
          ...(options.tags?.length && {
            tags: { hasSome: options.tags }
          })
        }
      });

      // Calculate similarities
      const similarities: SimilarContext[] = [];
      
      for (const context of contexts) {
        const contextEmbedding = await this.getOrGenerateEmbedding(context);
        if (contextEmbedding) {
          const similarity = this.cosineSimilarity(queryEmbedding, contextEmbedding);
          
          if (similarity >= (options.minSimilarity || 0.7)) {
            similarities.push({ context, similarity });
          }
        }
      }

      // Sort by similarity and limit results
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      return similarities.slice(0, options.limit || 10);
    } catch (error) {
      logger.error({ error, options }, 'Failed to search similar contexts');
      // Fallback to keyword search
      return this.keywordSearch(options);
    }
  }

  /**
   * Attach a context to a prompt
   */
  async attachContextToPrompt(
    contextId: string,
    promptId: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Verify context access
      const context = await this.getContext(contextId, userId);
      if (!context) {
        return false;
      }

      // Create usage record
      await prisma.contextUsage.upsert({
        where: {
          contextId_promptId: {
            contextId,
            promptId
          }
        },
        create: {
          contextId,
          promptId,
          metadata: {
            attachedBy: userId,
            attachedAt: new Date().toISOString()
          }
        },
        update: {
          usedAt: new Date(),
          metadata: {
            lastUsedBy: userId,
            lastUsedAt: new Date().toISOString()
          }
        }
      });

      logger.info({ contextId, promptId }, 'Context attached to prompt');
      return true;
    } catch (error) {
      logger.error({ error, contextId, promptId }, 'Failed to attach context');
      throw error;
    }
  }

  /**
   * Get contexts used with a prompt
   */
  async getPromptContexts(promptId: string): Promise<ProjectContext[]> {
    try {
      const usages = await prisma.contextUsage.findMany({
        where: { promptId },
        include: { context: true },
        orderBy: { usedAt: 'desc' }
      });

      return usages.map(u => u.context);
    } catch (error) {
      logger.error({ error, promptId }, 'Failed to get prompt contexts');
      throw error;
    }
  }

  /**
   * Merge multiple contexts into a single combined context
   */
  async mergeContexts(
    contextIds: string[],
    userId: string,
    newName: string
  ): Promise<ProjectContext> {
    try {
      // Get all contexts
      const contexts = await prisma.projectContext.findMany({
        where: {
          id: { in: contextIds },
          OR: [
            { userId },
            { isGlobal: true }
          ]
        }
      });

      if (contexts.length !== contextIds.length) {
        throw new Error('One or more contexts not found or not accessible');
      }

      // Merge context data
      const mergedData: any = {
        sources: contexts.map(c => ({
          id: c.id,
          name: c.name,
          data: c.contextData
        })),
        mergedAt: new Date().toISOString()
      };

      const mergedTags = [...new Set(contexts.flatMap(c => c.tags))];

      // Create new merged context
      return await this.createContext({
        userId,
        name: newName,
        description: `Merged from: ${contexts.map(c => c.name).join(', ')}`,
        contextData: mergedData,
        tags: mergedTags,
        isGlobal: false
      });
    } catch (error) {
      logger.error({ error, contextIds }, 'Failed to merge contexts');
      throw error;
    }
  }

  // Private helper methods

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not configured');
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
      dimensions: this.embeddingDimensions
    });

    return response.data[0]!.embedding;
  }

  private async generateAndStoreEmbedding(context: ProjectContext): Promise<void> {
    try {
      // Combine relevant text for embedding
      const textToEmbed = [
        context.name,
        context.description || '',
        JSON.stringify(context.contextData),
        context.tags.join(' ')
      ].join(' ');

      const embedding = await this.generateEmbedding(textToEmbed);

      // Cache embedding in Redis
      if (this.redis) {
        const key = `embedding:context:${context.id}`;
        await this.redis.set(
          key,
          JSON.stringify(embedding),
          'EX',
          86400 * 7 // Cache for 7 days
        );
      }
    } catch (error) {
      logger.error({ error, contextId: context.id }, 'Failed to generate embedding');
      // Non-critical error, don't throw
    }
  }

  private async getOrGenerateEmbedding(context: ProjectContext): Promise<number[] | null> {
    try {
      // Check cache first
      if (this.redis) {
        const cached = await this.redis.get(`embedding:context:${context.id}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Generate new embedding
      const textToEmbed = [
        context.name,
        context.description || '',
        JSON.stringify(context.contextData),
        context.tags.join(' ')
      ].join(' ');

      return await this.generateEmbedding(textToEmbed);
    } catch (error) {
      logger.error({ error, contextId: context.id }, 'Failed to get embedding');
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private async keywordSearch(options: ContextSearchOptions): Promise<SimilarContext[]> {
    try {
      const searchTerms = options.query.toLowerCase().split(' ');
      
      const contexts = await prisma.projectContext.findMany({
        where: {
          OR: [
            { userId: options.userId },
            ...(options.includeGlobal ? [{ isGlobal: true }] : [])
          ],
          AND: [
            {
              OR: searchTerms.map(term => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { description: { contains: term, mode: 'insensitive' as const } },
                  { tags: { has: term } }
                ]
              }))
            },
            ...(options.tags?.length ? [{
              tags: { hasSome: options.tags }
            }] : [])
          ]
        },
        take: options.limit || 10
      });

      // Calculate simple relevance score
      return contexts.map(context => {
        let score = 0;
        const contextText = `${context.name} ${context.description || ''} ${context.tags.join(' ')}`.toLowerCase();
        
        searchTerms.forEach(term => {
          if (contextText.includes(term)) {
            score += 1;
          }
        });

        return {
          context,
          similarity: Math.min(score / searchTerms.length, 1)
        };
      }).sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error({ error, options }, 'Keyword search failed');
      return [];
    }
  }
}

export const contextService = new ContextService();