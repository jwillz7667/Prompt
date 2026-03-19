import { z } from 'zod';
import { enrichModalityCapabilities } from '../shared/modalityDetails.js';
const capabilityItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
});
const capabilitiesSchema = z.object({
    modalities: z.array(capabilityItemSchema),
    tones: z.array(capabilityItemSchema),
    lengths: z.array(capabilityItemSchema),
    limits: z.object({
        maxPromptLength: z.number().int(),
        maxTokens: z.number().int(),
        maxCustomInstructions: z.number().int(),
    }),
});
const usageSchema = z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    totalTokens: z.number().int(),
    processingMs: z.number().int(),
});
const quotaSchema = z.object({
    used: z.number().int(),
    limit: z.union([z.number(), z.string()]),
    remaining: z.union([z.number(), z.string()]),
});
const enhanceResponseSchema = z.object({
    enhancedPrompt: z.string(),
    usage: usageSchema.optional(),
    quota: quotaSchema.optional(),
});
const CAPABILITY_TTL_MS = 5 * 60 * 1000;
let capabilitiesCache = null;
function withAuthHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
    };
}
async function readJsonOrThrow(response) {
    const text = await response.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`Unexpected non-JSON response from Promptomize (${response.status})`);
    }
}
function buildErrorMessage(status, payload, fallback) {
    if (payload && typeof payload === 'object') {
        const maybeMessage = payload.message;
        if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
            return maybeMessage;
        }
        const maybeError = payload.error;
        if (typeof maybeError === 'string' && maybeError.length > 0) {
            return maybeError;
        }
    }
    return `${fallback} (${status})`;
}
export async function fetchCapabilities(options) {
    const now = Date.now();
    if (capabilitiesCache && capabilitiesCache.expiresAt > now) {
        return capabilitiesCache.value;
    }
    const response = await fetch(`${options.apiBaseUrl}/models`, {
        method: 'GET',
        headers: withAuthHeaders(options.apiKey),
    });
    const payload = await readJsonOrThrow(response);
    if (!response.ok) {
        throw new Error(buildErrorMessage(response.status, payload, 'Failed to fetch capabilities'));
    }
    const parsed = capabilitiesSchema.parse(payload);
    const value = {
        ...parsed,
        modalities: enrichModalityCapabilities(parsed.modalities),
        fetchedAt: new Date().toISOString(),
    };
    capabilitiesCache = {
        value,
        expiresAt: now + CAPABILITY_TTL_MS,
    };
    return value;
}
export async function enhancePrompt(request, options) {
    const response = await fetch(`${options.apiBaseUrl}/enhance`, {
        method: 'POST',
        headers: withAuthHeaders(options.apiKey),
        body: JSON.stringify({
            prompt: request.prompt,
            modality: request.modality,
            tone: request.tone,
            length: request.length,
            customInstructions: request.customInstructions,
            stream: false,
        }),
    });
    const payload = await readJsonOrThrow(response);
    if (!response.ok) {
        throw new Error(buildErrorMessage(response.status, payload, 'Prompt enhancement failed'));
    }
    const parsed = enhanceResponseSchema.parse(payload);
    return {
        enhancedPrompt: parsed.enhancedPrompt,
        request,
        usage: parsed.usage,
        quota: parsed.quota,
        generatedAt: new Date().toISOString(),
        links: {
            webApp: 'https://promptomize.app/login',
            demo: 'https://promptomize.app/demo',
            ios: 'https://apps.apple.com/us/app/promptomize/id6758075605',
        },
    };
}
