/**
 * API Documentation Routes
 *
 * Serves OpenAPI 3.1 specification and related documentation.
 */

import { Router, Response, Request } from 'express';
import YAML from 'yaml';

export const docsRouter = Router();

// ============================================================================
// OPENAPI SPECIFICATION
// ============================================================================

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Promptomize API',
    description: 'Enterprise API for prompt optimization and enhancement',
    version: '1.0.0',
    contact: {
      name: 'Promptomize Support',
      url: 'https://promptomize.app/support',
      email: 'api@promptomize.app',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: 'https://api.promptomize.app/api/v1',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000/api/v1',
      description: 'Development server',
    },
  ],
  security: [
    {
      ApiKeyAuth: [],
    },
  ],
  tags: [
    {
      name: 'Enhance',
      description: 'Prompt enhancement endpoints',
    },
    {
      name: 'Usage',
      description: 'Usage and quota information',
    },
    {
      name: 'Models',
      description: 'Available modalities and options',
    },
    {
      name: 'History',
      description: 'Enhancement history (requires read_history permission)',
    },
  ],
  paths: {
    '/public/enhance': {
      post: {
        tags: ['Enhance'],
        summary: 'Enhance a prompt',
        description: 'Optimize a prompt using AI-powered enhancement. Supports multiple modalities and customization options.',
        operationId: 'enhancePrompt',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EnhanceRequest' },
              examples: {
                basic: {
                  summary: 'Basic text enhancement',
                  value: {
                    prompt: 'Write a professional email to schedule a meeting',
                    modality: 'text',
                  },
                },
                image: {
                  summary: 'Image generation prompt',
                  value: {
                    prompt: 'A serene mountain landscape at sunset',
                    modality: 'image',
                    tone: 'creative',
                    length: 'detailed',
                  },
                },
                code: {
                  summary: 'Code assistance prompt',
                  value: {
                    prompt: 'Create a React hook for debouncing input',
                    modality: 'code',
                    tone: 'technical',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Successfully enhanced prompt',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EnhanceResponse' },
              },
            },
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationError' },
              },
            },
          },
          401: {
            description: 'Invalid or missing API key',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthError' },
              },
            },
          },
          429: {
            description: 'Rate limit or quota exceeded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitError' },
              },
            },
          },
          500: {
            description: 'Enhancement failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServerError' },
              },
            },
          },
        },
      },
    },
    '/public/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Get current usage and quota',
        description: 'Returns current API tier, usage statistics, and remaining quota.',
        operationId: 'getUsage',
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Usage information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsageResponse' },
              },
            },
          },
          401: {
            description: 'Invalid or missing API key',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthError' },
              },
            },
          },
        },
      },
    },
    '/public/models': {
      get: {
        tags: ['Models'],
        summary: 'List available modalities and options',
        description: 'Returns all available modalities, tones, and lengths for prompt enhancement.',
        operationId: 'getModels',
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Available options',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ModelsResponse' },
              },
            },
          },
        },
      },
    },
    '/public/history': {
      get: {
        tags: ['History'],
        summary: 'Get enhancement history',
        description: 'Returns paginated list of past prompt enhancements. Requires read_history permission.',
        operationId: 'getHistory',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            description: 'Items per page',
          },
          {
            name: 'modality',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['text', 'image', 'video', 'audio', 'code', '3d'],
            },
            description: 'Filter by modality',
          },
        ],
        responses: {
          200: {
            description: 'Enhancement history',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HistoryResponse' },
              },
            },
          },
          403: {
            description: 'Missing read_history permission',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PermissionError' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authentication. Get yours at https://promptomize.app/developers/keys',
      },
    },
    schemas: {
      EnhanceRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 100000,
            description: 'The prompt to enhance',
          },
          modality: {
            type: 'string',
            enum: ['text', 'image', 'video', 'audio', 'code', '3d'],
            default: 'text',
            description: 'Target modality for the prompt',
          },
          tone: {
            type: 'string',
            enum: ['professional', 'casual', 'academic', 'creative', 'technical', 'friendly'],
            description: 'Desired tone of the enhancement',
          },
          length: {
            type: 'string',
            enum: ['concise', 'standard', 'detailed'],
            description: 'Desired detail level',
          },
          maxTokens: {
            type: 'integer',
            minimum: 1,
            maximum: 8192,
            description: 'Maximum tokens for the response',
          },
          customInstructions: {
            type: 'string',
            maxLength: 2000,
            description: 'Additional instructions for enhancement',
          },
          stream: {
            type: 'boolean',
            default: false,
            description: 'Enable streaming response',
          },
        },
      },
      EnhanceResponse: {
        type: 'object',
        properties: {
          enhancedPrompt: {
            type: 'string',
            description: 'The enhanced prompt',
          },
          usage: {
            $ref: '#/components/schemas/TokenUsage',
          },
          quota: {
            $ref: '#/components/schemas/QuotaInfo',
          },
        },
      },
      UsageResponse: {
        type: 'object',
        properties: {
          tier: {
            type: 'string',
            enum: ['API_FREE', 'API_STARTER', 'API_PRO', 'API_ENTERPRISE'],
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED'],
          },
          quota: {
            $ref: '#/components/schemas/QuotaInfo',
          },
          rateLimit: {
            type: 'object',
            properties: {
              requestsPerMinute: { type: 'integer' },
            },
          },
          features: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      ModelsResponse: {
        type: 'object',
        properties: {
          modalities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          tones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          lengths: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          limits: {
            type: 'object',
            properties: {
              maxPromptLength: { type: 'integer' },
              maxTokens: { type: 'integer' },
              maxCustomInstructions: { type: 'integer' },
            },
          },
        },
      },
      HistoryResponse: {
        type: 'object',
        properties: {
          prompts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                originalPrompt: { type: 'string' },
                enhancedPrompt: { type: 'string' },
                modality: { type: 'string' },
                usage: { $ref: '#/components/schemas/TokenUsage' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          pagination: {
            $ref: '#/components/schemas/Pagination',
          },
        },
      },
      TokenUsage: {
        type: 'object',
        properties: {
          inputTokens: { type: 'integer' },
          outputTokens: { type: 'integer' },
          totalTokens: { type: 'integer' },
          processingMs: { type: 'integer' },
        },
      },
      QuotaInfo: {
        type: 'object',
        properties: {
          used: { type: 'integer' },
          limit: { oneOf: [{ type: 'integer' }, { type: 'string', enum: ['unlimited'] }] },
          remaining: { oneOf: [{ type: 'integer' }, { type: 'string', enum: ['unlimited'] }] },
          periodStart: { type: 'string', format: 'date-time' },
          periodEnd: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['VALIDATION_ERROR'] },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      AuthError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['MISSING_API_KEY', 'INVALID_API_KEY'] },
          message: { type: 'string' },
        },
      },
      RateLimitError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED'] },
          message: { type: 'string' },
          retryAfter: { type: 'integer', description: 'Seconds until retry is allowed' },
        },
      },
      PermissionError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['PERMISSION_DENIED'] },
          required: { type: 'string' },
          granted: { type: 'array', items: { type: 'string' } },
        },
      },
      ServerError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
};

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /openapi.json - OpenAPI 3.1 specification (JSON)
 */
docsRouter.get('/openapi.json', (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

/**
 * GET /openapi.yaml - OpenAPI 3.1 specification (YAML)
 */
docsRouter.get('/openapi.yaml', (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(YAML.stringify(openApiSpec));
});

/**
 * GET / - Documentation overview
 */
docsRouter.get('/', (_req: Request, res: Response): void => {
  res.json({
    title: 'Promptomize API Documentation',
    version: '1.0.0',
    endpoints: {
      openapi: {
        json: '/api/v1/docs/openapi.json',
        yaml: '/api/v1/docs/openapi.yaml',
      },
    },
    quickStart: {
      description: 'Get started with the Promptomize API',
      steps: [
        {
          step: 1,
          title: 'Get an API Key',
          description: 'Create an API key at https://promptomize.app/developers/keys',
        },
        {
          step: 2,
          title: 'Make your first request',
          code: `curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: pk_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Write a professional email", "modality": "text"}'`,
        },
        {
          step: 3,
          title: 'Check your usage',
          code: `curl https://api.promptomize.app/api/v1/public/usage \\
  -H "X-API-Key: pk_live_your_key_here"`,
        },
      ],
    },
    codeExamples: {
      curl: `curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: pk_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Write a professional email", "modality": "text"}'`,
      python: `import requests

response = requests.post(
    "https://api.promptomize.app/api/v1/public/enhance",
    headers={"X-API-Key": "pk_live_your_key_here"},
    json={"prompt": "Write a professional email", "modality": "text"}
)
print(response.json()["enhancedPrompt"])`,
      javascript: `const response = await fetch("https://api.promptomize.app/api/v1/public/enhance", {
  method: "POST",
  headers: {
    "X-API-Key": "pk_live_your_key_here",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ prompt: "Write a professional email", modality: "text" })
});
const { enhancedPrompt } = await response.json();
console.log(enhancedPrompt);`,
    },
    rateLimits: {
      description: 'Rate limits vary by tier',
      tiers: [
        { tier: 'API_FREE', requestsPerMinute: 10, monthlyRequests: 100 },
        { tier: 'API_STARTER', requestsPerMinute: 60, monthlyRequests: 1000 },
        { tier: 'API_PRO', requestsPerMinute: 100, monthlyRequests: 10000 },
        { tier: 'API_ENTERPRISE', requestsPerMinute: 1000, monthlyRequests: 'unlimited' },
      ],
    },
    headers: {
      request: {
        'X-API-Key': 'Your API key (required)',
        'Content-Type': 'application/json',
      },
      response: {
        'X-RateLimit-Limit': 'Maximum requests per minute',
        'X-RateLimit-Remaining': 'Remaining requests in current window',
        'X-RateLimit-Reset': 'Unix timestamp when limit resets',
        'X-Quota-Limit': 'Monthly request quota',
        'X-Quota-Remaining': 'Remaining monthly requests',
        'X-Quota-Reset': 'ISO date when quota resets',
      },
    },
    support: {
      documentation: 'https://promptomize.app/docs',
      email: 'api@promptomize.app',
      status: 'https://status.promptomize.app',
    },
  });
});
