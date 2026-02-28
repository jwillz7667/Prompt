import { SandboxTest, PlatformType, PlatformTestResult, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import pLimit from 'p-limit';

interface PlatformConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface TestParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
}

interface SandboxTestCreate {
  userId: string;
  promptId?: string;
  testPrompt: string;
  platforms: PlatformType[];
  parameters?: TestParameters;
  scheduledFor?: Date;
}

interface TestResult {
  platform: PlatformType;
  response?: string;
  error?: string;
  latencyMs: number;
  tokenCount?: number;
  cost?: number;
  metadata?: any;
}

class SandboxService {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private googleAI: GoogleGenerativeAI | null = null;
  private perplexityClient: any = null;
  
  // Rate limiting
  private concurrencyLimit = pLimit(3); // Max 3 concurrent platform tests
  
  constructor() {
    this.initializeClients();
  }

  private initializeClients() {
    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    // Initialize Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    // Initialize Google AI
    if (process.env.GOOGLE_AI_API_KEY) {
      this.googleAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    }

    // Initialize Perplexity (uses OpenAI-compatible API)
    if (process.env.PERPLEXITY_API_KEY) {
      this.perplexityClient = new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai'
      });
    }
  }

  /**
   * Create a new sandbox test
   */
  async createTest(data: SandboxTestCreate): Promise<SandboxTest> {
    try {
      const test = await prisma.sandboxTest.create({
        data: {
          userId: data.userId,
          promptId: data.promptId,
          testPrompt: data.testPrompt,
          platforms: data.platforms,
          parameters: data.parameters as Prisma.JsonValue,
          scheduledFor: data.scheduledFor,
          status: data.scheduledFor ? 'scheduled' : 'pending'
        }
      });

      // If not scheduled, start test immediately
      if (!data.scheduledFor) {
        this.executeTest(test.id).catch(error => {
          logger.error({ error, testId: test.id }, 'Failed to execute test');
        });
      }

      logger.info({ testId: test.id }, 'Sandbox test created');
      return test;
    } catch (error) {
      logger.error({ error }, 'Failed to create sandbox test');
      throw error;
    }
  }

  /**
   * Execute a sandbox test across all specified platforms
   */
  async executeTest(testId: string): Promise<SandboxTest> {
    try {
      // Update test status
      const test = await prisma.sandboxTest.update({
        where: { id: testId },
        data: {
          status: 'processing',
          startedAt: new Date()
        }
      });

      if (!test) {
        throw new Error('Test not found');
      }

      const parameters = test.parameters as TestParameters || {};
      
      // Execute tests on all platforms in parallel with concurrency limit
      const testPromises = test.platforms.map(platform =>
        this.concurrencyLimit(() => this.testOnPlatform(platform, test.testPrompt, parameters))
      );

      const results = await Promise.allSettled(testPromises);

      // Store results
      for (let i = 0; i < results.length; i++) {
        const platform = test.platforms[i];
        const result = results[i];
        
        let testResult: TestResult;
        
        if (result.status === 'fulfilled') {
          testResult = result.value;
        } else {
          testResult = {
            platform,
            error: result.reason?.message || 'Unknown error',
            latencyMs: 0
          };
        }

        await this.saveTestResult(testId, testResult);
      }

      // Update test status
      const updatedTest = await prisma.sandboxTest.update({
        where: { id: testId },
        data: {
          status: 'completed',
          completedAt: new Date()
        },
        include: {
          results: true
        }
      });

      logger.info({ testId }, 'Sandbox test completed');
      return updatedTest;
    } catch (error) {
      logger.error({ error, testId }, 'Failed to execute sandbox test');
      
      // Mark test as failed
      await prisma.sandboxTest.update({
        where: { id: testId },
        data: { status: 'failed' }
      }).catch(() => {});
      
      throw error;
    }
  }

  /**
   * Test prompt on a specific platform
   */
  private async testOnPlatform(
    platform: PlatformType,
    prompt: string,
    parameters: TestParameters
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      let response: string;
      let tokenCount: number | undefined;
      let cost: number | undefined;
      let metadata: any = {};

      switch (platform) {
        case PlatformType.CHATGPT:
          const gptResult = await this.testOnChatGPT(prompt, parameters);
          response = gptResult.response;
          tokenCount = gptResult.tokenCount;
          cost = gptResult.cost;
          metadata = gptResult.metadata;
          break;

        case PlatformType.CLAUDE:
          const claudeResult = await this.testOnClaude(prompt, parameters);
          response = claudeResult.response;
          tokenCount = claudeResult.tokenCount;
          cost = claudeResult.cost;
          metadata = claudeResult.metadata;
          break;

        case PlatformType.GEMINI:
          const geminiResult = await this.testOnGemini(prompt, parameters);
          response = geminiResult.response;
          tokenCount = geminiResult.tokenCount;
          cost = geminiResult.cost;
          metadata = geminiResult.metadata;
          break;

        case PlatformType.PERPLEXITY:
          const perplexityResult = await this.testOnPerplexity(prompt, parameters);
          response = perplexityResult.response;
          tokenCount = perplexityResult.tokenCount;
          cost = perplexityResult.cost;
          metadata = perplexityResult.metadata;
          break;

        case PlatformType.MIDJOURNEY:
        case PlatformType.DALLE:
        case PlatformType.STABLE_DIFFUSION:
          // Image generation platforms - simulate for now
          response = `[Image generation test for: ${prompt.substring(0, 100)}...]`;
          metadata = { type: 'image_generation', simulated: true };
          break;

        case PlatformType.GITHUB_COPILOT:
          // Code generation - simulate for now
          response = `// Code generation test for: ${prompt.substring(0, 100)}...`;
          metadata = { type: 'code_generation', simulated: true };
          break;

        default:
          throw new Error(`Platform ${platform} not supported`);
      }

      const latencyMs = Date.now() - startTime;

      return {
        platform,
        response,
        latencyMs,
        tokenCount,
        cost,
        metadata
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      
      return {
        platform,
        error: error.message || 'Unknown error',
        latencyMs
      };
    }
  }

  /**
   * Test on ChatGPT/OpenAI
   */
  private async testOnChatGPT(prompt: string, parameters: TestParameters) {
    if (!this.openai) {
      throw new Error('OpenAI client not configured');
    }

    const messages: any[] = [];
    
    if (parameters.systemPrompt) {
      messages.push({ role: 'system', content: parameters.systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: parameters.temperature || 0.7,
      max_tokens: parameters.maxTokens || 2000,
      top_p: parameters.topP || 1,
      frequency_penalty: parameters.frequencyPenalty || 0,
      presence_penalty: parameters.presencePenalty || 0
    });

    const response = completion.choices[0].message.content || '';
    const tokenCount = completion.usage?.total_tokens;
    
    // Estimate cost (GPT-4 Turbo pricing)
    const inputCost = (completion.usage?.prompt_tokens || 0) * 0.01 / 1000;
    const outputCost = (completion.usage?.completion_tokens || 0) * 0.03 / 1000;
    const cost = inputCost + outputCost;

    return {
      response,
      tokenCount,
      cost,
      metadata: {
        model: completion.model,
        finishReason: completion.choices[0].finish_reason
      }
    };
  }

  /**
   * Test on Claude/Anthropic
   */
  private async testOnClaude(prompt: string, parameters: TestParameters) {
    if (!this.anthropic) {
      throw new Error('Anthropic client not configured');
    }

    const systemPrompt = parameters.systemPrompt || 'You are a helpful AI assistant.';
    
    const message = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: parameters.maxTokens || 2000,
      temperature: parameters.temperature || 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Estimate token count and cost
    const tokenCount = Math.ceil((prompt.length + response.length) / 4);
    const cost = tokenCount * 0.015 / 1000; // Claude 3 Opus pricing estimate

    return {
      response,
      tokenCount,
      cost,
      metadata: {
        model: message.model,
        stopReason: message.stop_reason
      }
    };
  }

  /**
   * Test on Gemini/Google AI
   */
  private async testOnGemini(prompt: string, parameters: TestParameters) {
    if (!this.googleAI) {
      throw new Error('Google AI client not configured');
    }

    const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const chat = model.startChat({
      generationConfig: {
        temperature: parameters.temperature || 0.7,
        maxOutputTokens: parameters.maxTokens || 2000,
        topP: parameters.topP || 1
      }
    });

    if (parameters.systemPrompt) {
      await chat.sendMessage(parameters.systemPrompt);
    }

    const result = await chat.sendMessage(prompt);
    const response = result.response.text();
    
    // Estimate token count
    const tokenCount = Math.ceil((prompt.length + response.length) / 4);
    
    // Gemini is currently free during preview
    const cost = 0;

    return {
      response,
      tokenCount,
      cost,
      metadata: {
        model: 'gemini-pro',
        candidates: result.response.candidates?.length
      }
    };
  }

  /**
   * Test on Perplexity
   */
  private async testOnPerplexity(prompt: string, parameters: TestParameters) {
    if (!this.perplexityClient) {
      throw new Error('Perplexity client not configured');
    }

    const messages: any[] = [];
    
    if (parameters.systemPrompt) {
      messages.push({ role: 'system', content: parameters.systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const completion = await this.perplexityClient.chat.completions.create({
      model: 'pplx-70b-online',
      messages,
      temperature: parameters.temperature || 0.7,
      max_tokens: parameters.maxTokens || 2000,
      top_p: parameters.topP || 1
    });

    const response = completion.choices[0].message.content || '';
    const tokenCount = completion.usage?.total_tokens;
    
    // Estimate cost (Perplexity pricing)
    const cost = (tokenCount || 0) * 0.001 / 1000;

    return {
      response,
      tokenCount,
      cost,
      metadata: {
        model: completion.model,
        citations: completion.choices[0].message.citations || []
      }
    };
  }

  /**
   * Save test result to database
   */
  private async saveTestResult(testId: string, result: TestResult): Promise<void> {
    try {
      await prisma.platformTestResult.upsert({
        where: {
          testId_platform: {
            testId,
            platform: result.platform
          }
        },
        create: {
          testId,
          platform: result.platform,
          response: result.response,
          error: result.error,
          latencyMs: result.latencyMs,
          tokenCount: result.tokenCount,
          cost: result.cost,
          metadata: result.metadata as Prisma.JsonValue
        },
        update: {
          response: result.response,
          error: result.error,
          latencyMs: result.latencyMs,
          tokenCount: result.tokenCount,
          cost: result.cost,
          metadata: result.metadata as Prisma.JsonValue
        }
      });
    } catch (error) {
      logger.error({ error, testId, platform: result.platform }, 'Failed to save test result');
    }
  }

  /**
   * Get test by ID
   */
  async getTest(testId: string, userId: string): Promise<SandboxTest | null> {
    try {
      return await prisma.sandboxTest.findFirst({
        where: { id: testId, userId },
        include: {
          results: {
            orderBy: { platform: 'asc' }
          }
        }
      });
    } catch (error) {
      logger.error({ error, testId }, 'Failed to get test');
      throw error;
    }
  }

  /**
   * List tests for a user
   */
  async listTests(userId: string, limit = 50): Promise<SandboxTest[]> {
    try {
      return await prisma.sandboxTest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          results: {
            select: {
              platform: true,
              error: true,
              latencyMs: true,
              cost: true
            }
          }
        }
      });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list tests');
      throw error;
    }
  }

  /**
   * Delete a test
   */
  async deleteTest(testId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.sandboxTest.deleteMany({
        where: { id: testId, userId }
      });

      return result.count > 0;
    } catch (error) {
      logger.error({ error, testId }, 'Failed to delete test');
      throw error;
    }
  }

  /**
   * Compare test results across platforms
   */
  async compareResults(testId: string): Promise<any> {
    try {
      const test = await prisma.sandboxTest.findUnique({
        where: { id: testId },
        include: { results: true }
      });

      if (!test) {
        return null;
      }

      // Calculate statistics
      const stats = {
        fastestPlatform: null as string | null,
        slowestPlatform: null as string | null,
        cheapestPlatform: null as string | null,
        mostExpensivePlatform: null as string | null,
        averageLatency: 0,
        averageCost: 0,
        successRate: 0,
        platformComparison: [] as any[]
      };

      let minLatency = Infinity;
      let maxLatency = 0;
      let minCost = Infinity;
      let maxCost = 0;
      let totalLatency = 0;
      let totalCost = 0;
      let successCount = 0;

      test.results.forEach(result => {
        const comparison = {
          platform: result.platform,
          success: !result.error,
          latencyMs: result.latencyMs,
          cost: result.cost,
          responseLength: result.response?.length || 0,
          error: result.error
        };

        stats.platformComparison.push(comparison);

        if (!result.error) {
          successCount++;
        }

        totalLatency += result.latencyMs || 0;

        if (result.latencyMs && result.latencyMs < minLatency) {
          minLatency = result.latencyMs;
          stats.fastestPlatform = result.platform;
        }

        if (result.latencyMs && result.latencyMs > maxLatency) {
          maxLatency = result.latencyMs;
          stats.slowestPlatform = result.platform;
        }

        if (result.cost !== null && result.cost !== undefined) {
          totalCost += result.cost;
          
          if (result.cost < minCost) {
            minCost = result.cost;
            stats.cheapestPlatform = result.platform;
          }

          if (result.cost > maxCost) {
            maxCost = result.cost;
            stats.mostExpensivePlatform = result.platform;
          }
        }
      });

      stats.averageLatency = test.results.length > 0 
        ? Math.round(totalLatency / test.results.length) 
        : 0;
        
      stats.averageCost = test.results.length > 0 
        ? totalCost / test.results.length 
        : 0;
        
      stats.successRate = test.results.length > 0 
        ? (successCount / test.results.length) * 100 
        : 0;

      return {
        test: {
          id: test.id,
          prompt: test.testPrompt,
          platforms: test.platforms,
          status: test.status,
          createdAt: test.createdAt,
          completedAt: test.completedAt
        },
        statistics: stats
      };
    } catch (error) {
      logger.error({ error, testId }, 'Failed to compare results');
      throw error;
    }
  }

  /**
   * Execute scheduled tests
   */
  async executeScheduledTests(): Promise<void> {
    try {
      const tests = await prisma.sandboxTest.findMany({
        where: {
          status: 'scheduled',
          scheduledFor: {
            lte: new Date()
          }
        },
        take: 10 // Process up to 10 scheduled tests at a time
      });

      for (const test of tests) {
        this.executeTest(test.id).catch(error => {
          logger.error({ error, testId: test.id }, 'Failed to execute scheduled test');
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to execute scheduled tests');
    }
  }
}

export const sandboxService = new SandboxService();