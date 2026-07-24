# Project Instructions

## Customer Boundary

- This repository is exclusively for Tu Mejor Versión.
- The approved repository is `moisesmejiabs/TMV`.
- Approved production domains: `tumejorversion-li.org` and
  `www.tumejorversion-li.org`.
- Approved hosting destination: Cloudflare Worker `tu-mejor-version`, using
  the account available through the customer's authorized Wrangler session.
- Stop and report a mismatch if a request names another customer, repository,
  domain, Git destination, or hosting destination.
- Do not copy source, assets, configuration, records, production data, or
  credentials between customer projects without an explicitly approved and
  verified migration.

## Repository Structure

- Application code: `src/`.
- Public assets: `public/`.
- Automation: `scripts/`.
- Project records: `Documentation/`.
- Durable project instructions: `Documentation/Instructions/`.
- Credential references: `Credentials/AccountInventory.md`.
- Retired project material: `Archive/`.
- Encrypted local backups only: `Backups/`.

## Required Commands

- Install: `npm ci`.
- Test/type-check: `npx tsc --noEmit`.
- Build/configuration validation: `npx wrangler deploy --dry-run`.
- Verified deployment: `npm run deploy`, only after completing the production
  checklist in `Documentation/Deployment.md`.

Do not deploy until all placeholders are replaced and the customer, repository,
domain, account, project, branch, and credential scope have been verified.

## Credentials and Generated Files

- Never commit actual secrets or local credential files.
- Never place tokens, passwords, keys, production data, generated builds,
  dependency directories, provider state, or unencrypted backups in Git.

## Additional Project Rules

- Production is the custom-domain Worker. Do not enable or deploy a
  `workers.dev` or preview environment.
- Do not deploy unless the user explicitly requests it in the current task.
- Do not change D1 production data, run remote migrations, or modify R2 objects
  without explicit authorization and a verified backup/rollback plan.
- `JWT_SECRET` is a Cloudflare Worker secret. Never write its value to Git,
  documentation, chat output, or shell logs.
- Preserve authentication requirements for protected milk-registration and
  administrative routes.
- Treat milk-registration records and user information as sensitive personal
  data. Do not copy production records into local development.
- Keep shared header, typography, and spacing behavior consistent across pages
  unless the request explicitly scopes a page-specific exception.
- Do not modify unrelated pages when the user names a specific route or page.
