import Link from 'next/link'

export default function AuthenticationPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">Authentication</h1>
        <p className="text-lg text-muted">
          Learn how to authenticate your API requests.
        </p>
      </div>

      {/* API Keys */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">API Keys</h2>
        <p className="text-muted">
          The Promptomize API uses API keys for authentication. Include your key in the
          <code className="bg-secondary px-1.5 py-0.5 rounded text-sm mx-1">X-API-Key</code>
          header with every request.
        </p>

        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`curl https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: pk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Hello world", "modality": "text"}'`}
          </pre>
        </div>
      </section>

      {/* Key Format */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Key Format</h2>
        <p className="text-muted">API keys follow this format:</p>
        <ul className="list-disc list-inside text-muted space-y-2">
          <li>
            <strong className="text-primary">Production keys:</strong>{' '}
            <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">pk_live_</code> prefix
          </li>
          <li>
            <strong className="text-primary">Test keys:</strong>{' '}
            <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">pk_test_</code> prefix
          </li>
        </ul>
        <p className="text-muted">
          Test keys are useful for development without affecting your production quota.
        </p>
      </section>

      {/* Creating Keys */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Creating API Keys</h2>
        <ol className="list-decimal list-inside text-muted space-y-2">
          <li>
            Go to the{' '}
            <Link href="/developers/keys" className="text-accent hover:underline">
              API Keys page
            </Link>
          </li>
          <li>Click &quot;Create API Key&quot;</li>
          <li>Choose a name and select permissions</li>
          <li>Copy your key immediately (it won&apos;t be shown again)</li>
        </ol>
      </section>

      {/* Permissions */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Permissions</h2>
        <p className="text-muted">Each API key has specific permissions:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-primary font-medium">Permission</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Description</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Endpoints</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code className="bg-secondary px-1 rounded">enhance</code></td>
                <td className="py-2 px-4">Use the enhance endpoint</td>
                <td className="py-2 px-4"><code>POST /public/enhance</code></td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code className="bg-secondary px-1 rounded">read_history</code></td>
                <td className="py-2 px-4">Read enhancement history</td>
                <td className="py-2 px-4"><code>GET /public/history</code></td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code className="bg-secondary px-1 rounded">models</code></td>
                <td className="py-2 px-4">List available options</td>
                <td className="py-2 px-4"><code>GET /public/models</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Security Best Practices */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Security Best Practices</h2>
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-3">
          <h3 className="font-medium text-primary">Keep Your Keys Safe</h3>
          <ul className="list-disc list-inside text-sm text-muted space-y-1">
            <li>Never commit API keys to version control</li>
            <li>Use environment variables to store keys</li>
            <li>Don&apos;t expose keys in client-side code</li>
            <li>Rotate keys periodically</li>
            <li>Use separate keys for production and development</li>
          </ul>
        </div>

        <div className="rounded-lg bg-secondary overflow-hidden">
          <div className="px-4 py-2 bg-tertiary border-b border-border">
            <span className="text-xs font-medium text-muted">Environment Variables</span>
          </div>
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`# .env file (never commit this!)
PROMPTOMIZE_API_KEY=pk_live_your_api_key

# Use in your code
import os
api_key = os.environ.get("PROMPTOMIZE_API_KEY")`}
          </pre>
        </div>
      </section>

      {/* Key Rotation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Key Rotation</h2>
        <p className="text-muted">
          When you rotate a key, a new key is generated and the old key remains valid for 24 hours.
          This allows you to update your applications without downtime.
        </p>
        <ol className="list-decimal list-inside text-muted space-y-2">
          <li>Go to API Keys and click &quot;Rotate&quot; on the key</li>
          <li>Copy the new key immediately</li>
          <li>Update your applications within 24 hours</li>
          <li>The old key will automatically expire</li>
        </ol>
      </section>
    </div>
  )
}
