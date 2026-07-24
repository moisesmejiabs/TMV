# Operations

## Routine checks

- Verify public pages through `https://tumejorversion-li.org`.
- Verify authenticated routes redirect unauthenticated users to login.
- Verify admin-only pages reject non-admin users.
- Check Cloudflare Worker logs for application errors without exposing tokens
  or personal information.

## Local development

Use `npm run dev` with a local-only `.dev.vars`. Do not connect local testing to
production D1 or R2 unless the user explicitly authorizes a narrowly scoped,
read-only diagnostic.

## Database migrations

Migrations live in `migrations/`. Review each migration and prepare a backup and
rollback strategy before applying it remotely. The configured command is:

```bash
npm run d1:migrate
```

Running that command against production requires explicit authorization.
The command must include `--remote`; without it, current Wrangler versions
operate on a local D1 database.

Before a production migration, capture the current Time Travel bookmark:

```bash
npx wrangler d1 time-travel info tumejorversion
```

Record the bookmark in the private deployment record. If rollback is required,
review the impact of restoring all intervening writes, then use Cloudflare D1
Time Travel with that bookmark. A restore overwrites the database and requires
separate explicit authorization.

## Sensitive data

Milk registrations, account records, phone numbers, and baby information are
sensitive. Avoid printing them in logs, terminal output, screenshots, issue
reports, or documentation. Administrative exports should be handled only by
authorized users.

## Incident response

For suspected credential exposure, stop deployment activity, rotate the
affected secret in the provider, invalidate sessions when applicable, and
document the incident without recording the secret value.

## Android SMS gateway

See `Documentation/SMSGateway.md`. Stop the Android service immediately if the
phone, SIM, or gateway credential may be compromised. Rotate only
`SMS_GATEWAY_TOKEN`; never share or reuse `JWT_SECRET`.
