# Open Issues

## Security review

- Review and remove any bootstrap/default administrator credential behavior
  before relying on the application for broader production use.
- Confirm session expiration, cookie flags, CSRF protections, authorization
  checks, and rate limiting against the current production requirements.
- Confirm administrative CSV/data exports apply appropriate access control and
  handling guidance.

## Engineering

- Add automated tests for authentication, protected milk registration,
  admin-only access, and major public routes.
- Add a repeatable smoke-test checklist or script for production releases.
- Document D1 backup and restore procedures after they are verified against the
  active Cloudflare account.

Items in this file are records, not authorization to change production.
