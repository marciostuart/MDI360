package br.com.mdi360.player;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Player MDI 360: WebView em tela cheia que abre a rota /tela do servidor.
 * O codigo de ativacao e toda a reproducao vem da propria pagina web.
 */
public class MainActivity extends AppCompatActivity {

    private static final String PREFS = "mdi360";
    private static final String KEY_URL = "server_url";

    private WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        webView.setBackgroundColor(0xFF000000);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Sem internet ou servidor fora: tenta novamente em 15 segundos.
                if (request != null && request.isForMainFrame()) {
                    handler.postDelayed(() -> view.loadUrl(playerUrl()), 15000);
                }
            }
        });

        hideSystemUi();
        webView.loadUrl(playerUrl());
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String playerUrl() {
        String base = prefs().getString(KEY_URL, BuildConfig.DEFAULT_SERVER_URL);
        if (base == null || base.trim().isEmpty()) base = BuildConfig.DEFAULT_SERVER_URL;
        base = base.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/tela";
    }

    /** Menu escondido: aperte o botao MENU (ou tecla M) do controle para trocar o servidor. */
    private void askServerUrl() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(prefs().getString(KEY_URL, BuildConfig.DEFAULT_SERVER_URL));
        new AlertDialog.Builder(this)
                .setTitle("Endereco do servidor MDI 360")
                .setView(input)
                .setPositiveButton("Salvar", (d, w) -> {
                    prefs().edit().putString(KEY_URL, input.getText().toString()).apply();
                    webView.loadUrl(playerUrl());
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_M) {
            askServerUrl();
            return true;
        }
        // Bloqueia o "voltar" para a tela nunca sair do player.
        if (keyCode == KeyEvent.KEYCODE_BACK) return true;
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}