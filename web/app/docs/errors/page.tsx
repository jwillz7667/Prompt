export default function ErrorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">Error Handling</h1>
        <p className="text-lg text-muted">
          Handle API errors gracefully in your application.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Error Response Format</h2>
        <p className="text-muted">All errors follow this format:</p>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "message": "Additional details"
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">HTTP Status Codes</h2>
        <div className="space-y-4">
          {[
            { code: 400, name: 'Bad Request', desc: 'Invalid request format or validation error' },
            { code: 401, name: 'Unauthorized', desc: 'Missing or invalid API key' },
            { code: 403, name: 'Forbidden', desc: 'API key lacks required permission' },
            { code: 429, name: 'Too Many Requests', desc: 'Rate limit or quota exceeded' },
            { code: 500, name: 'Internal Server Error', desc: 'Server-side error' },
          ].map((status) => (
            <div key={status.code} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-primary">{status.code}</span>
                <span className="font-medium text-primary">{status.name}</span>
              </div>
              <p className="text-sm text-muted mt-1">{status.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Error Codes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-primary font-medium">Code</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Description</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Solution</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>MISSING_API_KEY</code></td>
                <td className="py-2 px-4">No API key provided</td>
                <td className="py-2 px-4">Include X-API-Key header</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>INVALID_API_KEY</code></td>
                <td className="py-2 px-4">Key is invalid or revoked</td>
                <td className="py-2 px-4">Check your API key</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>PERMISSION_DENIED</code></td>
                <td className="py-2 px-4">Key lacks permission</td>
                <td className="py-2 px-4">Update key permissions</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>RATE_LIMIT_EXCEEDED</code></td>
                <td className="py-2 px-4">Too many requests/minute</td>
                <td className="py-2 px-4">Wait and retry with backoff</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>QUOTA_EXCEEDED</code></td>
                <td className="py-2 px-4">Monthly quota reached</td>
                <td className="py-2 px-4">Upgrade your plan</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>VALIDATION_ERROR</code></td>
                <td className="py-2 px-4">Invalid request data</td>
                <td className="py-2 px-4">Check request body</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>ENHANCEMENT_ERROR</code></td>
                <td className="py-2 px-4">Enhancement failed</td>
                <td className="py-2 px-4">Retry the request</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Example Error Handling</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`async function enhance(prompt) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    switch (data.code) {
      case 'RATE_LIMIT_EXCEEDED':
        // Wait and retry
        await sleep(data.retryAfter * 1000);
        return enhance(prompt);

      case 'QUOTA_EXCEEDED':
        // Show upgrade prompt
        showUpgradeDialog();
        break;

      case 'VALIDATION_ERROR':
        // Show validation errors
        showErrors(data.details);
        break;

      default:
        throw new Error(data.message);
    }
  }

  return data;
}`}
          </pre>
        </div>
      </section>
    </div>
  )
}
