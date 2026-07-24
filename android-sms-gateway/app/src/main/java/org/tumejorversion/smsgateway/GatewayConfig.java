package org.tumejorversion.smsgateway;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

final class GatewayConfig {
    private static final String PREFS = "gateway_config";
    private static final String URL = "base_url";
    private static final String TOKEN = "gateway_token";
    private static final String DEVICE = "gateway_id";
    static final int SMS_SIM_SLOT = 0;

    static void save(Context context, String baseUrl, String token) throws Exception {
        String normalized = baseUrl.trim().replaceAll("/+$", "");
        java.net.URI endpoint = new java.net.URI(normalized);
        String host = endpoint.getHost();
        if (!"https".equalsIgnoreCase(endpoint.getScheme())
                || host == null
                || (!host.equalsIgnoreCase("tumejorversion-li.org")
                    && !host.equalsIgnoreCase("www.tumejorversion-li.org"))
                || endpoint.getUserInfo() != null
                || endpoint.getPort() != -1
                || (endpoint.getPath() != null && !endpoint.getPath().isEmpty())
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null) {
            throw new IllegalArgumentException("Use the approved TMV HTTPS endpoint");
        }
        String cleanToken = token.trim();
        if (cleanToken.isEmpty()) throw new IllegalArgumentException("Gateway token is required");
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        preferences.edit()
                .putString(URL, normalized)
                .putString(TOKEN, SecretStore.encrypt(cleanToken))
                .putString(DEVICE, deviceId(context))
                .apply();
    }

    static String baseUrl(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(URL, "");
    }

    static String token(Context context) throws Exception {
        String encrypted = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN, "");
        return encrypted.isEmpty() ? "" : SecretStore.decrypt(encrypted);
    }

    static String gatewayId(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return preferences.getString(DEVICE, deviceId(context));
    }

    private static String deviceId(Context context) {
        String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        return "tmv-android-" + (androidId == null ? "unknown" : androidId);
    }

    private GatewayConfig() {}
}
