package br.com.mdi360.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Abre o player automaticamente quando o aparelho liga. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(open);
    }
}