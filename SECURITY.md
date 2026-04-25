# Security Policy

Promptomize takes the security of its users, data, and infrastructure seriously. This
document explains how to report vulnerabilities and what you can expect from us in return.

## Supported Versions

We patch security issues against the latest production release of each component:

| Component | Supported Versions |
|-----------|--------------------|
| iOS App   | Latest App Store release on a supported iOS major (iOS 17+) |
| Web App   | Latest deployed `main` (`promptomize.app`) |
| Backend   | Latest deployed `main` (Railway production) |
| ChatGPT App | Latest deployed `main` |

Older builds are **not** patched. If you discover a security issue in an older build,
please update before reporting.

## Reporting a Vulnerability

**Do not open a public GitHub issue or pull request for a security vulnerability.**

Please report privately via one of:

1. **Email** — [security@promptomize.app](mailto:security@promptomize.app)
2. **GitHub Private Vulnerability Reporting** — open a draft via the *Security → Report a
   vulnerability* tab on this repository (only visible to maintainers).

To help us triage quickly, include:

- A clear description of the issue and its impact.
- Step-by-step reproduction (proof-of-concept code, requests, or recordings).
- The component affected (`backend`, `web`, `iOS`, `chatgpt-app`, `infrastructure`).
- Any disclosure constraints (e.g. coordinated disclosure deadlines).
- Whether you would like public credit when a fix is published.

If the issue involves user data exposure, please do **not** download, store, or share the
data — describe what you observed and stop.

## Our Response Commitment

| Severity | Acknowledgement | Initial assessment | Target fix |
|----------|-----------------|--------------------|-----------|
| Critical (RCE, data exfiltration, auth bypass, payment manipulation) | Within 24 hours | Within 72 hours | 7 days |
| High (privilege escalation, sensitive info disclosure) | Within 48 hours | 5 business days | 14 days |
| Medium (CSRF, IDOR with limited blast radius) | 5 business days | 10 business days | 30 days |
| Low (rate-limit gaps, information leakage with negligible impact) | 10 business days | 20 business days | Best effort |

We will keep you informed throughout the triage and remediation process and notify you
when a fix is deployed.

## Safe Harbor

We will not pursue legal action against good-faith security research that:

- Avoids privacy violations, destruction of data, and disruption of service.
- Limits testing to accounts you own or have explicit permission to access.
- Stops at the moment a vulnerability is confirmed and reports it promptly.
- Does not extort, blackmail, or publicly disclose the issue prior to remediation.

We treat such research as authorized under our Terms of Service.

## Out of Scope

The following are explicitly out of scope and will be closed without action:

- Reports based solely on automated scanner output without a working PoC.
- Missing security headers without a demonstrable impact.
- Self-XSS that requires the victim to paste attacker-controlled code.
- Denial-of-service attacks against production infrastructure.
- Issues in third-party services or platforms outside our control (Apple, Stripe,
  Railway, Vercel, OpenAI, Anthropic, Google, DeepSeek, etc.) — please report those to
  the respective vendors.
- Social engineering of staff, contractors, or users.
- Physical attacks against our offices, hardware, or personnel.

## Disclosure Policy

We follow **coordinated disclosure**. Once a fix is deployed and rolled out to production
users, we will:

1. Publish a security advisory describing the issue, affected versions, and resolution.
2. Credit the reporter (with consent).
3. Update [`CHANGELOG.md`](./CHANGELOG.md) under a `Security` section.

## Contact

- **Security email:** [security@promptomize.app](mailto:security@promptomize.app)
- **PGP key:** Available on request via the security email.

Thank you for helping keep Promptomize and its users safe.
