# Deployment

## Approved production destination

- Repository: `moisesmejiabs/TMV`
- Planned source branch: `main`
- Current operational release branch: `live-release-2026-07-24`
- Cloudflare Worker: `tu-mejor-version`
- Routes: `tumejorversion-li.org/*` and `www.tumejorversion-li.org/*`
- `workers.dev`: disabled
- Preview URLs: disabled

## Preflight checklist

1. Confirm the current customer is Tu Mejor Versión.
2. Confirm `git remote get-url origin` is
   `https://github.com/moisesmejiabs/TMV.git`.
3. Confirm the intended release commit is on or destined for `main`.
4. Confirm `wrangler.toml` names Worker `tu-mejor-version`, the approved custom
   domains, D1 database, and R2 bucket.
5. Run `npm ci`, `npx tsc --noEmit`, and
   `npx wrangler deploy --dry-run`.
6. Confirm the authenticated Cloudflare account owns the approved resources.
7. Obtain an explicit deployment request from the user.

## Temporary branch exception

The July 24, 2026 production deployment history matches
`live-release-2026-07-24`, and the remote default branch currently points to
that branch. The user explicitly authorized continuing from it for the Android
SMS gateway activation. `main` remains the planned production branch; reconcile
the operational branch into `main` before returning to the standard workflow.

## Production deployment

```bash
npm run deploy
```

After deployment, verify the production custom domain and the specific changed
routes. Do not use or re-enable a `workers.dev` environment.

## Rollback

Identify the last known-good Git commit and Cloudflare deployment before
release. If rollback is necessary, deploy that reviewed commit. Database or
storage changes require a separate data-safe rollback plan; never assume a code
rollback reverses D1 or R2 mutations.
