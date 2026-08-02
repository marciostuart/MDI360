package br.com.mdi360.player;

import android.webkit.JavascriptInterface;

/**
 * Ponte entre a pagina do player (/tela) e o aparelho Android.
 * Tudo aqui e disparado por comandos remotos enviados no painel do cliente.
 */
public class NativeBridge {

    private final MainActivity activity;

    NativeBridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Permite que a pagina saiba que esta rodando dentro do aplicativo. */
    @JavascriptInterface
    public String version() {
        return BuildConfig.VERSION_NAME;
    }

    /** Limpeza forcada: apaga os arquivos em cache e recarrega o player. */
    @JavascriptInterface
    public void clearCache() {
        activity.runOnUiThread(activity::clearAllCaches);
    }

    /** Reinicia o aparelho (ou, sem permissao, reinicia o aplicativo). */
    @JavascriptInterface
    public void reboot() {
        activity.runOnUiThread(activity::rebootDevice);
    }

    /** Captura a tela e devolve a imagem para a pagina enviar ao servidor. */
    @JavascriptInterface
    public void requestScreenshot() {
        activity.runOnUiThread(activity::captureScreenshot);
    }

    /** Resolucao de renderizacao. Zero volta ao tamanho real do painel. */
    @JavascriptInterface
    public void setResolution(final int width, final int height) {
        activity.runOnUiThread(() -> activity.applyResolution(width, height));
    }
}
