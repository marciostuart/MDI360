package br.com.mdi360.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/** Abre o player automaticamente quando o aparelho liga. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        // Give the launcher/network stack a moment to finish booting on TV Boxes.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                context.startActivity(open);
            } catch (RuntimeException ignored) {
                // The system may temporarily reject the launch; the next boot
                // broadcast or the launcher can still open the app normally.
            }
        }, 2500L);
    }
}
