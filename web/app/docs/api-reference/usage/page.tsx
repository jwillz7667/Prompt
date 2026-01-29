export default function UsageEndpointPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
            GET
          </span>
          <code className="text-lg text-primary">/public/usage</code>
        </div>
        <p className="text-lg text-muted">Get current usage and quota information.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Example Request</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`curl https://api.promptomize.app/api/v1/public/usage \\
  -H "X-API-Key: pk_live_your_api_key"`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Response</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "tier": "API_STARTER",
  "status": "ACTIVE",
  "quota": {
    "used": 450,
    "limit": 1000,
    "remaining": 550,
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-02-01T00:00:00Z"
  },
  "rateLimit": {
    "requestsPerMinute": 60
  },
  "features": [
    "1,000 requests/month",
    "60 requests/minute",
    "Email support"
  ]
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Response Fields</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-primary font-medium">Field</th>
                <th className="text-left py-2 px-4 text-primary font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>tier</code></td>
                <td className="py-2 px-4">Current subscription tier</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>status</code></td>
                <td className="py-2 px-4">Subscription status (ACTIVE, PAST_DUE, etc.)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>quota.used</code></td>
                <td className="py-2 px-4">Requests used in current period</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>quota.limit</code></td>
                <td className="py-2 px-4">Total requests allowed (or &quot;unlimited&quot;)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>quota.remaining</code></td>
                <td className="py-2 px-4">Requests remaining in period</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>quota.periodEnd</code></td>
                <td className="py-2 px-4">When the current period ends</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-4"><code>rateLimit.requestsPerMinute</code></td>
                <td className="py-2 px-4">Per-minute rate limit</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
