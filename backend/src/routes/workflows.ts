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

    return res.status(201).json({
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
    return next(error);
  }
});

/**
 * Update a workflow
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const validatedData = updateWorkflowSchema.parse(req.body);
    
    const workflow = await workflowService.updateWorkflow(
      req.params.id!,
      req.user!.id,
      validatedData
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    return res.json({
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
    return next(error);
  }
});

/**
 * Delete a workflow
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await workflowService.deleteWorkflow(
      req.params.id!,
      req.user!.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    return res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Get a single workflow
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const workflow = await workflowService.getWorkflow(
      req.params.id!,
      req.user!.id
    );

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    return res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    return next(error);
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

    return res.json({
      success: true,
      data: workflows
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Execute a workflow
 */
router.post('/:id/execute', authenticate, enforceQuota('enhance_prompt'), async (req, res, next) => {
  try {
    const validatedData = executeWorkflowSchema.parse(req.body);
    
    const execution = await workflowService.executeWorkflow(
      req.params.id!,
      req.user!.id,
      validatedData
    );

    return res.status(202).json({
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
    return next(error);
  }
});

/**
 * Get workflow execution details
 */
router.get('/executions/:executionId', authenticate, async (req, res, next) => {
  try {
    const execution = await workflowService.getExecution(
      req.params.executionId!,
      req.user!.id
    );

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    return res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * List executions for a workflow
 */
router.get('/:id/executions', authenticate, async (req, res, next) => {
  try {
    const executions = await workflowService.listExecutions(
      req.params.id!,
      req.user!.id
    );

    return res.json({
      success: true,
      data: executions
    });
  } catch (error) {
    return next(error);
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
      req.params.id!,
      req.user!.id,
      validatedData.newName
    );

    return res.status(201).json({
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
    return next(error);
  }
});

/**
 * Export workflow as JSON
 */
router.get('/:id/export', authenticate, async (req, res, next) => {
  try {
    const workflowData = await workflowService.exportWorkflow(
      req.params.id!,
      req.user!.id
    );

    return res.json({
      success: true,
      data: workflowData
    });
  } catch (error) {
    return next(error);
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

    return res.status(201).json({
      success: true,
      data: importedWorkflow
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
