import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { enforceQuota } from '../middleware/quotaEnforcement.js';
import { workflowService } from '../services/workflowService.js';
import { WorkflowStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schemas
const workflowStepSchema = z.object({
  name: z.string().min(1).max(100),
  promptTemplate: z.string().min(1).max(10000),
  contextRequired: z.array(z.string()).optional(),
  outputFormat: z.enum(['json', 'markdown', 'plain', 'code']).optional(),
  validationRules: z.array(z.object({
    type: z.enum(['required', 'minLength', 'maxLength', 'regex', 'json', 'number']),
    value: z.any().optional(),
    message: z.string().optional()
  })).optional(),
  metadata: z.any().optional()
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  steps: z.array(workflowStepSchema).min(1),
  metadata: z.any().optional()
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  steps: z.array(workflowStepSchema).min(1).optional(),
  metadata: z.any().optional()
});

const executeWorkflowSchema = z.object({
  initialContext: z.record(z.any()).optional(),
  parallelSteps: z.boolean().optional(),
  continueOnError: z.boolean().optional(),
  maxRetries: z.number().min(1).max(5).optional()
});

/**
 * Create a new workflow
 */
router.post('/', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const validatedData = createWorkflowSchema.parse(req.body);
    
    const workflow = await workflowService.createWorkflow({
      userId: req.user!.id,
      ...validatedData
    });

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    next(error);
  }
});

/**
 * Update a workflow
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const validatedData = updateWorkflowSchema.parse(req.body);
    
    const workflow = await workflowService.updateWorkflow(
      req.params.id,
      req.user!.id,
      validatedData
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    next(error);
  }
});

/**
 * Delete a workflow
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await workflowService.deleteWorkflow(
      req.params.id,
      req.user!.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single workflow
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const workflow = await workflowService.getWorkflow(
      req.params.id,
      req.user!.id
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List all workflows for the user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const status = req.query.status as WorkflowStatus | undefined;
    
    const workflows = await workflowService.listWorkflows(
      req.user!.id,
      status
    );

    res.json({
      success: true,
      data: workflows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Execute a workflow
 */
router.post('/:id/execute', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const validatedData = executeWorkflowSchema.parse(req.body);
    
    const execution = await workflowService.executeWorkflow(
      req.params.id,
      req.user!.id,
      validatedData
    );

    res.status(202).json({
      success: true,
      data: execution,
      message: 'Workflow execution started'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    next(error);
  }
});

/**
 * Get workflow execution details
 */
router.get('/executions/:executionId', authenticate, async (req, res, next) => {
  try {
    const execution = await workflowService.getExecution(
      req.params.executionId,
      req.user!.id
    );

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List executions for a workflow
 */
router.get('/:id/executions', authenticate, async (req, res, next) => {
  try {
    const executions = await workflowService.listExecutions(
      req.params.id,
      req.user!.id
    );

    res.json({
      success: true,
      data: executions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Clone a workflow
 */
router.post('/:id/clone', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      newName: z.string().min(1).max(100)
    });

    const validatedData = schema.parse(req.body);
    
    const clonedWorkflow = await workflowService.cloneWorkflow(
      req.params.id,
      req.user!.id,
      validatedData.newName
    );

    res.status(201).json({
      success: true,
      data: clonedWorkflow
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    next(error);
  }
});

/**
 * Export workflow as JSON
 */
router.get('/:id/export', authenticate, async (req, res, next) => {
  try {
    const workflowData = await workflowService.exportWorkflow(
      req.params.id,
      req.user!.id
    );

    res.json({
      success: true,
      data: workflowData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Import workflow from JSON
 */
router.post('/import', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const importedWorkflow = await workflowService.importWorkflow(
      req.user!.id,
      req.body
    );

    res.status(201).json({
      success: true,
      data: importedWorkflow
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get workflow templates (predefined workflows)
 */
router.get('/templates/available', authenticate, async (req, res, next) => {
  try {
    // Predefined workflow templates
    const templates = [
      {
        id: 'blog-post',
        name: 'Blog Post Generator',
        description: 'Generate a complete blog post with title, introduction, body, and conclusion',
        steps: [
          {
            name: 'Generate Title',
            promptTemplate: 'Create an engaging blog title about: {{topic}}',
            outputFormat: 'plain'
          },
          {
            name: 'Write Introduction',
            promptTemplate: 'Write a compelling introduction for a blog post titled "{{step1.output}}" about {{topic}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Generate Main Points',
            promptTemplate: 'List 3-5 main points to cover in a blog post about {{topic}}',
            outputFormat: 'json'
          },
          {
            name: 'Write Body',
            promptTemplate: 'Write the main body of the blog post covering these points: {{step3.output}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Write Conclusion',
            promptTemplate: 'Write a conclusion for this blog post: {{step4.output}}',
            outputFormat: 'markdown'
          }
        ]
      },
      {
        id: 'code-review',
        name: 'Code Review Assistant',
        description: 'Perform comprehensive code review with multiple analysis steps',
        steps: [
          {
            name: 'Syntax Analysis',
            promptTemplate: 'Analyze this code for syntax issues and best practices: {{code}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Security Review',
            promptTemplate: 'Review this code for security vulnerabilities: {{code}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Performance Analysis',
            promptTemplate: 'Analyze performance implications of this code: {{code}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Suggestions',
            promptTemplate: 'Based on the analysis, suggest improvements for: {{code}}\nSyntax issues: {{step1.output}}\nSecurity concerns: {{step2.output}}\nPerformance: {{step3.output}}',
            outputFormat: 'markdown'
          }
        ]
      },
      {
        id: 'research-summary',
        name: 'Research Summarizer',
        description: 'Summarize research topics with multiple perspectives',
        steps: [
          {
            name: 'Overview',
            promptTemplate: 'Provide a comprehensive overview of: {{topic}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Key Findings',
            promptTemplate: 'Extract key findings and important points from this overview: {{step1.output}}',
            outputFormat: 'json'
          },
          {
            name: 'Pros and Cons',
            promptTemplate: 'List pros and cons related to {{topic}} based on: {{step2.output}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Executive Summary',
            promptTemplate: 'Create an executive summary combining all insights: {{step1.output}}, {{step2.output}}, {{step3.output}}',
            outputFormat: 'markdown'
          }
        ]
      },
      {
        id: 'marketing-campaign',
        name: 'Marketing Campaign Creator',
        description: 'Create a complete marketing campaign with multiple assets',
        steps: [
          {
            name: 'Target Audience',
            promptTemplate: 'Define the target audience for {{product}}',
            outputFormat: 'json'
          },
          {
            name: 'Campaign Strategy',
            promptTemplate: 'Create a marketing strategy for {{product}} targeting: {{step1.output}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Social Media Posts',
            promptTemplate: 'Generate 5 social media posts for {{product}} using this strategy: {{step2.output}}',
            outputFormat: 'json'
          },
          {
            name: 'Email Template',
            promptTemplate: 'Create an email template for {{product}} campaign: {{step2.output}}',
            outputFormat: 'markdown'
          },
          {
            name: 'Call to Action',
            promptTemplate: 'Create compelling CTAs for {{product}} based on: {{step2.output}}',
            outputFormat: 'json'
          }
        ]
      }
    ];

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    next(error);
  }
});

export default router;