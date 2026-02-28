/**
 * Platform Presets Service
 * 
 * Handles platform-specific optimizations, syntax validation,
 * and format conversions for various AI platforms.
 */

import { PlatformType } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformOptimization {
  platform: PlatformType;
  syntaxRules: PlatformSyntaxRules;
  limitations: PlatformLimitations;
  optimizations: PlatformOptimizationRules;
  examplePrompts?: string[];
}

export interface PlatformSyntaxRules {
  format: 'natural' | 'structured' | 'hybrid';
  parameterSyntax?: Record<string, string>;
  requiredElements?: string[];
  forbiddenElements?: string[];
  specialCharacters?: string[];
  caseConventions?: 'lower' | 'upper' | 'mixed';
}

export interface PlatformLimitations {
  maxTokens: number;
  maxCharacters?: number;
  supportedLanguages?: string[];
  supportedModalities?: string[];
  costPerToken?: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface PlatformOptimizationRules {
  preferredStructure: string[];
  keywordEmphasis?: string[];
  negativePrompting?: boolean;
  chainOfThought?: boolean;
  fewShotExamples?: boolean;
  temperature?: {
    min: number;
    max: number;
    recommended: number;
  };
}

// ============================================================================
// PLATFORM CONFIGURATIONS
// ============================================================================

const PLATFORM_CONFIGS: Record<PlatformType, PlatformOptimization> = {
  CHATGPT: {
    platform: 'CHATGPT',
    syntaxRules: {
      format: 'natural',
      forbiddenElements: ['{{', '}}', '<!--', '-->'],
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 128000,
      maxCharacters: 500000,
      supportedLanguages: ['all'],
      supportedModalities: ['text', 'code', 'vision'],
      costPerToken: 0.00003,
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 90000,
      },
    },
    optimizations: {
      preferredStructure: ['role', 'context', 'task', 'format'],
      keywordEmphasis: ['MUST', 'ALWAYS', 'NEVER'],
      chainOfThought: true,
      fewShotExamples: true,
      temperature: { min: 0, max: 2, recommended: 0.7 },
    },
    examplePrompts: [
      'You are an expert [role]. [context]. Please [task] in [format].',
    ],
  },

  CLAUDE: {
    platform: 'CLAUDE',
    syntaxRules: {
      format: 'structured',
      parameterSyntax: {
        tags: '<tag></tag>',
        emphasis: '**text**',
      },
      requiredElements: [],
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 200000,
      supportedLanguages: ['all'],
      supportedModalities: ['text', 'code', 'vision'],
      costPerToken: 0.00003,
      rateLimit: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
      },
    },
    optimizations: {
      preferredStructure: ['xml_tags', 'clear_sections', 'explicit_instructions'],
      chainOfThought: true,
      fewShotExamples: true,
      temperature: { min: 0, max: 1, recommended: 0.7 },
    },
    examplePrompts: [
      '<task>Your task description</task>\n<context>Background information</context>',
    ],
  },

  GEMINI: {
    platform: 'GEMINI',
    syntaxRules: {
      format: 'natural',
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 128000,
      supportedLanguages: ['all'],
      supportedModalities: ['text', 'code', 'vision', 'audio'],
      costPerToken: 0.000025,
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 100000,
      },
    },
    optimizations: {
      preferredStructure: ['context', 'instruction', 'constraints'],
      chainOfThought: true,
      temperature: { min: 0, max: 1, recommended: 0.7 },
    },
  },

  MIDJOURNEY: {
    platform: 'MIDJOURNEY',
    syntaxRules: {
      format: 'structured',
      parameterSyntax: {
        aspect: '--ar',
        version: '--v',
        style: '--s',
        chaos: '--c',
        quality: '--q',
        negative: '--no',
      },
      requiredElements: ['subject'],
      specialCharacters: ['::', '--'],
      caseConventions: 'lower',
    },
    limitations: {
      maxTokens: 500,
      maxCharacters: 4000,
      supportedModalities: ['image'],
      costPerToken: 0.01,
      rateLimit: {
        requestsPerMinute: 10,
        tokensPerMinute: 5000,
      },
    },
    optimizations: {
      preferredStructure: ['subject', 'style', 'medium', 'lighting', 'parameters'],
      keywordEmphasis: ['photorealistic', 'detailed', 'cinematic'],
      negativePrompting: true,
      temperature: { min: 0, max: 100, recommended: 0 },
    },
    examplePrompts: [
      'beautiful landscape, golden hour, photorealistic ::2 mountains, lake --ar 16:9 --v 6 --s 750',
    ],
  },

  DALLE: {
    platform: 'DALLE',
    syntaxRules: {
      format: 'natural',
      forbiddenElements: ['celebrity names', 'violence', 'adult content'],
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 400,
      maxCharacters: 4000,
      supportedModalities: ['image'],
      costPerToken: 0.02,
      rateLimit: {
        requestsPerMinute: 5,
        tokensPerMinute: 2000,
      },
    },
    optimizations: {
      preferredStructure: ['description', 'style', 'mood'],
      keywordEmphasis: ['detailed', 'high quality'],
      temperature: { min: 0, max: 1, recommended: 0.7 },
    },
  },

  STABLE_DIFFUSION: {
    platform: 'STABLE_DIFFUSION',
    syntaxRules: {
      format: 'structured',
      parameterSyntax: {
        weight: '(keyword:1.5)',
        negative: 'negative prompt',
        lora: '<lora:model:weight>',
      },
      specialCharacters: ['(', ')', ':', '<', '>'],
      caseConventions: 'lower',
    },
    limitations: {
      maxTokens: 350,
      maxCharacters: 2000,
      supportedModalities: ['image'],
      costPerToken: 0.005,
    },
    optimizations: {
      preferredStructure: ['subject', 'descriptors', 'style', 'quality'],
      keywordEmphasis: ['masterpiece', 'best quality', 'highly detailed'],
      negativePrompting: true,
    },
    examplePrompts: [
      '(masterpiece:1.2), best quality, highly detailed, subject, style',
    ],
  },

  SORA: {
    platform: 'SORA',
    syntaxRules: {
      format: 'natural',
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 500,
      maxCharacters: 4000,
      supportedModalities: ['video'],
      costPerToken: 0.05,
    },
    optimizations: {
      preferredStructure: ['scene', 'action', 'style', 'duration'],
      keywordEmphasis: ['cinematic', 'smooth', 'realistic'],
    },
  },

  RUNWAY: {
    platform: 'RUNWAY',
    syntaxRules: {
      format: 'natural',
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 350,
      maxCharacters: 2000,
      supportedModalities: ['video', 'image'],
      costPerToken: 0.03,
    },
    optimizations: {
      preferredStructure: ['subject', 'motion', 'style'],
      keywordEmphasis: ['smooth motion', 'cinematic'],
    },
  },

  SUNO: {
    platform: 'SUNO',
    syntaxRules: {
      format: 'structured',
      parameterSyntax: {
        genre: '[Genre: ]',
        mood: '[Mood: ]',
        instruments: '[Instruments: ]',
        tempo: '[Tempo: ]',
        key: '[Key: ]',
      },
      requiredElements: ['lyrics or instrumental'],
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 300,
      maxCharacters: 3000,
      supportedModalities: ['audio', 'music'],
      costPerToken: 0.01,
      rateLimit: {
        requestsPerMinute: 10,
        tokensPerMinute: 3000,
      },
    },
    optimizations: {
      preferredStructure: ['genre', 'style', 'mood', 'lyrics', 'structure'],
      keywordEmphasis: ['verse', 'chorus', 'bridge', 'instrumental'],
      temperature: { min: 0, max: 1, recommended: 0.8 },
    },
    examplePrompts: [
      '[Genre: Pop Rock] [Mood: Uplifting] [Tempo: 120 BPM]\n\n[Verse 1]\nYour lyrics here...\n\n[Chorus]\nCatchy chorus...',
    ],
  },

  UDIO: {
    platform: 'UDIO',
    syntaxRules: {
      format: 'hybrid',
      parameterSyntax: {
        style: 'Style:',
        mood: 'Mood:',
        vocal: 'Vocal:',
      },
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 350,
      maxCharacters: 3000,
      supportedModalities: ['audio', 'music'],
      costPerToken: 0.01,
    },
    optimizations: {
      preferredStructure: ['style_tags', 'lyrics', 'instrumental_notes'],
      keywordEmphasis: ['emotional', 'energetic', 'melodic'],
    },
  },

  PERPLEXITY: {
    platform: 'PERPLEXITY',
    syntaxRules: {
      format: 'natural',
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 128000,
      supportedLanguages: ['all'],
      supportedModalities: ['text'],
      costPerToken: 0.001,
      rateLimit: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
      },
    },
    optimizations: {
      preferredStructure: ['question', 'context', 'constraints'],
      chainOfThought: true,
      temperature: { min: 0, max: 1, recommended: 0.5 },
    },
  },

  GITHUB_COPILOT: {
    platform: 'GITHUB_COPILOT',
    syntaxRules: {
      format: 'structured',
      parameterSyntax: {
        comment: '// or #',
        docstring: '/** */',
      },
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 8000,
      supportedLanguages: ['all'],
      supportedModalities: ['code'],
      costPerToken: 0.00001,
    },
    optimizations: {
      preferredStructure: ['comment', 'context', 'function_signature'],
      chainOfThought: false,
      fewShotExamples: true,
    },
  },

  CUSTOM: {
    platform: 'CUSTOM',
    syntaxRules: {
      format: 'natural',
      caseConventions: 'mixed',
    },
    limitations: {
      maxTokens: 100000,
      supportedLanguages: ['all'],
      supportedModalities: ['text', 'code', 'image', 'video', 'audio'],
    },
    optimizations: {
      preferredStructure: ['instruction', 'context', 'output_format'],
      chainOfThought: true,
      fewShotExamples: true,
    },
  },
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get platform preset by type
 */
export async function getPlatformPreset(platform: PlatformType) {
  try {
    // First try to get from database
    const dbPreset = await prisma.platformPreset.findFirst({
      where: { platform, isOfficial: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (dbPreset) {
      return {
        ...dbPreset,
        syntaxRules: dbPreset.formatGuidelines as unknown as PlatformSyntaxRules,
        limitations: dbPreset.tokenLimits as unknown as PlatformLimitations,
        optimizations: {} as PlatformOptimizationRules,
      };
    }

    // Fall back to hardcoded config
    return PLATFORM_CONFIGS[platform];
  } catch (error) {
    logger.error({ platform, error }, 'Failed to get platform preset');
    return PLATFORM_CONFIGS[platform];
  }
}

/**
 * Validate prompt for specific platform
 */
export function validatePromptForPlatform(
  prompt: string,
  platform: PlatformType
): { isValid: boolean; warnings: string[]; errors: string[] } {
  const config = PLATFORM_CONFIGS[platform];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check length limitations
  if (config.limitations.maxCharacters && prompt.length > config.limitations.maxCharacters) {
    errors.push(`Prompt exceeds maximum character limit of ${config.limitations.maxCharacters}`);
  }

  // Check forbidden elements
  if (config.syntaxRules.forbiddenElements) {
    for (const forbidden of config.syntaxRules.forbiddenElements) {
      if (prompt.includes(forbidden)) {
        errors.push(`Contains forbidden element: "${forbidden}"`);
      }
    }
  }

  // Check required elements for structured formats
  if (config.syntaxRules.requiredElements) {
    for (const required of config.syntaxRules.requiredElements) {
      if (!prompt.toLowerCase().includes(required.toLowerCase())) {
        warnings.push(`Missing recommended element: "${required}"`);
      }
    }
  }

  // Platform-specific validations
  switch (platform) {
    case 'MIDJOURNEY':
      // Check for parameter syntax
      if (!prompt.includes('--')) {
        warnings.push('Consider adding parameters like --ar, --v, --s for better control');
      }
      break;

    case 'STABLE_DIFFUSION':
      // Check for weight syntax
      if (!prompt.includes('(') && !prompt.includes(':')) {
        warnings.push('Consider using weight syntax (keyword:weight) for emphasis');
      }
      break;

    case 'SUNO':
      // Check for structure markers
      if (!prompt.includes('[') && !prompt.includes(']')) {
        warnings.push('Consider using structure markers [Verse], [Chorus], etc.');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Optimize prompt for specific platform
 */
export function optimizePromptForPlatform(
  prompt: string,
  platform: PlatformType,
  options?: {
    tone?: string;
    style?: string;
    quality?: 'draft' | 'standard' | 'high';
  }
): string {
  const config = PLATFORM_CONFIGS[platform];
  let optimizedPrompt = prompt;

  switch (platform) {
    case 'MIDJOURNEY':
      // Add default parameters if missing
      if (!optimizedPrompt.includes('--v')) {
        optimizedPrompt += ' --v 6';
      }
      if (!optimizedPrompt.includes('--ar')) {
        optimizedPrompt += ' --ar 16:9';
      }
      if (options?.quality === 'high' && !optimizedPrompt.includes('--q')) {
        optimizedPrompt += ' --q 2';
      }
      break;

    case 'STABLE_DIFFUSION':
      // Add quality keywords if missing
      const qualityKeywords = ['masterpiece', 'best quality', 'highly detailed'];
      const hasQualityKeywords = qualityKeywords.some(kw => 
        optimizedPrompt.toLowerCase().includes(kw)
      );
      if (!hasQualityKeywords && options?.quality !== 'draft') {
        optimizedPrompt = `(masterpiece:1.2), best quality, ${optimizedPrompt}`;
      }
      break;

    case 'CLAUDE':
      // Structure with XML tags
      if (!optimizedPrompt.includes('<') && !optimizedPrompt.includes('>')) {
        optimizedPrompt = `<task>\n${optimizedPrompt}\n</task>`;
      }
      break;

    case 'SUNO':
      // Add genre and mood if missing
      if (!optimizedPrompt.includes('[Genre:') && options?.style) {
        optimizedPrompt = `[Genre: ${options.style}]\n${optimizedPrompt}`;
      }
      if (!optimizedPrompt.includes('[Mood:') && options?.tone) {
        optimizedPrompt = `[Mood: ${options.tone}]\n${optimizedPrompt}`;
      }
      break;

    case 'CHATGPT':
      // Add role and context structure if missing
      if (!optimizedPrompt.toLowerCase().includes('you are')) {
        optimizedPrompt = `You are a helpful assistant. ${optimizedPrompt}`;
      }
      break;
  }

  // Apply case conventions
  if (config.syntaxRules.caseConventions === 'lower') {
    // Only lowercase the descriptive parts, not the whole prompt
    const parts = optimizedPrompt.split(/(\-\-\w+|\[\w+:|\:\:)/);
    optimizedPrompt = parts.map((part, i) => 
      i % 2 === 0 ? part.toLowerCase() : part
    ).join('');
  }

  return optimizedPrompt.trim();
}

/**
 * Get cost estimation for prompt on platform
 */
export function estimatePlatformCost(
  prompt: string,
  platform: PlatformType
): { tokens: number; estimatedCost: number } {
  const config = PLATFORM_CONFIGS[platform];
  
  // Rough estimation: 4 characters per token
  const tokens = Math.ceil(prompt.length / 4);
  const estimatedCost = tokens * (config.limitations.costPerToken || 0);

  return { tokens, estimatedCost };
}

/**
 * Get all available platforms
 */
export function getAvailablePlatforms() {
  return Object.values(PlatformType);
}

/**
 * Get platform capabilities
 */
export function getPlatformCapabilities(platform: PlatformType) {
  const config = PLATFORM_CONFIGS[platform];
  return {
    platform,
    modalities: config.limitations.supportedModalities || [],
    maxTokens: config.limitations.maxTokens,
    hasNegativePrompting: config.optimizations.negativePrompting || false,
    hasParameterSupport: !!config.syntaxRules.parameterSyntax,
    costPerToken: config.limitations.costPerToken,
  };
}

/**
 * Save user platform settings
 */
export async function saveUserPlatformSettings(
  userId: string,
  presetId: string,
  settings: {
    customSettings?: any;
    isDefault?: boolean;
  }
) {
  return prisma.userPlatformSettings.upsert({
    where: {
      userId_presetId: { userId, presetId },
    },
    update: {
      ...(settings.customSettings !== undefined && { customSettings: settings.customSettings }),
      ...(settings.isDefault !== undefined && { isDefault: settings.isDefault }),
    },
    create: {
      userId,
      presetId,
      customSettings: settings.customSettings,
      isDefault: settings.isDefault ?? false,
    },
  });
}

/**
 * Get user platform settings
 */
export async function getUserPlatformSettings(userId: string) {
  return prisma.userPlatformSettings.findMany({
    where: { userId },
    include: {
      preset: true,
    },
  });
}