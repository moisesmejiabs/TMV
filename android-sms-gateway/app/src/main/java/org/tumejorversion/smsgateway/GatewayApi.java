package org.tumejorversion.smsgateway;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class GatewayApi {
    static final class Message {
        final long id;
        final String recipient;
        final String text;
        final String claimToken;

        Message(JSONObject value) {
            id = value.optLong("id");
            recipient = value.optString("recipient");
            text = value.optString("message");
            claimToken = value.optString("claim_token");
        }
    }

    static Message claim(String baseUrl, String token, String gatewayId) throws Exception {
        HttpURLConnection connection = open(baseUrl + "/api/sms-gateway/claim", token);
        writeJson(connection, new JSONObject().put("gateway_id", gatewayId));
        int status = connection.getResponseCode();
        if (status == 204) return null;
        String response = read(connection, status);
        if (status != 200) throw new IllegalStateException("Claim failed: HTTP " + status);
        return new Message(new JSONObject(response).getJSONObject("message"));
    }

    static void report(String baseUrl, String token, Message message, String status, String error)
            throws Exception {
        report(baseUrl, token, message.id, message.claimToken, status, error);
    }

    static void report(String baseUrl, String token, long messageId, String claimToken,
                       String status, String error) throws Exception {
        HttpURLConnection connection = open(
                baseUrl + "/api/sms-gateway/messages/" + messageId + "/status", token);
        JSONObject body = new JSONObject()
                .put("claim_token", claimToken)
                .put("status", status);
        if (error != null) body.put("error", error);
        writeJson(connection, body);
        int responseStatus = connection.getResponseCode();
        read(connection, responseStatus);
        if (responseStatus != 200) {
            throw new IllegalStateException("Status report failed: HTTP " + responseStatus);
        }
    }

    private static HttpURLConnection open(String endpoint, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(15_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        return connection;
    }

    private static void writeJson(HttpURLConnection connection, JSONObject body) throws Exception {
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String read(HttpURLConnection connection, int status) throws Exception {
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) return "";
        StringBuilder value = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) value.append(line);
        }
        return value.toString();
    }

    private GatewayApi() {}
}
