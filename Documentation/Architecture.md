# Architecture

## Runtime

The application is a TypeScript Cloudflare Worker (`src/worker.ts`) that serves
API routes and static files from `public/`.

## Services

- Cloudflare Workers: request routing, authentication, API logic, and static
  asset delivery.
- Cloudflare D1 binding `DB`: users, events, courses, workshops,
  registrations, and related application records.
- Cloudflare R2 binding `R2`: uploaded media and generated PDF receipts.
- Static assets binding `ASSETS`: HTML, CSS, JavaScript, and images in
  `public/`.
- Optional Android SMS gateway: a dedicated, sideloaded phone polls the Worker
  for leased messages and sends them through its SIM.

## Security boundaries

- Authentication uses signed JWT session data; `JWT_SECRET` is stored as a
  Cloudflare Worker secret.
- Milk-giveaway registration requires an authenticated user and a recent,
  single-use SMS verification tied to that user and normalized phone number.
- Administrative milk-registration access requires the application's admin
  authorization checks.
- Production personal data stays in Cloudflare and must not enter Git or local
  fixtures.
- The Android gateway uses its own `SMS_GATEWAY_TOKEN`; it never receives a
  user or administrator session credential.

## Request flow

The Worker receives custom-domain traffic, applies route and authorization
logic, reads or writes D1/R2 when required, and otherwise serves static assets.

For milk registration, the Worker generates a six-digit code, stores only a
keyed hash, and queues the code through the Android SMS gateway. A correct code
produces a short-lived signed credential. Registration validates that
credential against D1 and consumes it once.
