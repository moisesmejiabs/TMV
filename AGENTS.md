# Tu Mejor Versión Project Instructions

## Scope

This repository contains the production project and operational records for
Tu Mejor Versión.

## Required Reading

Before changing files, running project commands, or proposing a deployment:

1. Read every Markdown file in `Documentation/Instructions/`.
2. Read `README.md` and `CUSTOMER.md`.
3. Confirm that the requested customer, repository, and approved domains match
   this project.
4. Confirm the Cloudflare Worker, D1 database, and R2 bucket before any
   deployment or production data operation.

The files in `Documentation/Instructions/` contain the durable project-specific
rules. They supplement machine-wide Codex guidance and take precedence for this
repository when they are more specific.

Never deploy to a `workers.dev` test environment. The approved deployment is
the production custom-domain Worker described in `CUSTOMER.md`.
