# Tu Mejor Versión — Cloudflare Workers + D1 + R2

## What this is
- **Workers** hosts the API and serves static pages from `./public`.
- **D1** is the SQLite database.
- **R2** stores receipts (PDF) and uploaded media files.

## Setup

### 1) Install
```bash
npm install
```

### 2) Create D1 + apply migration
```bash
wrangler d1 create tumejorversion
# copy the returned database_id into wrangler.toml

wrangler d1 migrations apply tumejorversion
```

### 3) Create R2 bucket
```bash
wrangler r2 bucket create tumejorversion-assets
```

### 4) Set JWT secret
Generate a long random secret:
```bash
openssl rand -base64 48
```
Put it in `wrangler.toml` under `[vars]`.

### 5) Run locally
```bash
npm run dev
```

Open the local URL shown by Wrangler.

## Default admin
If there are **no users**, the worker creates a default admin:
- `admin@example.com`
- `admin1234`

Change this immediately by creating a new admin user flow (recommended) or editing the DB.

## Notes vs your Flask version
- Flask/Jinja templates were replaced by simple static pages + `fetch()` calls.
- Password hashing uses PBKDF2 (WebCrypto) instead of Werkzeug.
- Receipts are generated with `pdf-lib` and stored in R2.
- `/uploads/<...>` are served from R2 (public read in MVP).

Participant directory, reusable-list, event-snapshot, role, and migration
details are in
[`Documentation/ParticipantLists.md`](Documentation/ParticipantLists.md).
