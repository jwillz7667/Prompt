import Link from 'next/link'

export default function ApiReferencePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">API Reference</h1>
        <p className="text-lg text-muted">
          Complete reference for the Promptomize API.
        </p>
      </div>

      {/* Base URL */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Base URL</h2>
        <div className="rounded-lg bg-secondary p-4">
          <code className="text-primary">https://api.promptomize.app/api/v1</code>
        </div>
      </section>

      {/* Authentication */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Authentication</h2>
        <p className="text-muted">
          All endpoints require an API key in the{' '}
          <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">X-API-Key</code> header.
        </p>
        <Link href="/docs/authentication" className="text-accent hover:underline text-sm">
          Learn more about authentication →
        </Link>
      </section>

      {/* Endpoints Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-primary font-medium">Method</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Endpoint</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Description</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Permission</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border hover:bg-secondary/50">
                <td className="py-3 px-4">
                  <span className="bg-green-500/10 text-green-600 px-2 py-0.5 rounded text-xs font-medium">
                    POST
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Link href="/docs/api-reference/enhance" className="text-accent hover:underline">
                    /public/enhance
                  </Link>
                </td>
                <td className="py-3 px-4">Enhance a prompt</td>
                <td className="py-3 px-4"><code>enhance</code></td>
              </tr>
              <tr className="border-b border-border hover:bg-secondary/50">
                <td className="py-3 px-4">
                  <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
                    GET
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Link href="/docs/api-reference/usage" className="text-accent hover:underline">
                    /public/usage
                  </Link>
                </td>
                <td className="py-3 px-4">Get usage and quota</td>
                <td className="py-3 px-4">-</td>
              </tr>
              <tr className="border-b border-border hover:bg-secondary/50">
                <td className="py-3 px-4">
                  <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
                    GET
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Link href="/docs/api-reference/models" className="text-accent hover:underline">
                    /public/models
                  </Link>
                </td>
                <td className="py-3 px-4">List modalities and options</td>
                <td className="py-3 px-4">-</td>
              </tr>
              <tr className="border-b border-border hover:bg-secondary/50">
                <td className="py-3 px-4">
                  <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
                    GET
                  </span>
                </td>
                <td className="py-3 px-4">/public/history</td>
                <td className="py-3 px-4">Get enhancement history</td>
                <td className="py-3 px-4"><code>read_history</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Response Headers */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Response Headers</h2>
        <p className="text-muted">All responses include these headers:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-primary font-medium">Header</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-RateLimit-Limit</code></td>
                <td className="py-2 px-4">Maximum requests per minute</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-RateLimit-Remaining</code></td>
                <td className="py-2 px-4">Remaining requests in current window</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-RateLimit-Reset</code></td>
                <td className="py-2 px-4">Unix timestamp when limit resets</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-Quota-Limit</code></td>
                <td className="py-2 px-4">Monthly request quota</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-Quota-Remaining</code></td>
                <td className="py-2 px-4">Remaining monthly requests</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>X-Quota-Reset</code></td>
                <td className="py-2 px-4">ISO date when quota resets</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Content Types */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Content Types</h2>
        <ul className="list-disc list-inside text-muted space-y-2">
          <li>
            All requests must use <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">application/json</code>
          </li>
          <li>
            All responses are <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">application/json</code>
          </li>
          <li>
            Streaming responses use <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">text/event-stream</code>
          </li>
        </ul>
      </section>

      {/* OpenAPI */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">OpenAPI Specification</h2>
        <p className="text-muted">
          Download the complete OpenAPI 3.1 specification for use with code generators
          and API clients.
        </p>
        <div className="flex gap-3">
          <a
            href="/api/v1/docs/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-primary hover:bg-tertiary transition-colors"
          >
            📄 OpenAPI JSON
          </a>
          <a
            href="/api/v1/docs/openapi.yaml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-primary hover:bg-tertiary transition-colors"
          >
            📄 OpenAPI YAML
          </a>
        </div>
      </section>
    </div>
  )
}
