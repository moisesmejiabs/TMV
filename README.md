# Tu Mejor Versión (TMV)

Production website and community application for Tu Mejor Versión. Cloudflare
Workers hosts the API and static site, D1 stores application data, and R2 stores
uploaded media and generated PDF receipts.

## Project identity

- Customer: Tu Mejor Versión
- Repository: `moisesmejiabs/TMV`
- Production: `https://tumejorversion-li.org`
- Cloudflare Worker: `tu-mejor-version`
- Planned production branch: `main`
- Current operational release branch: `live-release-2026-07-24`

Read `AGENTS.md`, every file in `Documentation/Instructions/`, and
`CUSTOMER.md` before changing the project or proposing a deployment.

## Local development

```bash
npm ci
npm run dev
```

Open the local URL printed by Wrangler. Local development requires a
non-production `JWT_SECRET` in `.dev.vars`; never commit that file or reuse the
production value.

## Validation

```bash
npx tsc --noEmit
npx wrangler deploy --dry-run
```

## Deployment

Deployment is production-impacting and requires an explicit user request plus
the checks in `Documentation/Deployment.md`.

```bash
npm run deploy
```

Never deploy to a `workers.dev` test address. The project configuration keeps
`workers_dev` and preview URLs disabled.

## Participant management

Participant directory, reusable-list, event-snapshot, role, and migration
details are in
[`Documentation/ParticipantLists.md`](Documentation/ParticipantLists.md).
