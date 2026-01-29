export default function RateLimitsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">Rate Limits</h1>
        <p className="text-lg text-muted">
          Understand API rate limits and quotas.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Tier Limits</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-primary font-medium">Tier</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Monthly Requests</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Requests/Minute</th>
                <th className="text-left py-3 px-4 text-primary font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-medium text-primary">Free</td>
                <td className="py-3 px-4">100</td>
                <td className="py-3 px-4">10</td>
                <td className="py-3 px-4">$0</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-medium text-primary">Starter</td>
                <td className="py-3 px-4">1,000</td>
                <td className="py-3 px-4">60</td>
                <td className="py-3 px-4">$29/mo</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-medium text-primary">Pro</td>
                <td className="py-3 px-4">10,000</td>
                <td className="py-3 px-4">100</td>
                <td className="py-3 px-4">$99/mo</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-medium text-primary">Enterprise</td>
                <td className="py-3 px-4">Unlimited</td>
                <td className="py-3 px-4">1,000+</td>
                <td className="py-3 px-4">Custom</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Rate Limit Headers</h2>
        <p className="text-muted">Every response includes rate limit information:</p>
        <div className="rounded-lg bg-secondary p-4 space-y-2">
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
        <h2 className="text-2xl font-semibold text-primary">Handling 429 Errors</h2>
        <p className="text-muted">
          When you exceed rate limits, the API returns a 429 status code. Use exponential backoff:
        </p>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
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
        <h2 className="text-2xl font-semibold text-primary">Overage Billing</h2>
        <p className="text-muted">
          Starter and Pro tiers allow overage requests at $0.01 per 100 requests.
          Free tier does not allow overage.
        </p>
      </section>
    </div>
  )
}
