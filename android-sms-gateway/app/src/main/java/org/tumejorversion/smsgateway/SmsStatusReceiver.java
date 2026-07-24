package org.tumejorversion.smsgateway;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.SmsManager;

public final class SmsStatusReceiver extends BroadcastReceiver {
    static final String EXTRA_MESSAGE_ID = "message_id";
    static final String EXTRA_CLAIM_TOKEN = "claim_token";
    static final String EXTRA_PHASE = "phase";
    static final String EXTRA_PART_INDEX = "part_index";
    static final String EXTRA_PART_COUNT = "part_count";
    static final String EXTRA_STATUS = "status";
    static final String EXTRA_ERROR = "error";
    static final String PHASE_SENT = "sent";
    static final String PHASE_DELIVERED = "delivered";
    private static final String PREFS = "sms_callback_state";
    private static final Object LOCK = new Object();

    static void prepare(Context context, long messageId, int partCount) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putInt(key(messageId, PHASE_SENT), 0)
                .putInt(key(messageId, PHASE_DELIVERED), 0)
                .putBoolean(key(messageId, "terminal"), false)
                .apply();
    }

    @Override public void onReceive(Context context, Intent intent) {
        long messageId = intent.getLongExtra(EXTRA_MESSAGE_ID, 0);
        String claimToken = intent.getStringExtra(EXTRA_CLAIM_TOKEN);
        String phase = intent.getStringExtra(EXTRA_PHASE);
        int partCount = intent.getIntExtra(EXTRA_PART_COUNT, 1);
        if (messageId <= 0 || claimToken == null
                || (!PHASE_SENT.equals(phase) && !PHASE_DELIVERED.equals(phase))) return;

        String completedStatus = null;
        String error = null;
        synchronized (LOCK) {
            SharedPreferences state = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (state.getBoolean(key(messageId, "terminal"), false)) return;
            if (getResultCode() != Activity.RESULT_OK) {
                completedStatus = "failed";
                error = callbackError(phase, getResultCode());
                state.edit().putBoolean(key(messageId, "terminal"), true).apply();
            } else {
                String countKey = key(messageId, phase);
                int count = state.getInt(countKey, 0) + 1;
                state.edit().putInt(countKey, count).apply();
                if (count >= partCount) {
                    completedStatus = phase;
                    if (PHASE_DELIVERED.equals(phase)) {
                        state.edit().putBoolean(key(messageId, "terminal"), true).apply();
                    }
                }
            }
        }

        if (completedStatus != null) {
            Intent report = new Intent(context, GatewayService.class)
                    .setAction(GatewayService.ACTION_REPORT)
                    .putExtra(EXTRA_MESSAGE_ID, messageId)
                    .putExtra(EXTRA_CLAIM_TOKEN, claimToken)
                    .putExtra(EXTRA_STATUS, completedStatus);
            if (error != null) report.putExtra(EXTRA_ERROR, error);
            context.startForegroundService(report);
        }
    }

    private static String callbackError(String phase, int resultCode) {
        if (PHASE_SENT.equals(phase)) {
            if (resultCode == SmsManager.RESULT_ERROR_NO_SERVICE) return "SIM 1 has no service";
            if (resultCode == SmsManager.RESULT_ERROR_RADIO_OFF) return "SIM 1 radio is off";
            if (resultCode == SmsManager.RESULT_ERROR_NULL_PDU) return "Android produced a null PDU";
            if (resultCode == SmsManager.RESULT_ERROR_GENERIC_FAILURE) {
                return "Android SMS send failed";
            }
            return "Android SMS send failed with result " + resultCode;
        }
        return "Carrier delivery failed with result " + resultCode;
    }

    private static String key(long messageId, String name) {
        return messageId + "." + name;
    }
}
