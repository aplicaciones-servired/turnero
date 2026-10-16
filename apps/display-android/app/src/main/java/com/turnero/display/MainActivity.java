package com.turnero.display;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    /** Reintento corto: sirve para cuando la red aun no estaba lista. */
    private static final long REINTENTO_MS = 4000L;
    /** Vigilancia: si la pagina no quedo cargada, vuelve a intentarlo. */
    private static final long VIGILANCIA_MS = 30000L;
    /** Pausa extra antes de arrancar: le da tiempo al WiFi a asociarse. */
    private static final long ARRANQUE_MS = 1500L;

    private WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String targetUrl;
    private boolean paginaOk = false;
    private boolean cargaFallida = false;

    private final Runnable arrancar = new Runnable() {
        @Override public void run() { cargar(); }
    };

    private final Runnable vigilante = new Runnable() {
        @Override public void run() {
            if (webView != null && targetUrl != null && !paginaOk) {
                cargar();
            }
            handler.postDelayed(this, VIGILANCIA_MS);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        s.setBlockNetworkLoads(false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageFinished(WebView view, String url) {
                // Chromium tambien llama a onPageFinished cuando muestro su
                // pagina de error; por eso se ignora si hubo un error previo.
                if (!cargaFallida) {
                    paginaOk = true;
                }
                cargaFallida = false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode,
                                        String description, String failingUrl) {
                marcarError();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (request == null || request.isForMainFrame()) {
                    marcarError();
                }
            }
        });

        hideSystemUi();

        targetUrl = construirUrl();
        if (targetUrl == null) {
            webView.loadDataWithBaseURL(null,
                    "<html><body style='background:#000;color:#fff;font-family:sans-serif;"
                            + "display:flex;align-items:center;justify-content:center;height:100%;margin:0'>"
                            + "<div style='text-align:center'>Turnero<br><br>URL no configurada</div>"
                            + "</body></html>",
                    "text/html", "utf-8", null);
        } else {
            // Espera un momento a que la red este disponible y arranca.
            if (hayRed()) {
                handler.postDelayed(arrancar, ARRANQUE_MS);
            } else {
                handler.postDelayed(arrancar, REINTENTO_MS);
            }
            handler.postDelayed(vigilante, VIGILANCIA_MS);
        }
    }

    /** Arma la URL final, agregando el id de pantalla si no viene en la URL. */
    private String construirUrl() {
        String url = getString(R.string.display_url);
        if (url == null || url.trim().isEmpty() || url.contains("__DISPLAY_URL__")) {
            return null;
        }
        url = url.trim();
        String screenId = getString(R.string.screen_id);
        if (screenId != null && !screenId.trim().isEmpty() && !url.contains("screen=")) {
            url = url + (url.contains("?") ? "&" : "?") + "screen=" + screenId.trim();
        }
        return url;
    }

    /** Intenta cargar; si no hay red, reintenta en REINTENTO_MS. */
    private void cargar() {
        if (webView == null || targetUrl == null) {
            return;
        }
        if (!hayRed()) {
            handler.postDelayed(arrancar, REINTENTO_MS);
            return;
        }
        paginaOk = false;
        cargaFallida = false;
        webView.loadUrl(targetUrl);
    }

    private void marcarError() {
        paginaOk = false;
        cargaFallida = true;
        handler.removeCallbacks(arrancar);
        handler.postDelayed(arrancar, REINTENTO_MS);
    }

    private boolean hayRed() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                return true;
            }
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
