# AI operations — LLM gateway runbook

Last updated 2026-11-24. Supersedes the 2026-11-09 single-provider audit (kept in git history).

Every AI call in the backend — prompt optimizer, workspace chat, support chat, image analysis, compare's "deepseek" lane, the reflection loop — goes through one gateway in `backend/src/features/llm`. Routes never talk to a provider directly.

> **App Store rule.** Provider and model names (DeepSeek, OpenRouter, Qwen, OpenAI, …) live only in server config, logs and this document. Clients only ever receive the generic `{type:'error', code, message, retryable, retryAfterMs?}` produced by `toClientStreamError`. The China storefront rejected an earlier build for naming a third-party AI.

## How a request flows

1. The caller builds an `LlmChatRequest` (messages, maxTokens, temperature, `reasoning: 'off' | 'on'`, optional `signal`).
2. The gateway walks `LLM_PROVIDER_CHAIN` in order:
   - Providers whose circuit breaker is open are skipped.
   - Image turns are offered only to providers with `LLM_<P>_SUPPORTS_IMAGES=true` (DeepSeek by default).
   - A failure **before the first token** (HTTP 5xx/429/401/402, network error, or no token within `LLM_TTFT_TIMEOUT_MS`) fails over to the next provider.
   - A failure **after the first token** is final. Two providers are never spliced into one answer; the client gets `INTERRUPTED` and can retry.
   - Request-specific rejections (400, context too long, content filter) are not failed over.
   - The last remaining provider gets `LLM_LAST_PROVIDER_RETRIES` extra attempts for transient failures, with backoff that honors `Retry-After` (capped at 4 s).
3. Every completed request logs `provider`, `model`, `latencyMs`, `finishReason`, input/output/cached tokens and whether it failed over (`module: llm`, message `LLM request completed`). Every failed attempt logs once at warn (`LLM provider attempt failed`).

### Reasoning switch

`reasoning: 'off'` is the default everywhere because reasoning tokens bill as output. The gateway translates it per provider:

| Provider | Request field |
|---|---|
| deepseek | `thinking: {type: 'disabled' \| 'enabled'}` |
| openrouter | `reasoning: {enabled: false \| true}` |
| local (vLLM) | `chat_template_kwargs: {enable_thinking: false \| true}` |

### Finish reasons

The gateway returns `finishReason: 'stop' | 'length' | 'content_filter' | 'other'`. Chat may accept `length` as a truncated answer. The optimizer (`deepseekService`) treats anything except `stop` as a failure, so a half-written prompt is never saved as complete.

## Circuit breaker

State is shared across Railway replicas through Redis (keys `llm:cb:v1:<provider>[:tripped|:probe|:failures]`). Without Redis, each process keeps its own state.

| Trigger | Effect |
|---|---|
| 401/403/402 or provider not configured | Open for `LLM_BREAKER_LONG_COOLDOWN_MS` (5 min). Logged **once at error level** per opening: `LLM provider circuit opened: provider unusable`. |
| 3 transient failures (429/5xx/timeout/interrupted) within 30 s | Open for 30 s, or for the `Retry-After` value on a 429 (max 5 min). |
| Cooldown expired | Half-open: exactly one probe request cluster-wide. Success closes the breaker; failure reopens it. |
| Client disconnect, 400, content filter | No effect on the breaker. |

**If the error log appears for `deepseek` with kind `insufficient_balance`,** top up the DeepSeek balance. Traffic keeps flowing through OpenRouter in the meantime, and the breaker re-probes DeepSeek after the cooldown, so no redeploy is needed.

## Configuration

See `backend/.env.example` (LLM section) and the table in `backend/README.md`. Summary:

| Variable | Default |
|---|---|
| `LLM_PROVIDER_CHAIN` | `deepseek,openrouter` |
| `LLM_DEEPSEEK_API_KEY` (falls back to `DEEPSEEK_API_KEY`) | — |
| `LLM_DEEPSEEK_MODEL` (falls back to `DEEPSEEK_MODEL`) | `deepseek-flash` |
| `LLM_OPENROUTER_API_KEY` | — |
| `LLM_OPENROUTER_MODEL` | `deepseek/deepseek-v4.1-flash` |
| `LLM_OPENROUTER_PROVIDER_PREFS` | unset (JSON routing object) |
| `LLM_LOCAL_BASE_URL` / `_API_KEY` / `_MODEL` | unset |
| `LLM_LOCAL_CF_ACCESS_CLIENT_ID` / `_SECRET` | unset |
| `LLM_TTFT_TIMEOUT_MS` / `LLM_IDLE_TIMEOUT_MS` / `LLM_TOTAL_TIMEOUT_MS` | 15000 / 60000 / 180000 |

The model id is sent **exactly as configured**. Only DeepSeek's retired ids (`deepseek-chat`, `deepseek-reasoner`, `deepseek-v4-flash`) are aliased to `deepseek-flash`, because DeepSeek still aliases them server-side. At boot, `validateLlmConfig()` logs the effective chain and, in the background, calls `GET <base>/models` on each provider. If the configured id is missing from that list, it logs `CONFIGURED LLM MODEL IS NOT LISTED BY PROVIDER` at error level. A malformed `LLM_*` value (bad URL, non-numeric timeout, invalid JSON, unknown provider in the chain) throws at boot, so Railway keeps the previous healthy deployment.

The removed `DEEPSEEK_MAX_RETRIES`, `DEEPSEEK_REQUEST_TIMEOUT_MS`, `DEEPSEEK_CONNECT_TIMEOUT_MS`, `DEEPSEEK_STREAM_IDLE_TIMEOUT_MS` and `DEEPSEEK_STREAM_TOTAL_TIMEOUT_MS` variables are no longer read. Delete them from Railway.

## Adding the home RTX 4090 (self-hosted provider)

The gateway treats the home GPU as one more OpenAI-compatible provider. If the PC is off, the tunnel is down or the GPU is busy, the first-token timeout or connection error fails over to DeepSeek before the user sees anything.

Use only standard (safety-filtered) instruct models, not uncensored ones.

### 1. Run vLLM (bound to localhost only)

```bash
export VLLM_API_KEY="$(openssl rand -hex 32)"   # becomes LLM_LOCAL_API_KEY

docker run -d --name vllm --restart unless-stopped \
  --gpus all --ipc=host \
  -p 127.0.0.1:8000:8000 \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen3-32B-AWQ \
  --served-model-name qwen3-32b-awq \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.92 \
  --enable-prefix-caching \
  --api-key "$VLLM_API_KEY"
```

- Use a 4-bit (AWQ/GPTQ) Qwen3 checkpoint in the 27B–32B class. A 32B model at 4 bits is about 19 GB of weights. With `--gpu-memory-utilization 0.92` on a 24 GB card, that leaves enough KV cache for 16k context at low concurrency.
- Pin the image to the tag you tested (replace `latest`) so a restart cannot silently upgrade vLLM.
- `-p 127.0.0.1:8000:8000` keeps the port off the LAN and the internet. Only the tunnel reaches it.
- Check it locally: `curl -s localhost:8000/v1/models -H "Authorization: Bearer $VLLM_API_KEY"`.

### 2. Expose it with Cloudflare Tunnel + Access

```bash
cloudflared tunnel login
cloudflared tunnel create promptomize-llm
cloudflared tunnel route dns promptomize-llm llm.example.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: promptomize-llm
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: llm.example.com
    service: http://127.0.0.1:8000
  - service: http_status:404
```

Run it as a service (`sudo cloudflared service install`). In Cloudflare Zero Trust:

1. **Access → Service Auth → Service Tokens → Create**. Save the Client ID and Client Secret.
2. **Access → Applications → Add → Self-hosted** for `llm.example.com`. Add a policy with action **Service Auth** that includes that service token. Requests without the token are rejected at Cloudflare's edge, before they reach your PC.

### 3. Point the backend at it (Railway variables)

```
LLM_LOCAL_BASE_URL=https://llm.example.com/v1
LLM_LOCAL_API_KEY=<VLLM_API_KEY>
LLM_LOCAL_MODEL=qwen3-32b-awq
LLM_LOCAL_CF_ACCESS_CLIENT_ID=<service token client id>
LLM_LOCAL_CF_ACCESS_CLIENT_SECRET=<service token client secret>
LLM_PROVIDER_CHAIN=local,deepseek,openrouter
```

After the redeploy, the boot log should show `LLM provider chain` with `local` first and `LLM provider model verified` for `local`. To take the GPU out of rotation, remove `local` from `LLM_PROVIDER_CHAIN`. No code change is needed.

Image turns skip `local` unless you serve a vision model and set `LLM_LOCAL_SUPPORTS_IMAGES=true`.

## Cost per turn

These are list prices in USD per million tokens, as recorded in the owner's 2026-11-24 pricing notes. DeepSeek bills half these rates off-peak, and the DeepSeek cache-hit rate applies to repeated conversation prefixes. The OpenRouter figure is approximate and assumes no cache discount.

| Provider / model | Input (cache miss) | Input (cache hit) | Output |
|---|---:|---:|---:|
| DeepSeek `deepseek-flash`, peak | $0.30 | $0.006 | $1.20 |
| DeepSeek `deepseek-flash`, off-peak | $0.15 | $0.003 | $0.60 |
| OpenRouter `deepseek/deepseek-v4.1-flash` | ~$0.05 | — | ~$0.20 |
| Home 4090 (vLLM) | electricity only (~350 W under load) | | |

Illustrative turns:

| Turn | Tokens | DeepSeek peak | DeepSeek off-peak | OpenRouter |
|---|---|---:|---:|---:|
| Prompt optimize (one shot) | 1,500 in (miss) + 600 out | $0.00117 | $0.00059 | $0.00020 |
| Chat turn, 6k context | 5,000 hit + 1,000 miss + 500 out | $0.00093 | $0.00047 | $0.00040 |
| Long chat turn, 20k context | 18,000 hit + 2,000 miss + 1,000 out | $0.00191 | $0.00095 | $0.00120 |

Worst case: a heavy subscriber sending 100 six-thousand-token chat turns a day at peak costs about $0.093/day, or about $2.80/month. That is well under the $9.99/month price even after Apple's commission. Daily fair-use limits (HTTP 429 `FAIR_USE_LIMIT`) cap anything above that. Leaving `reasoning` off is the biggest single cost lever, because reasoning tokens bill at the output rate.

## Streaming transport

- `compression()` skips any response whose request `Accept` or response `Content-Type` is `text/event-stream`. gzip would otherwise hold tokens until a block fills.
- `beginSse` / `writeSse` / `endSse` in `features/llm/sse.ts` set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, flush after every event, and send a `: ping` comment every 15 s. The ping keeps Railway's and Cloudflare's idle timers from closing quiet streams, and it stops on end or close.

## Verification

Unit tests mock `fetch` and never spend credits:

- `backend/test/unit/llm-provider.test.ts`: SSE parsing across chunk boundaries, keep-alive comments, in-band errors, status and `Retry-After` mapping, the reasoning switch per provider, first-token timeout, caller abort, token-consumer failures, `length` surfaced as a result.
- `backend/test/unit/llm-gateway.test.ts`: failover before the first token, no failover after it, TTFT-triggered failover, the breaker opening on 402 and skipping that provider, no failover on 400, image routing, model overrides, generic client errors.
- `backend/test/unit/llm-circuit-breaker.test.ts`: long and short openings, the failure window, the half-open single probe, fallback when Redis is down.
- `backend/test/unit/llm-sse.test.ts`: compression is skipped for SSE, SSE headers are set.
- `backend/test/unit/llm-config.test.ts`: chain parsing, exact model ids, malformed config rejected, the boot model probe.
- `backend/test/unit/ai-transport.test.ts`: optimizer completeness rules, native vision, server-controlled models and reasoning, all through the gateway.

Before relying on a new provider in production, send one text request and one image request through the app, then check the `LLM request completed` log line for the expected provider and token counts.
