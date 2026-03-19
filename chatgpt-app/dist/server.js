import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE, } from '@modelcontextprotocol/ext-apps/server';
import { readEnv } from './lib/env.js';
import { enhancePrompt, fetchCapabilities } from './lib/promptomize.js';
import { getModalityDetail } from './shared/modalityDetails.js';
import { PROMPTOMIZE_TOOL_URI, } from './shared/types.js';
const env = readEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const widgetDir = path.resolve(projectRoot, 'assets', 'widget');
const widgetHtmlCandidates = [
    path.resolve(widgetDir, 'index.html'),
    path.resolve(widgetDir, 'src', 'widget', 'index.html'),
];
const sessions = new Map();
const requestWindowMs = 60 * 1000;
const maxRequestsPerWindow = 10;
const enhanceInputSchema = z.object({
    prompt: z.string().min(1).max(100000),
    modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
    tone: z
        .enum(['professional', 'casual', 'academic', 'creative', 'technical', 'friendly'])
        .optional(),
    length: z.enum(['concise', 'standard', 'detailed']).optional(),
    customInstructions: z.string().max(2000).optional(),
});
function resolveWidgetHtmlPath() {
    return widgetHtmlCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
function ensureWidgetBuilt() {
    if (!resolveWidgetHtmlPath()) {
        throw new Error(`Widget bundle not found under ${widgetDir}. Run "npm run build" in chatgpt-app before starting the server.`);
    }
}
function readWidgetHtml() {
    ensureWidgetBuilt();
    return fs.readFileSync(resolveWidgetHtmlPath(), 'utf8');
}
function compactBaseUrl(url) {
    return url.replace(/\/$/, '');
}
function toolMeta(invoking, invoked) {
    return {
        ui: {
            resourceUri: PROMPTOMIZE_TOOL_URI,
        },
        'openai/outputTemplate': PROMPTOMIZE_TOOL_URI,
        'openai/widgetAccessible': true,
        'openai/toolInvocation/invoking': invoking,
        'openai/toolInvocation/invoked': invoked,
    };
}
function resourceMeta() {
    const widgetOrigin = new URL(env.CHATGPT_WIDGET_DOMAIN);
    const apiOrigin = new URL(env.PROMPTOMIZE_PUBLIC_API_BASE_URL);
    const redirectDomains = ['https://promptomize.app', 'https://www.promptomize.app'];
    return {
        ui: {
            prefersBorder: true,
            domain: widgetOrigin.origin,
            permissions: {
                clipboardWrite: {},
            },
            csp: {
                connectDomains: [apiOrigin.origin],
                resourceDomains: [widgetOrigin.origin],
                redirectDomains,
            },
        },
        'openai/widgetDomain': widgetOrigin.origin,
        'openai/widgetDescription': 'Promptomize widget for selecting prompt settings, regenerating enhancements, and copying the final prompt.',
        'openai/widgetPrefersBorder': true,
        'openai/widgetCSP': {
            connect_domains: [apiOrigin.origin],
            resource_domains: [widgetOrigin.origin],
            redirect_domains: redirectDomains,
        },
    };
}
function pruneTimestamps(timestamps, now) {
    return timestamps.filter((timestamp) => now - timestamp < requestWindowMs);
}
function enforceSessionLimit(session) {
    const now = Date.now();
    session.requestTimestamps = pruneTimestamps(session.requestTimestamps, now);
    if (session.requestTimestamps.length >= maxRequestsPerWindow) {
        throw new Error('Rate limited for this ChatGPT session. Please wait a moment and try again.');
    }
    session.requestTimestamps.push(now);
}
function summarizeCapabilities(capabilities) {
    const modalities = capabilities.modalities.map((item) => item.name).join(', ');
    return `Promptomize supports ${modalities}. Choose a modality first, then paste the prompt you want optimized for that workflow.`;
}
function toStructuredContent(value) {
    return value;
}
function createPromptomizeServer(sessionRecord) {
    const server = new McpServer({
        name: 'promptomize-chatgpt-app',
        version: '1.0.0',
    });
    registerAppResource(server, 'Promptomize enhancer widget', PROMPTOMIZE_TOOL_URI, {
        description: 'Interactive Promptomize widget for configuring and reviewing prompt enhancements.',
        _meta: resourceMeta(),
    }, async () => ({
        contents: [
            {
                uri: PROMPTOMIZE_TOOL_URI,
                mimeType: RESOURCE_MIME_TYPE,
                text: readWidgetHtml(),
                _meta: resourceMeta(),
            },
        ],
    }));
    registerAppTool(server, 'list_capabilities', {
        title: 'List Promptomize capabilities',
        description: 'Use this when you need the available modalities, tone options, length options, or API limits before enhancing a prompt.',
        inputSchema: {},
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
        },
        _meta: toolMeta('Loading enhancement options', 'Enhancement options ready'),
    }, async () => {
        const capabilities = await fetchCapabilities({
            apiBaseUrl: compactBaseUrl(env.PROMPTOMIZE_PUBLIC_API_BASE_URL),
            apiKey: env.PROMPTOMIZE_CHATGPT_API_KEY,
        });
        return {
            content: [
                {
                    type: 'text',
                    text: summarizeCapabilities(capabilities),
                },
            ],
            structuredContent: toStructuredContent(capabilities),
            _meta: {
                ...toolMeta('Loading enhancement options', 'Enhancement options ready'),
                capabilities,
            },
        };
    });
    registerAppTool(server, 'enhance_prompt', {
        title: 'Enhance a prompt with Promptomize',
        description: 'Use this when the user wants to choose a modality and rewrite a rough prompt into a stronger prompt optimized for text, image, video, audio, code, or 3D workflows.',
        inputSchema: {
            prompt: z.string().min(1).max(100000),
            modality: z.enum(['text', 'image', 'video', 'audio', 'code', '3d']).default('text'),
            tone: z
                .enum(['professional', 'casual', 'academic', 'creative', 'technical', 'friendly'])
                .optional(),
            length: z.enum(['concise', 'standard', 'detailed']).optional(),
            customInstructions: z.string().max(2000).optional(),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
        },
        _meta: toolMeta('Enhancing prompt', 'Prompt enhancement ready'),
    }, async (args) => {
        enforceSessionLimit(sessionRecord);
        const request = enhanceInputSchema.parse(args);
        const [capabilities, enhanced] = await Promise.all([
            fetchCapabilities({
                apiBaseUrl: compactBaseUrl(env.PROMPTOMIZE_PUBLIC_API_BASE_URL),
                apiKey: env.PROMPTOMIZE_CHATGPT_API_KEY,
            }),
            enhancePrompt(request, {
                apiBaseUrl: compactBaseUrl(env.PROMPTOMIZE_PUBLIC_API_BASE_URL),
                apiKey: env.PROMPTOMIZE_CHATGPT_API_KEY,
            }),
        ]);
        const response = {
            ...enhanced,
            capabilities,
        };
        return {
            content: [
                {
                    type: 'text',
                    text: `Optimized the prompt for ${getModalityDetail(request.modality).name} in ${request.length ?? 'standard'} detail.`,
                },
            ],
            structuredContent: toStructuredContent(response),
            _meta: {
                ...toolMeta('Enhancing prompt', 'Prompt enhancement ready'),
                response,
            },
        };
    });
    return server;
}
async function handleSseConnection(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const transport = new SSEServerTransport('/mcp/messages', res);
    const sessionRecord = {
        server: null,
        transport,
        requestTimestamps: [],
    };
    const server = createPromptomizeServer(sessionRecord);
    sessionRecord.server = server;
    sessions.set(transport.sessionId, sessionRecord);
    transport.onclose = async () => {
        sessions.delete(transport.sessionId);
        await server.close();
    };
    transport.onerror = (error) => {
        console.error('MCP transport error', error);
    };
    try {
        await server.connect(transport);
    }
    catch (error) {
        sessions.delete(transport.sessionId);
        console.error('Failed to open MCP session', error);
        if (!res.headersSent) {
            res.writeHead(500).end('Failed to establish MCP session');
        }
    }
}
async function handleMessagePost(req, res, sessionId) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (!sessionId) {
        res.writeHead(400).end('Missing sessionId query parameter');
        return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404).end('Unknown session');
        return;
    }
    try {
        await session.transport.handlePostMessage(req, res);
    }
    catch (error) {
        console.error('Failed to process MCP message', error);
        if (!res.headersSent) {
            res.writeHead(500).end('Failed to process MCP message');
        }
    }
}
ensureWidgetBuilt();
const app = express();
app.disable('x-powered-by');
app.use('/widget', express.static(widgetDir, { index: 'index.html', maxAge: '1h' }));
app.get('/', (_req, res) => {
    res.json({
        name: 'promptomize-chatgpt-app',
        status: 'ok',
        mcp: `${env.CHATGPT_APP_BASE_URL.replace(/\/$/, '')}/mcp`,
        widget: `${env.CHATGPT_WIDGET_DOMAIN.replace(/\/$/, '')}/widget/`,
    });
});
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
app.get('/.well-known/openai-apps-challenge', (_req, res) => {
    if (!env.OPENAI_APPS_DOMAIN_CHALLENGE_TOKEN) {
        res.status(404).end();
        return;
    }
    res.type('text/plain').send(env.OPENAI_APPS_DOMAIN_CHALLENGE_TOKEN);
});
const httpServer = createServer(async (req, res) => {
    if (!req.url) {
        res.writeHead(400).end('Missing URL');
        return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'OPTIONS' && (url.pathname === '/mcp' || url.pathname === '/mcp/messages')) {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
        });
        res.end();
        return;
    }
    if (req.method === 'GET' && url.pathname === '/mcp') {
        await handleSseConnection(res);
        return;
    }
    if (req.method === 'POST' && url.pathname === '/mcp/messages') {
        await handleMessagePost(req, res, url.searchParams.get('sessionId'));
        return;
    }
    app(req, res);
});
httpServer.listen(env.PORT, () => {
    console.log(`Promptomize ChatGPT app listening on http://localhost:${env.PORT}`);
    console.log(`MCP endpoint: http://localhost:${env.PORT}/mcp`);
});
