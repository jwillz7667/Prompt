# Promptomize ChatGPT App

Standalone MCP server and React widget for the Promptomize ChatGPT app.

## Environment

Copy `.env.example` to `.env` and fill in:

- `PROMPTOMIZE_PUBLIC_API_BASE_URL`
- `PROMPTOMIZE_CHATGPT_API_KEY` — a key from a Promptomize developer account on an
  active **paid** API plan (Starter, Pro or Enterprise). The developer API has no
  free enhancement allowance: a key without a paid plan gets
  `402 API_PLAN_REQUIRED` on `/public/enhance`, and the app tells users the
  service is temporarily unavailable. Every enhancement made through the app
  counts against that plan's quota.
- `CHATGPT_APP_BASE_URL`
- `CHATGPT_WIDGET_DOMAIN`
- `OPENAI_APPS_DOMAIN_CHALLENGE_TOKEN` (optional, for OpenAI domain verification)

## Local run

```bash
npm install
npm run build
npm run start
```

The MCP endpoint is exposed at `/mcp` and the widget assets are served from `/widget`.

## Railway

Deploy this directory as its own Railway service. The included `railway.json` expects:

- `npm install && npm run build` at build time
- `npm run start` at runtime

Use `chatgpt-app/` as the Railway root directory, or deploy with:

```bash
railway up --service promptomize-chatgpt-app --ci --path-as-root .
```

Set the public service URL in both `CHATGPT_APP_BASE_URL` and `CHATGPT_WIDGET_DOMAIN`.

## Production

- Public app URL: `https://promptomize-chatgpt-app-production.up.railway.app`
- MCP endpoint: `https://promptomize-chatgpt-app-production.up.railway.app/mcp`
- Widget URL: `https://promptomize-chatgpt-app-production.up.railway.app/widget/index.html`

See `SUBMISSION.md` for the ChatGPT app listing handoff.
