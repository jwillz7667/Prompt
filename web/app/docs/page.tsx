import Link from 'next/link'

export default function DocsQuickStartPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-primary mb-2 text-3xl font-bold">Quick Start</h1>
        <p className="text-muted text-lg">
          Get started with the Promptomize API in under 5 minutes.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Overview</h2>
        <p className="text-muted">
          The Promptomize API allows you to enhance and optimize prompts programmatically. Use it to
          improve prompts for text generation, image creation, code assistance, and more.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border-border bg-secondary/50 rounded-lg border p-4">
            <div className="mb-2 text-2xl">🚀</div>
            <h3 className="text-primary font-medium">Simple Integration</h3>
            <p className="text-muted mt-1 text-sm">Single endpoint, RESTful API</p>
          </div>
          <div className="border-border bg-secondary/50 rounded-lg border p-4">
            <div className="mb-2 text-2xl">⚡</div>
            <h3 className="text-primary font-medium">Fast Response</h3>
            <p className="text-muted mt-1 text-sm">Average latency under 2 seconds</p>
          </div>
          <div className="border-border bg-secondary/50 rounded-lg border p-4">
            <div className="mb-2 text-2xl">🎯</div>
            <h3 className="text-primary font-medium">Multi-Modal</h3>
            <p className="text-muted mt-1 text-sm">Text, image, video, audio, code, 3D</p>
          </div>
        </div>
      </section>

      {/* Step 1: Get API Key */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Step 1: Get Your API Key</h2>
        <p className="text-muted">
          Create an API key in the{' '}
          <Link href="/developers/keys" className="text-accent hover:underline">
            Developer Portal
          </Link>
          . You&apos;ll need this key to authenticate all API requests.
        </p>
        <div className="border-accent/20 bg-accent/5 rounded-lg border p-4">
          <p className="text-primary text-sm">
            <strong>Important:</strong> Keep your API key secure. Don&apos;t commit it to version
            control or expose it in client-side code.
          </p>
        </div>
      </section>

      {/* Step 2: Make Request */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Step 2: Make Your First Request</h2>
        <p className="text-muted">
          Use the <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">/enhance</code>{' '}
          endpoint to optimize a prompt.
        </p>

        <div className="bg-secondary overflow-hidden rounded-lg">
          <div className="bg-tertiary border-border flex items-center justify-between border-b px-4 py-2">
            <span className="text-muted text-xs font-medium">cURL</span>
          </div>
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: pk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a professional email to schedule a meeting",
    "modality": "text"
  }'`}
          </pre>
        </div>
      </section>

      {/* Step 3: Handle Response */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Step 3: Handle the Response</h2>
        <p className="text-muted">
          The API returns the enhanced prompt along with usage information.
        </p>

        <div className="bg-secondary overflow-hidden rounded-lg">
          <div className="bg-tertiary border-border flex items-center justify-between border-b px-4 py-2">
            <span className="text-muted text-xs font-medium">Response</span>
          </div>
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`{
  "enhancedPrompt": "Compose a professional business email requesting
    a meeting. Include: 1) Clear subject line with purpose and
    timeframe 2) Brief context about why the meeting is needed
    3) Specific proposed times/dates 4) Expected duration and
    attendee list 5) Any preparation needed. Maintain formal
    tone while being concise.",
  "usage": {
    "inputTokens": 42,
    "outputTokens": 156,
    "totalTokens": 198,
    "processingMs": 1234
  },
  "quota": {
    "used": 15,
    "limit": 100,
    "remaining": 85
  }
}`}
          </pre>
        </div>
      </section>

      {/* Code Examples */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Code Examples</h2>

        <div className="space-y-6">
          {/* Python */}
          <div>
            <h3 className="text-primary mb-2 text-lg font-medium">Python</h3>
            <div className="bg-secondary overflow-hidden rounded-lg">
              <pre className="text-primary overflow-x-auto p-4 text-sm">
                {`import requests

response = requests.post(
    "https://api.promptomize.app/api/v1/public/enhance",
    headers={"X-API-Key": "pk_live_your_api_key"},
    json={
        "prompt": "Write a professional email",
        "modality": "text",
        "tone": "professional"
    }
)

data = response.json()
print(data["enhancedPrompt"])`}
              </pre>
            </div>
          </div>

          {/* JavaScript */}
          <div>
            <h3 className="text-primary mb-2 text-lg font-medium">JavaScript / TypeScript</h3>
            <div className="bg-secondary overflow-hidden rounded-lg">
              <pre className="text-primary overflow-x-auto p-4 text-sm">
                {`const response = await fetch(
  "https://api.promptomize.app/api/v1/public/enhance",
  {
    method: "POST",
    headers: {
      "X-API-Key": "pk_live_your_api_key",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: "Write a professional email",
      modality: "text",
      tone: "professional"
    })
  }
);

const { enhancedPrompt } = await response.json();
console.log(enhancedPrompt);`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Next Steps */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/docs/api-reference"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">API Reference</h3>
            <p className="text-muted mt-1 text-sm">Complete documentation for all endpoints</p>
          </Link>
          <Link
            href="/docs/rate-limits"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">Rate Limits</h3>
            <p className="text-muted mt-1 text-sm">Understand quotas and rate limiting</p>
          </Link>
          <Link
            href="/docs/errors"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">Error Handling</h3>
            <p className="text-muted mt-1 text-sm">Handle errors gracefully in your app</p>
          </Link>
          <Link
            href="/developers/playground"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">API Playground</h3>
            <p className="text-muted mt-1 text-sm">Test the API interactively</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
