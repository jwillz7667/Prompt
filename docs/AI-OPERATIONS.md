# AI operations and cost audit — 2026-11-09

The default enhancement provider is DeepSeek Flash. Text and image requests use `DEEPSEEK_API_KEY`; images are sent directly to its native vision API. The previous flow required OpenAI for image threads and first made a separate image-analysis request. That extra paid call is removed. Existing images remain available to subsequent thread turns.

## Model and spend controls

- `DEEPSEEK_MODEL` selects the server-owned text model. Client model strings cannot select a more expensive model or turn on reasoning outside the authorized MAX mode.
- `DEEPSEEK_VISION_MODEL` defaults to `deepseek-flash` independently because the Pro model does not support images.
- Standard and comparison calls explicitly disable thinking; MAX enables it. Reasoning is part of output-token spend.
- `PROMPT_VISION_PROVIDER=openai` retains the alternative image path. Configure `OPENAI_VISION_STANDARD_MODEL` and `OPENAI_VISION_MAX_MODEL` to models enabled for your account. The historical GPT-4.1 defaults are compatibility values, are now marked deprecated by OpenAI, and should not be selected for a new deployment.
- `DEEPSEEK_MAX_RETRIES` accepts 0–3. HTTP authentication/validation failures do not retry. Transient network/429/5xx failures retry before streaming tokens; no retry occurs after tokens reach the client. Non-streaming timeouts can still incur provider charges even when the response is lost.
- Timeouts cover response bodies, idle streams, and total stream duration. Empty, malformed, interrupted, or length-limited answers fail instead of being saved as complete. Database persistence callbacks are awaited.
- Refinement requests include the latest assistant answer once rather than duplicating it inside the next user message.

## Published price comparison

USD per million tokens, excluding taxes and cache discounts:

| Provider/model | Input | Output |
|---|---:|---:|
| DeepSeek Flash, off-peak | $0.15 | $0.60 |
| DeepSeek Flash, peak | $0.30 | $1.20 |
| Historical GPT-4.1-mini | $0.40 | $1.60 |
| GPT-5.4-mini | $0.75 | $4.50 |

For an illustrative 2,000 input + 1,000 output tokens, Flash costs $0.0009 off-peak or $0.0018 peak; the historical image model costs $0.0024. This is a token-price comparison, not a measured quality-equivalent saving; image tokenization, reasoning, cache hits, and actual response length affect the bill. The eliminated analysis call saves an additional request.

Sources checked November 9, 2026: [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [native vision](https://api-docs.deepseek.com/guides/vision/), [chat response and streaming contract](https://api-docs.deepseek.com/api/create-chat-completion/), [GPT-4.1-mini pricing/deprecation](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [GPT-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

## Verification and remaining work

`backend/test/unit/ai-transport.test.ts` covers stream boundaries, EOF handling, usage, empty/truncated/filter/malformed answers, consumer failures, async persistence, header/body timeouts, stream stalls, non-retryable credentials, native vision, image followups, and server-controlled models/reasoning. These tests mock providers and never spend API credits.

Before enabling paid traffic on a fresh deployment, set the real DeepSeek key in Railway, run a short text and image request, confirm provider usage and response quality, and verify the user's quota increments once. No live provider credentials were present in this clone, so the audit's automated tests establish transport behavior, not account balance or live model availability. Alternative comparison providers require their own credentials and live smoke tests.
