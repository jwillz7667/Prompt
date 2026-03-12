# Promptomize ChatGPT App Submission Handoff

## Live endpoints

- App base URL: `https://promptomize-chatgpt-app-production.up.railway.app`
- MCP URL: `https://promptomize-chatgpt-app-production.up.railway.app/mcp`
- Widget URL: `https://promptomize-chatgpt-app-production.up.railway.app/widget/index.html`
- Healthcheck: `https://promptomize-chatgpt-app-production.up.railway.app/health`

## Listing metadata

- App name: `Promptomize`
- Short description: `Enhance prompts for text, image, video, audio, code, and 3D workflows without leaving ChatGPT.`
- Category: `Productivity`
- Privacy policy: `https://promptomize.app/privacy`
- Support URL: `https://promptomize.app/support`

## Tool summary

- `list_capabilities`: lists supported modalities, tones, lengths, and input limits from the Promptomize public API.
- `enhance_prompt`: enhances a prompt with modality, tone, length, and custom-instruction controls using the Promptomize public API.

## Verification completed

- Local web build passes with the existing baseline lint warnings unchanged.
- Local ChatGPT app build passes.
- Railway deployment is live and passing `/health`.
- Deployed widget HTML resolves at `/widget/index.html`.
- Deployed MCP smoke test succeeded for both `list_capabilities` and `enhance_prompt`.

## Remaining manual submission step

An OpenAI organization Owner still needs to open the OpenAI developer console, add the deployed MCP URL, complete the store listing, upload the final logo/screenshots, and submit the app for review.
