export default function EnhanceEndpointPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-green-500/10 text-green-600 px-2 py-0.5 rounded text-xs font-medium">
            POST
          </span>
          <code className="text-lg text-primary">/public/enhance</code>
        </div>
        <p className="text-lg text-muted">
          Enhance a prompt using AI-powered optimization.
        </p>
      </div>

      {/* Permission */}
      <section className="rounded-lg border border-border p-4 bg-secondary/30">
        <div className="text-sm">
          <span className="text-muted">Required permission:</span>{' '}
          <code className="bg-secondary px-1.5 py-0.5 rounded">enhance</code>
        </div>
      </section>

      {/* Request Body */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Request Body</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-primary font-medium">Field</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Type</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Required</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>prompt</code></td>
                <td className="py-2 px-4">string</td>
                <td className="py-2 px-4">Yes</td>
                <td className="py-2 px-4">The prompt to enhance (1-100,000 chars)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>modality</code></td>
                <td className="py-2 px-4">string</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">
                  Target modality: <code>text</code>, <code>image</code>, <code>video</code>,{' '}
                  <code>audio</code>, <code>code</code>, <code>3d</code>. Default: <code>text</code>
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>tone</code></td>
                <td className="py-2 px-4">string</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">
                  Desired tone: <code>professional</code>, <code>casual</code>, <code>academic</code>,{' '}
                  <code>creative</code>, <code>technical</code>, <code>friendly</code>
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>length</code></td>
                <td className="py-2 px-4">string</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">
                  Detail level: <code>concise</code>, <code>standard</code>, <code>detailed</code>
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>maxTokens</code></td>
                <td className="py-2 px-4">integer</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">Maximum tokens for response (1-8192)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>customInstructions</code></td>
                <td className="py-2 px-4">string</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">Additional instructions (max 2000 chars)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>stream</code></td>
                <td className="py-2 px-4">boolean</td>
                <td className="py-2 px-4">No</td>
                <td className="py-2 px-4">Enable streaming response. Default: <code>false</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Example Request */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Example Request</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: pk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a professional email to schedule a meeting",
    "modality": "text",
    "tone": "professional",
    "length": "standard"
  }'`}
          </pre>
        </div>
      </section>

      {/* Response */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Response</h2>

        <h3 className="text-lg font-medium text-primary">Success (200)</h3>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "enhancedPrompt": "Compose a professional business email...",
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

        <h3 className="text-lg font-medium text-primary mt-6">Error Responses</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted mb-2">400 - Validation Error</h4>
            <div className="rounded-lg bg-secondary overflow-hidden">
              <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "prompt", "message": "Required" }
  ]
}`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted mb-2">401 - Authentication Error</h4>
            <div className="rounded-lg bg-secondary overflow-hidden">
              <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "message": "The provided API key is invalid, expired, or revoked"
}`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted mb-2">429 - Rate Limit Exceeded</h4>
            <div className="rounded-lg bg-secondary overflow-hidden">
              <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "You have exceeded 60 requests per minute",
  "retryAfter": 45
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Streaming */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Streaming</h2>
        <p className="text-muted">
          Set <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">stream: true</code>{' '}
          to receive the response as Server-Sent Events (SSE).
        </p>

        <h3 className="text-lg font-medium text-primary">Stream Events</h3>
        <div className="space-y-3">
          <div className="rounded-lg bg-secondary p-4">
            <div className="text-xs text-muted mb-1">Token event</div>
            <code className="text-sm text-primary">
              {`data: {"type": "token", "content": "Compose"}`}
            </code>
          </div>
          <div className="rounded-lg bg-secondary p-4">
            <div className="text-xs text-muted mb-1">Complete event</div>
            <code className="text-sm text-primary">
              {`data: {"type": "complete", "enhancedPrompt": "...", "usage": {...}}`}
            </code>
          </div>
          <div className="rounded-lg bg-secondary p-4">
            <div className="text-xs text-muted mb-1">Done marker</div>
            <code className="text-sm text-primary">data: [DONE]</code>
          </div>
        </div>
      </section>
    </div>
  )
}
