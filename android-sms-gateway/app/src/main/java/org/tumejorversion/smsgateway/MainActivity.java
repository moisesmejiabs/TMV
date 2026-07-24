package org.tumejorversion.smsgateway;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private EditText url;
    private EditText token;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("TMV SMS Gateway");
        title.setTextSize(28);
        layout.addView(title);

        TextView instructions = new TextView(this);
        instructions.setText("Configure the approved HTTPS endpoint and device token. "
                + "Messages will use SIM 1. Keep this phone powered and connected.");
        instructions.setTextSize(18);
        layout.addView(instructions, margins());

        url = new EditText(this);
        url.setHint("https://approved-tmv-endpoint");
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(GatewayConfig.baseUrl(this));
        layout.addView(url, margins());

        token = new EditText(this);
        token.setHint("Gateway token");
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(token, margins());

        Button save = button("Save configuration");
        save.setOnClickListener(view -> save());
        layout.addView(save, margins());

        Button start = button("Start gateway");
        start.setOnClickListener(view -> startGateway());
        layout.addView(start, margins());

        Button stop = button("Stop gateway");
        stop.setOnClickListener(view -> {
            Intent intent = new Intent(this, GatewayService.class);
            intent.setAction(GatewayService.ACTION_STOP);
            startService(intent);
        });
        layout.addView(stop, margins());

        setContentView(layout);
        requestPermissions();
    }

    private void save() {
        try {
            GatewayConfig.save(this, url.getText().toString(), token.getText().toString());
            token.setText("");
            Toast.makeText(this, "Configuration saved securely", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void startGateway() {
        requestPermissions();
        Intent intent = new Intent(this, GatewayService.class);
        intent.setAction(GatewayService.ACTION_START);
        startForegroundService(intent);
    }

    private void requestPermissions() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{
                    Manifest.permission.SEND_SMS,
                    Manifest.permission.READ_PHONE_STATE,
                    Manifest.permission.POST_NOTIFICATIONS
            }, 10);
        } else if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{
                    Manifest.permission.SEND_SMS,
                    Manifest.permission.READ_PHONE_STATE
            }, 10);
        }
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(18);
        button.setMinHeight(Math.round(56 * getResources().getDisplayMetrics().density));
        return button;
    }

    private LinearLayout.LayoutParams margins() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        int margin = Math.round(10 * getResources().getDisplayMetrics().density);
        params.setMargins(0, margin, 0, margin);
        return params;
    }
}
