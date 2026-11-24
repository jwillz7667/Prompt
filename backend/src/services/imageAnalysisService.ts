import { completeChat } from '../features/llm/index.js';
import { promptLogger } from '../utils/logger.js';

export interface PromptImageAttachment {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  analysis?: string | null;
}

const IMAGE_ANALYSIS_MAX_TOKENS = 320;
const MAX_ANALYSIS_CHARS = 1_500;
const FALLBACK_IMAGE_ANALYSIS = [
  'Use the uploaded source image as the primary visual reference.',
  'Preserve the visible subject identity, composition, environment, lighting, and color palette.',
  'Add motion, camera movement, and environmental dynamics that feel natural for the scene without changing its core layout.',
].join(' ');

/**
 * Produces a text description of an uploaded image through the LLM gateway
 * (image-capable providers only). Used where a downstream step needs words
 * rather than pixels; failures degrade to generic guidance instead of failing
 * the user's request.
 */
class ImageAnalysisService {
  async enrichAttachmentForPrompt(
    attachment: PromptImageAttachment,
    userPrompt: string,
    modality: 'text' | 'image' | 'video' | 'audio' | 'code' | '3d',
  ): Promise<PromptImageAttachment> {
    if (!attachment.dataUrl) {
      return attachment;
    }

    if (attachment.analysis?.trim()) {
      return {
        ...attachment,
        analysis: attachment.analysis.trim().slice(0, MAX_ANALYSIS_CHARS),
      };
    }

    const analysis = await this.analyzeImage(attachment, userPrompt, modality);
    return {
      ...attachment,
      analysis,
    };
  }

  private async analyzeImage(
    attachment: PromptImageAttachment,
    userPrompt: string,
    modality: 'text' | 'image' | 'video' | 'audio' | 'code' | '3d',
  ): Promise<string> {
    try {
      const modalityDirective =
        modality === 'video'
          ? 'Focus on converting this still image into a strong image-to-video prompt.'
          : 'Focus on extracting the most useful visual information for prompt rewriting.';

      const response = await completeChat({
        maxTokens: IMAGE_ANALYSIS_MAX_TOKENS,
        reasoning: 'off',
        purpose: 'image-analysis',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Analyze this uploaded image for prompt generation.',
                  'Return plain text only, no markdown fencing.',
                  'Cover these exact areas in a concise paragraph or short bullet list:',
                  '1. primary subject and identity anchors',
                  '2. composition and camera framing',
                  '3. environment, props, and background',
                  '4. lighting, color palette, and visual style',
                  '5. realistic motion opportunities and continuity anchors for video generation',
                  'Do not invent details that are not visible.',
                  `User request context: ${userPrompt.trim() || 'No additional text instructions were provided.'}`,
                  modalityDirective,
                ].join('\n'),
              },
              {
                type: 'image_url',
                image_url: { url: attachment.dataUrl, detail: 'auto' },
              },
            ],
          },
        ],
      });

      const output = response.content.trim();
      if (!output || response.finishReason === 'content_filter') {
        return FALLBACK_IMAGE_ANALYSIS;
      }

      return output.slice(0, MAX_ANALYSIS_CHARS);
    } catch (error) {
      promptLogger.warn({ error }, 'Image analysis failed; using fallback guidance');
      return FALLBACK_IMAGE_ANALYSIS;
    }
  }
}

export const imageAnalysisService = new ImageAnalysisService();
