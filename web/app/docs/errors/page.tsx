export default function ErrorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-primary mb-2 text-3xl font-bold">Error Handling</h1>
        <p className="text-muted text-lg">Handle API errors gracefully in your application.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Error Response Format</h2>
        <p className="text-muted">All errors follow this format:</p>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "message": "Additional details"
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">HTTP Status Codes</h2>
        <div className="space-y-4">
          {[
            { code: 400, name: 'Bad Request', desc: 'Invalid request format or validation error' },
            { code: 401, name: 'Unauthorized', desc: 'Missing or invalid API key' },
            { code: 403, name: 'Forbidden', desc: 'API key lacks required permission' },
            { code: 429, name: 'Too Many Requests', desc: 'Rate limit or quota exceeded' },
            { code: 500, name: 'Internal Server Error', desc: 'Server-side error' },
          ].map((status) => (
            <div key={status.code} className="border-border rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <span className="text-primary font-mono font-bold">{status.code}</span>
                <span className="text-primary font-medium">{status.name}</span>
              </div>
              <p className="text-muted mt-1 text-sm">{status.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Error Codes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-primary px-4 py-2 text-left font-medium">Code</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Description</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Solution</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>MISSING_API_KEY</code>
                </td>
                <td className="px-4 py-2">No API key provided</td>
                <td className="px-4 py-2">Include X-API-Key header</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>INVALID_API_KEY</code>
                </td>
                <td className="px-4 py-2">Key is invalid or revoked</td>
                <td className="px-4 py-2">Check your API key</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>PERMISSION_DENIED</code>
                </td>
                <td className="px-4 py-2">Key lacks permission</td>
                <td className="px-4 py-2">Update key permissions</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>RATE_LIMIT_EXCEEDED</code>
                </td>
                <td className="px-4 py-2">Too many requests/minute</td>
                <td className="px-4 py-2">Wait and retry with backoff</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>QUOTA_EXCEEDED</code>
                </td>
                <td className="px-4 py-2">Monthly quota reached</td>
                <td className="px-4 py-2">Upgrade your plan</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>VALIDATION_ERROR</code>
                </td>
                <td className="px-4 py-2">Invalid request data</td>
                <td className="px-4 py-2">Check request body</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>ENHANCEMENT_ERROR</code>
                </td>
                <td className="px-4 py-2">Enhancement failed</td>
                <td className="px-4 py-2">Retry the request</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Example Error Handling</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
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
