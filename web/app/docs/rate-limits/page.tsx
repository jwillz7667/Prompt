export default function RateLimitsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-primary mb-2 text-3xl font-bold">Rate Limits</h1>
        <p className="text-muted text-lg">Understand API rate limits and quotas.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Tier Limits</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-primary px-4 py-3 text-left font-medium">Tier</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Monthly Requests</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Requests/Minute</th>
                <th className="text-primary px-4 py-3 text-left font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-border border-b">
                <td className="text-primary px-4 py-3 font-medium">Free</td>
                <td className="px-4 py-3">100</td>
                <td className="px-4 py-3">10</td>
                <td className="px-4 py-3">$0</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-primary px-4 py-3 font-medium">Starter</td>
                <td className="px-4 py-3">1,000</td>
                <td className="px-4 py-3">60</td>
                <td className="px-4 py-3">$29/mo</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-primary px-4 py-3 font-medium">Pro</td>
                <td className="px-4 py-3">10,000</td>
                <td className="px-4 py-3">100</td>
                <td className="px-4 py-3">$99/mo</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-primary px-4 py-3 font-medium">Enterprise</td>
                <td className="px-4 py-3">Unlimited</td>
                <td className="px-4 py-3">1,000+</td>
                <td className="px-4 py-3">Custom</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Rate Limit Headers</h2>
        <p className="text-muted">Every response includes rate limit information:</p>
        <div className="bg-secondary space-y-2 rounded-lg p-4">
          <div className="font-mono text-sm">
            <span className="text-muted">X-RateLimit-Limit:</span>{' '}
            <span className="text-primary">60</span>
          </div>
          <div className="font-mono text-sm">
            <span className="text-muted">X-RateLimit-Remaining:</span>{' '}
            <span className="text-primary">45</span>
          </div>
          <div className="font-mono text-sm">
            <span className="text-muted">X-RateLimit-Reset:</span>{' '}
            <span className="text-primary">1704067200</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Handling 429 Errors</h2>
        <p className="text-muted">
          When you exceed rate limits, the API returns a 429 status code. Use exponential backoff:
        </p>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`async function enhanceWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      await sleep(retryAfter * 1000 * Math.pow(2, i));
      continue;
    }

    return response.json();
  }
  throw new Error('Max retries exceeded');
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Overage Billing</h2>
        <p className="text-muted">
          Starter and Pro tiers allow overage requests at $0.01 per 100 requests. Free tier does not
          allow overage.
        </p>
      </section>
    </div>
  )
}
