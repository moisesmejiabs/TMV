# Requirements

## Functional scope

- Public organizational, donation, media, event, course, and workshop pages.
- User registration, login, and session-aware navigation.
- Authenticated milk-giveaway receiver registration.
- Admin-only review and export of milk-registration data.
- Event, course, workshop, and media administration.
- English and Spanish presentation where supported by the current UI.

## User experience

- Maintain a consistent TMV header, typography, spacing, and responsive layout.
- Use readable text and accessible, generously sized controls.
- Preserve proportional images and responsive content on desktop and mobile.
- Keep page-specific edits scoped to the routes requested by the user.

## Security and privacy

- Protect authenticated and administrative routes on the server, not only by
  hiding navigation links.
- Keep production secrets in Cloudflare secret storage.
- Do not commit personal data, credentials, generated exports, or local
  environment files.

## Platform

- Node.js and npm
- TypeScript
- Cloudflare Workers, D1, R2, and static assets
- Optional dedicated Android 8+ phone with telephony/SMS capability for the
  local SMS gateway
