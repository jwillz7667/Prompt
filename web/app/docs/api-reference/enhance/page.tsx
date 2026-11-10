export default function EnhanceEndpointPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
            POST
          </span>
          <code className="text-primary text-lg">/public/enhance</code>
        </div>
        <p className="text-muted text-lg">Enhance a prompt using AI-powered optimization.</p>
      </div>

      {/* Permission */}
      <section className="border-border bg-secondary/30 rounded-lg border p-4">
        <div className="text-sm">
          <span className="text-muted">Required permission:</span>{' '}
          <code className="bg-secondary rounded px-1.5 py-0.5">enhance</code>
        </div>
      </section>

      {/* Request Body */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Request Body</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-primary px-4 py-2 text-left font-medium">Field</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Type</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Required</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>prompt</code>
                </td>
                <td className="px-4 py-2">string</td>
                <td className="px-4 py-2">Yes</td>
                <td className="px-4 py-2">The prompt to enhance (1-100,000 chars)</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>modality</code>
                </td>
                <td className="px-4 py-2">string</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">
                  Target modality: <code>text</code>, <code>image</code>, <code>video</code>,{' '}
                  <code>audio</code>, <code>code</code>, <code>3d</code>. Default: <code>text</code>
                </td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>tone</code>
                </td>
                <td className="px-4 py-2">string</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">
                  Desired tone: <code>professional</code>, <code>casual</code>,{' '}
                  <code>academic</code>, <code>creative</code>, <code>technical</code>,{' '}
                  <code>friendly</code>
                </td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>length</code>
                </td>
                <td className="px-4 py-2">string</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">
                  Detail level: <code>concise</code>, <code>standard</code>, <code>detailed</code>
                </td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>maxTokens</code>
                </td>
                <td className="px-4 py-2">integer</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">Maximum tokens for response (1-8192)</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>customInstructions</code>
                </td>
                <td className="px-4 py-2">string</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">Additional instructions (max 2000 chars)</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>stream</code>
                </td>
                <td className="px-4 py-2">boolean</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">
                  Enable streaming response. Default: <code>false</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Example Request */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Example Request</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
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
        <h2 className="text-primary text-2xl font-semibold">Response</h2>

        <h3 className="text-primary text-lg font-medium">Success (200)</h3>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
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

        <h3 className="text-primary mt-6 text-lg font-medium">Error Responses</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-muted mb-2 text-sm font-medium">400 - Validation Error</h4>
            <div className="bg-secondary overflow-hidden rounded-lg">
              <pre className="text-primary overflow-x-auto p-4 text-sm">
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
            <h4 className="text-muted mb-2 text-sm font-medium">401 - Authentication Error</h4>
            <div className="bg-secondary overflow-hidden rounded-lg">
              <pre className="text-primary overflow-x-auto p-4 text-sm">
                {`{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "message": "The provided API key is invalid, expired, or revoked"
}`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="text-muted mb-2 text-sm font-medium">429 - Rate Limit Exceeded</h4>
            <div className="bg-secondary overflow-hidden rounded-lg">
              <pre className="text-primary overflow-x-auto p-4 text-sm">
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
        <h2 className="text-primary text-2xl font-semibold">Streaming</h2>
        <p className="text-muted">
          Set <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">stream: true</code> to
          receive the response as Server-Sent Events (SSE).
        </p>

        <h3 className="text-primary text-lg font-medium">Stream Events</h3>
        <div className="space-y-3">
          <div className="bg-secondary rounded-lg p-4">
            <div className="text-muted mb-1 text-xs">Token event</div>
            <code className="text-primary text-sm">
              {`data: {"type": "token", "content": "Compose"}`}
            </code>
          </div>
          <div className="bg-secondary rounded-lg p-4">
            <div className="text-muted mb-1 text-xs">Complete event</div>
            <code className="text-primary text-sm">
              {`data: {"type": "complete", "enhancedPrompt": "...", "usage": {...}}`}
            </code>
          </div>
          <div className="bg-secondary rounded-lg p-4">
            <div className="text-muted mb-1 text-xs">Done marker</div>
            <code className="text-primary text-sm">data: [DONE]</code>
          </div>
        </div>
      </section>
    </div>
  )
}
