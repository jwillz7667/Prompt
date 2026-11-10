import Link from 'next/link'

export default function ApiReferencePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-primary mb-2 text-3xl font-bold">API Reference</h1>
        <p className="text-muted text-lg">Complete reference for the Promptomize API.</p>
      </div>

      {/* Base URL */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Base URL</h2>
        <div className="bg-secondary rounded-lg p-4">
          <code className="text-primary">https://api.promptomize.app/api/v1</code>
        </div>
      </section>

      {/* Authentication */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Authentication</h2>
        <p className="text-muted">
          All endpoints require an API key in the{' '}
          <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">X-API-Key</code> header.
        </p>
        <Link href="/docs/authentication" className="text-accent text-sm hover:underline">
          Learn more about authentication →
        </Link>
      </section>

      {/* Endpoints Overview */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-primary px-4 py-3 text-left font-medium">Method</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Endpoint</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Description</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Permission</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-border hover:bg-secondary/50 border-b">
                <td className="px-4 py-3">
                  <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                    POST
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href="/docs/api-reference/enhance" className="text-accent hover:underline">
                    /public/enhance
                  </Link>
                </td>
                <td className="px-4 py-3">Enhance a prompt</td>
                <td className="px-4 py-3">
                  <code>enhance</code>
                </td>
              </tr>
              <tr className="border-border hover:bg-secondary/50 border-b">
                <td className="px-4 py-3">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                    GET
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href="/docs/api-reference/usage" className="text-accent hover:underline">
                    /public/usage
                  </Link>
                </td>
                <td className="px-4 py-3">Get usage and quota</td>
                <td className="px-4 py-3">-</td>
              </tr>
              <tr className="border-border hover:bg-secondary/50 border-b">
                <td className="px-4 py-3">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                    GET
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href="/docs/api-reference/models" className="text-accent hover:underline">
                    /public/models
                  </Link>
                </td>
                <td className="px-4 py-3">List modalities and options</td>
                <td className="px-4 py-3">-</td>
              </tr>
              <tr className="border-border hover:bg-secondary/50 border-b">
                <td className="px-4 py-3">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                    GET
                  </span>
                </td>
                <td className="px-4 py-3">/public/history</td>
                <td className="px-4 py-3">Get enhancement history</td>
                <td className="px-4 py-3">
                  <code>read_history</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Response Headers */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Response Headers</h2>
        <p className="text-muted">All responses include these headers:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-primary px-4 py-2 text-left font-medium">Header</th>
                <th className="text-primary px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-RateLimit-Limit</code>
                </td>
                <td className="px-4 py-2">Maximum requests per minute</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-RateLimit-Remaining</code>
                </td>
                <td className="px-4 py-2">Remaining requests in current window</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-RateLimit-Reset</code>
                </td>
                <td className="px-4 py-2">Unix timestamp when limit resets</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-Quota-Limit</code>
                </td>
                <td className="px-4 py-2">Monthly request quota</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-Quota-Remaining</code>
                </td>
                <td className="px-4 py-2">Remaining monthly requests</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code>X-Quota-Reset</code>
                </td>
                <td className="px-4 py-2">ISO date when quota resets</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Content Types */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Content Types</h2>
        <ul className="text-muted list-inside list-disc space-y-2">
          <li>
            All requests must use{' '}
            <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">application/json</code>
          </li>
          <li>
            All responses are{' '}
            <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">application/json</code>
          </li>
          <li>
            Streaming responses use{' '}
            <code className="bg-secondary rounded px-1.5 py-0.5 text-sm">text/event-stream</code>
          </li>
        </ul>
      </section>

      {/* OpenAPI */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">OpenAPI Specification</h2>
        <p className="text-muted">
          Download the complete OpenAPI 3.1 specification for use with code generators and API
          clients.
        </p>
        <div className="flex gap-3">
          <a
            href="/api/v1/docs/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-secondary text-primary hover:bg-tertiary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            📄 OpenAPI JSON
          </a>
          <a
            href="/api/v1/docs/openapi.yaml"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-secondary text-primary hover:bg-tertiary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            📄 OpenAPI YAML
          </a>
        </div>
      </section>
    </div>
  )
}
