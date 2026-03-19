import { 
  Workflow, 
  WorkflowStep, 
  WorkflowExecution, 
  WorkflowStatus,
  Prisma 
} from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { enhancePrompt } from './deepseekService.js';
import { contextService } from './contextService.js';
import Handlebars from 'handlebars';
import { z } from 'zod';
import pLimit from 'p-limit';

interface WorkflowCreateData {
  userId: string;
  name: string;
  description?: string;
  steps: WorkflowStepData[];
  metadata?: any;
}

interface WorkflowStepData {
  name: string;
  promptTemplate: string;
  contextRequired?: string[];
  outputFormat?: string;
  validationRules?: ValidationRule[];
  metadata?: any;
}

interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'regex' | 'json' | 'number';
  value?: any;
  message?: string;
}

interface WorkflowExecutionOptions {
  initialContext?: Record<string, any>;
  parallelSteps?: boolean;
  continueOnError?: boolean;
  maxRetries?: number;
}

interface StepExecutionResult {
  stepOrder: number;
  stepName: string;
  input: string;
  output: string;
  success: boolean;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  tokens?: number;
  metadata?: any;
}

class WorkflowService {
  private templateEngine: typeof Handlebars;
  private concurrencyLimit = pLimit(3);

  constructor() {
    this.templateEngine = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Register custom Handlebars helpers for advanced templating
   */
  private registerHelpers() {
    // Conditional helper
    this.templateEngine.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: any) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    // Array iteration with index
    this.templateEngine.registerHelper('eachWithIndex', function(context: any[], options: any) {
      let ret = '';
      context.forEach((item, index) => {
        ret += options.fn({ ...item, index });
      });
      return ret;
    });

    // String manipulation
    this.templateEngine.registerHelper('uppercase', (str: string) => str?.toUpperCase());
    this.templateEngine.registerHelper('lowercase', (str: string) => str?.toLowerCase());
    this.templateEngine.registerHelper('truncate', (str: string, length: number) => 
      str?.substring(0, length) + (str?.length > length ? '...' : '')
    );

    // JSON helpers
    this.templateEngine.registerHelper('json', (obj: any) => JSON.stringify(obj, null, 2));
    this.templateEngine.registerHelper('jsonParse', (str: string) => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    });
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(data: WorkflowCreateData): Promise<Workflow> {
    try {
      // Validate steps
      if (!data.steps || data.steps.length === 0) {
        throw new Error('Workflow must have at least one step');
      }

      // Create workflow with steps
      const workflow = await prisma.workflow.create({
        data: {
          userId: data.userId,
          name: data.name,
          description: data.description,
          status: WorkflowStatus.DRAFT,
          metadata: data.metadata as unknown as Prisma.InputJsonValue,
          steps: {
            create: data.steps.map((step, index) => ({
              stepOrder: index + 1,
              name: step.name,
              promptTemplate: step.promptTemplate,
              contextRequired: step.contextRequired || [],
              outputFormat: step.outputFormat,
              validationRules: (step.validationRules ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
              metadata: step.metadata as unknown as Prisma.InputJsonValue
            }))
          }
        },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' }
          }
        }
      });

      logger.info({ workflowId: workflow.id }, 'Workflow created');
      return workflow;
    } catch (error) {
      logger.error({ error }, 'Failed to create workflow');
      throw error;
    }
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    data: Partial<WorkflowCreateData>
  ): Promise<Workflow | null> {
    try {
      // Verify ownership
      const existing = await prisma.workflow.findFirst({
        where: { id: workflowId, userId }
      });

      if (!existing) {
        return null;
      }

      // Update workflow
      const workflow = await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.metadata && { metadata: data.metadata as Prisma.JsonValue })
        },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' }
          }
        }
      });

      // Update steps if provided
      if (data.steps) {
        // Delete existing steps
        await prisma.workflowStep.deleteMany({
          where: { workflowId }
        });

        // Create new steps
        await prisma.workflowStep.createMany({
          data: data.steps.map((step, index) => ({
            workflowId,
            stepOrder: index + 1,
            name: step.name,
            promptTemplate: step.promptTemplate,
            contextRequired: step.contextRequired || [],
            outputFormat: step.outputFormat,
            validationRules: (step.validationRules ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
            metadata: step.metadata as unknown as Prisma.InputJsonValue
          }))
        });
      }

      logger.info({ workflowId }, 'Workflow updated');
      return workflow;
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to update workflow');
      throw error;
    }
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.workflow.deleteMany({
        where: { id: workflowId, userId }
      });

      return result.count > 0;
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to delete workflow');
      throw error;
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string, userId: string): Promise<Workflow | null> {
    try {
      return await prisma.workflow.findFirst({
        where: { id: workflowId, userId },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' }
          },
          executions: {
            take: 5,
            orderBy: { startedAt: 'desc' }
          }
        }
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to get workflow');
      throw error;
    }
  }

  /**
   * List workflows for a user
   */
  async listWorkflows(userId: string, status?: WorkflowStatus): Promise<Workflow[]> {
    try {
      const where: Prisma.WorkflowWhereInput = {
        userId,
        ...(status && { status })
      };

      return await prisma.workflow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' }
          },
          _count: {
            select: { executions: true }
          }
        }
      });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list workflows');
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    userId: string,
    options: WorkflowExecutionOptions = {}
  ): Promise<WorkflowExecution> {
    try {
      // Get workflow with steps
      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, userId },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' }
          }
        }
      });

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.status === WorkflowStatus.ARCHIVED) {
        throw new Error('Cannot execute archived workflow');
      }

      // Create execution record
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          userId,
          status: 'running',
          currentStep: 0,
          metadata: {
            options,
            startContext: options.initialContext || {}
          } as unknown as Prisma.InputJsonValue
        }
      });

      // Execute workflow asynchronously
      this.runWorkflow(execution.id, workflow, options).catch(error => {
        logger.error({ error, executionId: execution.id }, 'Workflow execution failed');
      });

      return execution;
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to start workflow execution');
      throw error;
    }
  }

  /**
   * Run workflow execution
   */
  private async runWorkflow(
    executionId: string,
    workflow: Workflow & { steps: WorkflowStep[] },
    options: WorkflowExecutionOptions
  ): Promise<void> {
    const context: Record<string, any> = {
      ...options.initialContext,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        executionId
      }
    };

    const stepResults: StepExecutionResult[] = [];

    try {
      for (const step of workflow.steps) {
        // Update current step
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: { currentStep: step.stepOrder }
        });

        // Load required context
        if (step.contextRequired.length > 0) {
          await this.loadRequiredContext(step, context, workflow.userId);
        }

        // Execute step
        const result = await this.executeStep(step, context, options);
        stepResults.push(result);

        // Add result to context for next steps
        context[`step${step.stepOrder}`] = {
          name: step.name,
          output: result.output,
          metadata: result.metadata
        };

        if (!result.success && !options.continueOnError) {
          throw new Error(`Step ${step.stepOrder} (${step.name}) failed: ${result.error}`);
        }
      }

      // Mark execution as completed
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          stepResults: stepResults as unknown as Prisma.InputJsonValue
        }
      });

      logger.info({ executionId }, 'Workflow execution completed');
    } catch (error: any) {
      // Mark execution as failed
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          error: error.message,
          stepResults: stepResults as unknown as Prisma.InputJsonValue
        }
      });

      logger.error({ error, executionId }, 'Workflow execution failed');
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    context: Record<string, any>,
    options: WorkflowExecutionOptions
  ): Promise<StepExecutionResult> {
    const startedAt = new Date();
    
    try {
      // Render prompt template with context
      const template = this.templateEngine.compile(step.promptTemplate);
      const renderedPrompt = template(context);

      // Enhance prompt with AI
      let output: string;
      let tokens = 0;
      let metadata: any = {};

      const maxRetries = options.maxRetries || 3;
      let retryCount = 0;
      let lastError: Error | null = null;

      while (retryCount < maxRetries) {
        try {
          const enhanceResult = await enhancePrompt({
            prompt: renderedPrompt,
            tier: 'standard',
            model: 'deepseek-chat',
            temperature: 0.7,
            maxTokens: 4096,
            modality: 'text'
          });

          output = enhanceResult.enhancedPrompt;
          tokens = enhanceResult.totalTokens;
          metadata = { model: enhanceResult.model, processingMs: enhanceResult.processingMs };

          // Validate output if rules are defined
          if (step.validationRules) {
            this.validateOutput(output, step.validationRules as unknown as ValidationRule[]);
          }

          // Format output if specified
          if (step.outputFormat) {
            output = this.formatOutput(output, step.outputFormat);
          }

          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          retryCount++;
          
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
          }
        }
      }

      if (retryCount >= maxRetries && lastError) {
        throw lastError;
      }

      const completedAt = new Date();

      return {
        stepOrder: step.stepOrder,
        stepName: step.name,
        input: renderedPrompt,
        output: output!,
        success: true,
        startedAt,
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        tokens,
        metadata
      };
    } catch (error: any) {
      const completedAt = new Date();

      return {
        stepOrder: step.stepOrder,
        stepName: step.name,
        input: '',
        output: '',
        success: false,
        error: error.message,
        startedAt,
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime()
      };
    }
  }

  /**
   * Load required context for a step
   */
  private async loadRequiredContext(
    step: WorkflowStep,
    context: Record<string, any>,
    userId: string
  ): Promise<void> {
    for (const contextId of step.contextRequired) {
      if (!context[contextId]) {
        // Try to load from database
        const projectContext = await contextService.getContext(contextId, userId);
        if (projectContext) {
          context[contextId] = projectContext.contextData;
        }
      }
    }
  }

  /**
   * Validate step output against rules
   */
  private validateOutput(output: string, rules: ValidationRule[]): void {
    for (const rule of rules) {
      switch (rule.type) {
        case 'required':
          if (!output || output.trim().length === 0) {
            throw new Error(rule.message || 'Output is required');
          }
          break;

        case 'minLength':
          if (output.length < rule.value) {
            throw new Error(rule.message || `Output must be at least ${rule.value} characters`);
          }
          break;

        case 'maxLength':
          if (output.length > rule.value) {
            throw new Error(rule.message || `Output must not exceed ${rule.value} characters`);
          }
          break;

        case 'regex':
          const regex = new RegExp(rule.value);
          if (!regex.test(output)) {
            throw new Error(rule.message || 'Output does not match required pattern');
          }
          break;

        case 'json':
          try {
            JSON.parse(output);
          } catch {
            throw new Error(rule.message || 'Output must be valid JSON');
          }
          break;

        case 'number':
          if (isNaN(Number(output))) {
            throw new Error(rule.message || 'Output must be a number');
          }
          break;
      }
    }
  }

  /**
   * Format output according to specified format
   */
  private formatOutput(output: string, format: string): string {
    switch (format) {
      case 'json':
        try {
          const parsed = JSON.parse(output);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Try to extract JSON from text
          const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              return JSON.stringify(parsed, null, 2);
            } catch {}
          }
          return output;
        }

      case 'markdown':
        // Ensure proper markdown formatting
        return output.trim();

      case 'plain':
        // Strip markdown and formatting
        return output
          .replace(/[*_~`#]/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .trim();

      case 'code':
        // Extract code blocks
        const codeMatch = output.match(/```[\s\S]*?```/g);
        if (codeMatch) {
          return codeMatch
            .map(block => block.replace(/```\w*\n?/, '').replace(/```/, ''))
            .join('\n\n');
        }
        return output;

      default:
        return output;
    }
  }

  /**
   * Get execution details
   */
  async getExecution(executionId: string, userId: string): Promise<WorkflowExecution | null> {
    try {
      return await prisma.workflowExecution.findFirst({
        where: { id: executionId, userId },
        include: {
          workflow: {
            include: {
              steps: {
                orderBy: { stepOrder: 'asc' }
              }
            }
          }
        }
      });
    } catch (error) {
      logger.error({ error, executionId }, 'Failed to get execution');
      throw error;
    }
  }

  /**
   * List executions for a workflow
   */
  async listExecutions(workflowId: string, userId: string): Promise<WorkflowExecution[]> {
    try {
      return await prisma.workflowExecution.findMany({
        where: { workflowId, userId },
        orderBy: { startedAt: 'desc' },
        take: 50
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to list executions');
      throw error;
    }
  }

  /**
   * Clone a workflow
   */
  async cloneWorkflow(workflowId: string, userId: string, newName: string): Promise<Workflow> {
    try {
      const original = await prisma.workflow.findFirst({
        where: { id: workflowId, userId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } }
        }
      });
      if (!original) {
        throw new Error('Workflow not found');
      }

      return await this.createWorkflow({
        userId,
        name: newName,
        description: `Cloned from: ${original.name}`,
        steps: original.steps.map(step => ({
          name: step.name,
          promptTemplate: step.promptTemplate,
          contextRequired: step.contextRequired,
          outputFormat: step.outputFormat || undefined,
          validationRules: (step.validationRules as any) || undefined,
          metadata: step.metadata
        })),
        metadata: {
          ...original.metadata as any,
          clonedFrom: workflowId,
          clonedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to clone workflow');
      throw error;
    }
  }

  /**
   * Export workflow as JSON
   */
  async exportWorkflow(workflowId: string, userId: string): Promise<any> {
    try {
      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, userId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } }
        }
      });
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      return {
        name: workflow.name,
        description: workflow.description,
        steps: workflow.steps.map(step => ({
          name: step.name,
          promptTemplate: step.promptTemplate,
          contextRequired: step.contextRequired,
          outputFormat: step.outputFormat,
          validationRules: step.validationRules,
          metadata: step.metadata
        })),
        metadata: workflow.metadata,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to export workflow');
      throw error;
    }
  }

  /**
   * Import workflow from JSON
   */
  async importWorkflow(userId: string, workflowData: any): Promise<Workflow> {
    try {
      // Validate workflow data
      if (!workflowData.name || !workflowData.steps || !Array.isArray(workflowData.steps)) {
        throw new Error('Invalid workflow data');
      }

      return await this.createWorkflow({
        userId,
        name: `${workflowData.name} (Imported)`,
        description: workflowData.description,
        steps: workflowData.steps,
        metadata: {
          ...workflowData.metadata,
          importedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to import workflow');
      throw error;
    }
  }
}

export const workflowService = new WorkflowService();
