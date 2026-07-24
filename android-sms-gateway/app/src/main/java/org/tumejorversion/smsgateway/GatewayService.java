package org.tumejorversion.smsgateway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class GatewayService extends Service {
    static final String ACTION_START = "org.tumejorversion.smsgateway.START";
    static final String ACTION_STOP = "org.tumejorversion.smsgateway.STOP";
    static final String ACTION_REPORT = "org.tumejorversion.smsgateway.REPORT";
    private static final String CHANNEL = "tmv_gateway";
    private static final int NOTIFICATION_ID = 2201;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ExecutorService reportExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean running;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(
                CHANNEL, "TMV SMS Gateway", NotificationManager.IMPORTANCE_LOW));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIFICATION_ID, notification("Gateway active"));
        if (intent != null && ACTION_REPORT.equals(intent.getAction())) {
            long messageId = intent.getLongExtra(SmsStatusReceiver.EXTRA_MESSAGE_ID, 0);
            String claimToken = intent.getStringExtra(SmsStatusReceiver.EXTRA_CLAIM_TOKEN);
            String status = intent.getStringExtra(SmsStatusReceiver.EXTRA_STATUS);
            String error = intent.getStringExtra(SmsStatusReceiver.EXTRA_ERROR);
            reportExecutor.execute(() -> reportStatus(messageId, claimToken, status, error));
        }
        if (!running) {
            running = true;
            executor.execute(this::pollLoop);
        }
        return START_STICKY;
    }

    private void pollLoop() {
        while (running) {
            try {
                if (checkSelfPermission(android.Manifest.permission.SEND_SMS)
                        != PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                        != PackageManager.PERMISSION_GRANTED) {
                    updateNotification("SMS and phone permissions required");
                    Thread.sleep(10_000);
                    continue;
                }
                String baseUrl = GatewayConfig.baseUrl(this);
                String token = GatewayConfig.token(this);
                if (baseUrl.isEmpty() || token.isEmpty()) {
                    updateNotification("Configuration required");
                    Thread.sleep(10_000);
                    continue;
                }
                GatewayApi.Message message = GatewayApi.claim(
                        baseUrl, token, GatewayConfig.gatewayId(this));
                if (message == null) {
                    updateNotification("Connected · waiting");
                    Thread.sleep(10_000);
                    continue;
                }
                send(message);
                updateNotification("SMS submitted on SIM 1: #" + message.id);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                running = false;
            } catch (Exception error) {
                updateNotification("Gateway error · retrying");
                try {
                    Thread.sleep(15_000);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    running = false;
                }
            }
        }
    }

    private void send(GatewayApi.Message message) {
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Phone-state permission is required for SIM 1");
        }
        SubscriptionManager subscriptions = getSystemService(SubscriptionManager.class);
        SubscriptionInfo sim = subscriptions.getActiveSubscriptionInfoForSimSlotIndex(
                GatewayConfig.SMS_SIM_SLOT);
        if (sim == null) throw new IllegalStateException("SIM 1 is not active");
        SmsManager manager;
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            manager = getSystemService(SmsManager.class)
                    .createForSubscriptionId(sim.getSubscriptionId());
        } else {
            manager = SmsManager.getSmsManagerForSubscriptionId(sim.getSubscriptionId());
        }
        ArrayList<String> parts = manager.divideMessage(message.text);
        SmsStatusReceiver.prepare(this, message.id, parts.size());
        if (parts.size() == 1) {
            manager.sendTextMessage(
                    message.recipient,
                    null,
                    message.text,
                    statusIntent(message, SmsStatusReceiver.PHASE_SENT, 0, parts.size()),
                    statusIntent(message, SmsStatusReceiver.PHASE_DELIVERED, 0, parts.size()));
        } else {
            ArrayList<PendingIntent> sent = new ArrayList<>();
            ArrayList<PendingIntent> delivered = new ArrayList<>();
            for (int index = 0; index < parts.size(); index++) {
                sent.add(statusIntent(message, SmsStatusReceiver.PHASE_SENT, index, parts.size()));
                delivered.add(statusIntent(
                        message, SmsStatusReceiver.PHASE_DELIVERED, index, parts.size()));
            }
            manager.sendMultipartTextMessage(message.recipient, null, parts, sent, delivered);
        }
    }

    private PendingIntent statusIntent(GatewayApi.Message message, String phase,
                                       int partIndex, int partCount) {
        Intent intent = new Intent(this, SmsStatusReceiver.class)
                .putExtra(SmsStatusReceiver.EXTRA_MESSAGE_ID, message.id)
                .putExtra(SmsStatusReceiver.EXTRA_CLAIM_TOKEN, message.claimToken)
                .putExtra(SmsStatusReceiver.EXTRA_PHASE, phase)
                .putExtra(SmsStatusReceiver.EXTRA_PART_INDEX, partIndex)
                .putExtra(SmsStatusReceiver.EXTRA_PART_COUNT, partCount);
        int phaseOffset = SmsStatusReceiver.PHASE_SENT.equals(phase) ? 0 : 10_000;
        int requestCode = (int) ((message.id * 37 + phaseOffset + partIndex) & 0x7fffffff);
        return PendingIntent.getBroadcast(
                this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void reportStatus(long messageId, String claimToken, String status, String error) {
        if (messageId <= 0 || claimToken == null || status == null) return;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                GatewayApi.report(
                        GatewayConfig.baseUrl(this),
                        GatewayConfig.token(this),
                        messageId,
                        claimToken,
                        status,
                        error);
                updateNotification("SMS #" + messageId + " · " + status);
                return;
            } catch (Exception ignored) {
                if (attempt < 3) {
                    try {
                        Thread.sleep(attempt * 5_000L);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
        updateNotification("Status report failed for SMS #" + messageId);
    }

    private Notification notification(String text) {
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle("TMV SMS Gateway")
                .setContentText(text)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(text));
    }

    @Override public void onDestroy() {
        running = false;
        executor.shutdownNow();
        reportExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }
}
