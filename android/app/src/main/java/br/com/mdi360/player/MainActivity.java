package br.com.mdi360.player;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import android.net.Uri;
import android.util.Base64;
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

import java.io.ByteArrayOutputStream;
import java.io.File;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Player MDI 360: WebView em tela cheia que abre a rota /tela do servidor.
 * O codigo de ativacao e toda a reproducao vem da propria pagina web.
 */
public class MainActivity extends AppCompatActivity {

    private static final String PREFS = "mdi360";
    private static final String KEY_URL = "server_url";

    private WebView webView;
    private FrameLayout root;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }

        root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        requestOverlayPermissionIfNeeded();

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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() {
                // Android WebView otherwise draws its large default play icon
                // before the first frame. The page supplies the real video.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                enforceVideoKioskMode(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Sem internet ou servidor fora: tenta novamente em 15 segundos.
                if (request != null && request.isForMainFrame()) {
                    handler.postDelayed(() -> view.loadUrl(playerUrl()), 15000);
                }
            }
        });

        // Controles remotos (captura de tela, limpeza de cache, reboot,
        // resolucao) usados pelo painel do cliente.
        webView.addJavascriptInterface(new NativeBridge(this), "MDI360Native");

        hideSystemUi();
        webView.loadUrl(playerUrl());
    }

    /** Removes media controls without changing the configured audio mode. */
    private void enforceVideoKioskMode(WebView view) {
        String script = "(function(){document.querySelectorAll('video').forEach(function(v){"
                + "v.controls=false;v.removeAttribute('controls');"
                + "v.setAttribute('playsinline','');v.setAttribute('autoplay','');"
                + "});})();";
        view.evaluateJavascript(script, null);
    }

    /**
     * Android 10 blocks background activity launches after boot unless the
     * operator grants this special permission. It is requested once during
     * setup; normal playback does not use an overlay window.
     */
    private void requestOverlayPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Inicialização automática")
                .setMessage("Para iniciar o MDI 360 automaticamente quando a TV Box ligar, permita a sobreposição nas configurações do Android.")
                .setPositiveButton("Abrir configuração", (dialog, which) -> {
                    try {
                        Intent settings = new Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + getPackageName()));
                        startActivity(settings);
                    } catch (RuntimeException ignored) {
                        startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
                    }
                })
                .setNegativeButton("Agora não", null)
                .setCancelable(false)
                .show();
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

    /* ---------------------------------------------------------------- */
    /* Controles remotos                                                 */
    /* ---------------------------------------------------------------- */

    /**
     * Limpeza forcada de cache. Apaga os arquivos baixados e o cache do WebView,
     * mas NUNCA o armazenamento local: o vinculo da tela e mantido.
     */
    void clearAllCaches() {
        webView.clearCache(true);
        webView.clearHistory();
        deleteRecursively(getCacheDir());
        deleteRecursively(new File(getFilesDir(), "webview"));
        webView.loadUrl(playerUrl());
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        if (!file.equals(getCacheDir())) {
            // Ignora falhas: arquivos em uso serao apagados na proxima limpeza.
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    /**
     * Reinicializacao. Aparelhos com root ou permissao de sistema reiniciam de
     * verdade; nos demais o aplicativo se reinicia, que resolve travamentos.
     */
    void rebootDevice() {
        try {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power != null) {
                power.reboot(null);
                return;
            }
        } catch (Throwable ignored) {
            // Sem permissao de sistema: tenta root, depois reinicia o app.
        }
        try {
            Runtime.getRuntime().exec(new String[] { "su", "-c", "reboot" });
            return;
        } catch (Throwable ignored) {
            // Aparelho sem root.
        }
        restartApp();
    }

    private void restartApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
        Process.killProcess(Process.myPid());
    }

    /**
     * Captura de tela do aparelho para monitoramento. A imagem e reduzida e
     * entregue a pagina, que a envia ao servidor.
     */
    void captureScreenshot() {
        try {
            int width = webView.getWidth();
            int height = webView.getHeight();
            if (width <= 0 || height <= 0) return;

            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
            Canvas canvas = new Canvas(bitmap);
            webView.draw(canvas);

            // Nunca envia mais que 1280px de largura: economiza dados da TV.
            if (width > 1280) {
                int scaledHeight = Math.max(1, (int) (height * (1280f / width)));
                Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 1280, scaledHeight, true);
                bitmap.recycle();
                bitmap = scaled;
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, out);
            bitmap.recycle();
            String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            webView.evaluateJavascript(
                    "window.__mdi360Screenshot && window.__mdi360Screenshot('" + base64
                            + "','image/jpeg')",
                    null);
        } catch (Throwable ignored) {
            // Falha de captura nunca pode derrubar a reproducao.
        }
    }

    /**
     * Resolucao de renderizacao. O WebView passa a desenhar a pagina no tamanho
     * pedido e o resultado e esticado para preencher o painel fisico, o que
     * permite telas com formatos fora do convencional. Zero volta ao padrao.
     */
    void applyResolution(int width, int height) {
        FrameLayout.LayoutParams params;
        if (width <= 0 || height <= 0) {
            params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
            webView.setScaleX(1f);
            webView.setScaleY(1f);
        } else {
            int screenWidth = root.getWidth() > 0 ? root.getWidth() : getResources()
                    .getDisplayMetrics().widthPixels;
            int screenHeight = root.getHeight() > 0 ? root.getHeight() : getResources()
                    .getDisplayMetrics().heightPixels;
            params = new FrameLayout.LayoutParams(width, height);
            webView.setPivotX(0f);
            webView.setPivotY(0f);
            webView.setScaleX((float) screenWidth / width);
            webView.setScaleY((float) screenHeight / height);
        }
        webView.setLayoutParams(params);
        webView.requestLayout();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
