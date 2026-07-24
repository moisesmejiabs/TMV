# Account Inventory

This file contains references only. Never store passwords, tokens, keys, secret
values, recovery codes, or production data here.

| Service | Account/resource reference | Purpose | Secret location/status |
| --- | --- | --- | --- |
| GitHub | Owner `moisesmejiabs`, repository `TMV` | Source control | Authorized local Git/GitHub credential store; verify identity before push |
| Cloudflare | Worker `tu-mejor-version` | Production hosting | Authorized Wrangler session; verify account before deploy |
| Cloudflare D1 | Database `tumejorversion` | Application data | Access inherited from authorized Cloudflare account |
| Cloudflare R2 | Bucket `tumejorversion-assets` | Media and PDF storage | Access inherited from authorized Cloudflare account |
| Cloudflare Worker secret | `JWT_SECRET` | Session signing | Cloudflare secret storage; value must not be recorded |
| Local development | `.dev.vars` (ignored) | Local-only JWT secret | Developer machine only; never use the production value |
| Android SMS gateway | `SMS_GATEWAY_TOKEN` | Authorizes one dedicated gateway device | Cloudflare secret storage and Android Keystore; value must not be recorded |
