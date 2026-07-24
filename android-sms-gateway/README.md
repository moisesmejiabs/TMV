# TMV Android SMS Gateway

This sideloaded Android app polls the TMV Worker over HTTPS, claims one queued
message at a time, sends it through SIM 1 with `SmsManager`, and reports
Android send and carrier delivery callbacks.

It is not intended for Google Play distribution. Google Play places additional
restrictions on applications requesting SMS permissions.

## Prerequisites

- Dedicated Android phone with a SIM and an SMS-capable plan
- Android 8.0 or newer
- JDK 17 and Android SDK 35 on the build machine
- A unique gateway token configured as the Worker secret `SMS_GATEWAY_TOKEN`
- The approved HTTPS TMV endpoint

## Build

Open this directory in Android Studio and build a debug APK, or install Gradle
and the Android SDK and run `gradle assembleDebug`.

## Device setup

1. Sideload the APK onto the dedicated phone.
2. Grant SMS, phone-state, and notification permissions.
3. Enter the approved HTTPS endpoint and gateway token.
4. Save, then press **Start gateway**.
5. Exclude the app from manufacturer battery optimization when required.
6. Keep the persistent gateway notification visible.

The token is encrypted with a non-exportable Android Keystore key. Use a
dedicated token; never reuse `JWT_SECRET`.

## Target phone

- Samsung Galaxy S24 Ultra (`SM-S928U1`)
- Android 16 / API 36
- Dual-SIM Dual-Standby
- Optimum on both active subscriptions
- TMV sending subscription: SIM 1

`sent` is recorded only after all SMS parts receive Android send-success
callbacks. `delivered` is recorded only after all parts receive carrier
delivery callbacks. Carrier delivery receipts are network-dependent and may be
delayed or unavailable.
