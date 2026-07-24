# Customer Record

## Identity

- Customer: Tu Mejor Versión
- Project: TMV website and community application
- Status: Active production project
- Repository: `https://github.com/moisesmejiabs/TMV`
- Planned production branch: `main`
- Current operational release branch: `live-release-2026-07-24`

The current branch is a temporary operational exception based on the verified
July 24, 2026 deployment history. Reconcile it into `main` before returning to
the planned production workflow.

## Approved destinations

- Primary domain: `https://tumejorversion-li.org`
- Secondary domain: `https://www.tumejorversion-li.org`
- Hosting: Cloudflare Worker `tu-mejor-version`
- Database: Cloudflare D1 database `tumejorversion`
- Asset storage: Cloudflare R2 bucket `tumejorversion-assets`

Cloudflare account identity must be verified through the authenticated Wrangler
session before deployment. A `workers.dev` test destination is not approved and
must remain disabled.

## Scope

The application provides public organizational pages, events, courses,
workshops, media, user registration and authentication, donations, and a
protected baby-formula giveaway registration workflow with an administrative
export view.

## Data sensitivity

User accounts and milk-giveaway registrations contain personal information.
Production data must not be copied into the repository or local development
environment.
