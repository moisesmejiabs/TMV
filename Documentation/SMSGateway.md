# Android SMS Gateway

## Status

Production gateway activated July 24, 2026.

- Worker version: `d3789c29-41b5-4a98-b4fe-4f372b486852`
- D1 migration: `0002_sms_gateway.sql`
- Device: Samsung Galaxy S24 Ultra (`SM-S928U1`)
- Android: 16 / API 36
- Cellular configuration: Optimum dual-SIM, TMV sends through SIM 1
- First consented end-to-end test: message `#1`, one claim, carrier-confirmed
  `delivered`, no reported error

## Design

1. An authorized TMV administrator queues a message.
2. The Android phone polls the Worker over HTTPS using a dedicated bearer
   credential.
3. The Worker leases one queued message to that device for 90 seconds.
4. Android sends the message through the phone's SIM.
5. The phone reports `sent` or `failed`; expired claims return to the queue.

The queue supports at most five claims per message. Phone numbers must be in
E.164 format. Message creation is admin-only, while gateway endpoints accept
only `SMS_GATEWAY_TOKEN`.

## Components

- Migration: `migrations/0002_sms_gateway.sql`
- Worker routes:
  - `POST /api/admin/sms/messages`
  - `GET /api/admin/sms/messages/:id`
  - `POST /api/sms-gateway/claim`
  - `POST /api/sms-gateway/messages/:id/status`
- Milk phone-verification routes (local, pending production activation):
  - `POST /api/milk-phone-verification/request`
  - `POST /api/milk-phone-verification/verify`
- Android source: `android-sms-gateway/`

## Local setup

Create a unique development-only token in `.dev.vars`:

```text
SMS_GATEWAY_TOKEN=<unique-local-value>
```

Apply `0002_sms_gateway.sql` only to a disposable local D1 database during
development. Do not apply it remotely without explicit authorization and the
database procedure in `Documentation/Operations.md`.

## Security and operational rules

- The phone must be dedicated to TMV, encrypted, PIN-protected, and kept
  physically secure.
- Never expose the gateway token in URLs, Git, logs, screenshots, or support
  messages.
- Record recipient consent before queuing automated SMS.
- Preserve the OTP cooldown and daily per-user, per-number, and per-IP limits.
- Monitor carrier plan terms and message volume. A consumer unlimited plan may
  prohibit automated application messaging.
- Stop the gateway and rotate the token if the device or SIM is lost.
- Keep the Android persistent notification visible while the gateway operates.

## Operational limitations

- `sent` means every SMS part received Android's successful send callback.
- `delivered` requires a carrier delivery receipt for every part; some
  recipients or networks may not return one.
- The current dedicated device configuration is fixed to physical SIM 1.
- Status reporting retries three times; extended network outages still require
  operational review.
- Milk-registration OTP is implemented locally and requires migration
  `0003_milk_phone_verification.sql` before production activation.
- Six-digit OTPs expire after 10 minutes, allow five attempts, and are stored
  only as keyed hashes. Successful verification credentials expire after 15
  minutes and can be consumed by one milk registration.
