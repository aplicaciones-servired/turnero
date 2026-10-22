package com.turnero.display;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

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

    private TextToSpeech tts;
    private boolean ttsListo = false;

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

        // Puente: la pagina usa el TTS nativo de Android en vez del Web Speech
        // API, que Android TV no trae. Esto ademas no requiere un toque previo.
        webView.addJavascriptInterface(new PuenteAndroid(), "AndroidTTS");

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

        iniciarTts();
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
            if (hayRed()) {
                handler.postDelayed(arrancar, ARRANQUE_MS);
            } else {
                handler.postDelayed(arrancar, REINTENTO_MS);
            }
            handler.postDelayed(vigilante, VIGILANCIA_MS);
        }
    }

    // ------------------------------------------------------------------ TTS

    private void iniciarTts() {
        tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int estado) {
                if (estado == TextToSpeech.SUCCESS) {
                    Locale locale = new Locale("es", "CO");
                    int resultado = tts.setLanguage(locale);
                    if (resultado == TextToSpeech.LANG_MISSING_DATA
                            || resultado == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(Locale.getDefault());
                    }
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) { }

                        @Override public void onDone(String id) { avisar(id); }

                        @Override public void onError(String id) { avisar(id); }

                        @Override public void onError(String id, int codigo) { avisar(id); }
                    });
                    ttsListo = true;
                } else {
                    // Sin motor de voz instalado: la pagina sigue funcionando,
                    // pero no habla.
                    ttsListo = false;
                }
            }
        });
    }

    /** Devuelve el control a la pagina cuando termino de hablar. */
    private void avisar(final String id) {
        final WebView wv = webView;
        if (wv == null || id == null) return;
        final String js = "window.__turneroTtsDone && window.__turneroTtsDone('" + id + "');";
        handler.post(new Runnable() {
            @Override public void run() {
                try { wv.evaluateJavascript(js, null); } catch (Exception ignored) { }
            }
        });
    }

    /** Puente expuesto a JavaScript como window.AndroidTTS. */
    public class PuenteAndroid {

        /** true si hay motor de voz instalado y listo. */
        @JavascriptInterface
        public boolean disponible() {
            return ttsListo;
        }

        /** id = correlacion con la promesa de JS. rate/pitch en escala 0..2. */
        @JavascriptInterface
        public void speak(final String id, final String texto, final double rate, final double pitch) {
            final String t = texto == null ? "" : texto;
            handler.post(new Runnable() {
                @Override public void run() {
                    if (tts == null || !ttsListo || t.isEmpty()) {
                        avisar(id);
                        return;
                    }
                    tts.setSpeechRate((float) Math.max(0.1, Math.min(2.0, rate)));
                    tts.setPitch((float) Math.max(0.1, Math.min(2.0, pitch)));
                    tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, id);
                }
            });
        }

        /** Reproduce un MP3 desde una URL (mas fiable que Audio() en Android WebView). */
        @JavascriptInterface
        public void playAudio(final String url, final double volume) {
            final String u = url == null ? "" : url;
            handler.post(new Runnable() {
                @Override
                public void run() {
                    if (u.isEmpty()) {
                        return;
                    }
                    try {
                        final android.media.MediaPlayer mp = new android.media.MediaPlayer();
                        mp.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
                        try {
                            float v = (float) Math.max(0.1, Math.min(1.0, volume));
                            mp.setVolume(v, v);
                        } catch (Exception ignored) {
                        }
                        mp.setDataSource(u);
                        mp.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener() {
                            @Override
                            public void onPrepared(android.media.MediaPlayer mediaPlayer) {
                                mediaPlayer.start();
                            }
                        });
                        mp.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {
                            @Override
                            public void onCompletion(android.media.MediaPlayer mediaPlayer) {
                                try {
                                    mediaPlayer.release();
                                } catch (Exception ignored) {
                                }
                            }
                        });
                        mp.setOnErrorListener(new android.media.MediaPlayer.OnErrorListener() {
                            @Override
                            public boolean onError(android.media.MediaPlayer mediaPlayer, int what, int extra) {
                                try {
                                    mediaPlayer.release();
                                } catch (Exception ignored) {
                                }
                                return true;
                            }
                        });
                        mp.prepareAsync();
                    } catch (Exception e) {
                        // Si falla, dejamos que el JS intente con Audio().
                    }
                }
            });
        }
            handler.post(new Runnable() {
                @Override public void run() {
                    try {
                        ToneGenerator tono = new ToneGenerator(AudioManager.STREAM_MUSIC, 70);
                        tono.startTone(ToneGenerator.TONE_PROP_BEEP2, 120);
                        handler.postDelayed(new Runnable() {
                            @Override public void run() {
                                try { tono.startTone(ToneGenerator.TONE_PROP_BEEP, 160); }
                                catch (Exception ignored) { }
                            }
                        }, 200);
                        handler.postDelayed(new Runnable() {
                            @Override public void run() {
                                try { tono.release(); } catch (Exception ignored) { }
                            }
                        }, 900);
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }

    // ----------------------------------------------------------------- Web

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
        if (tts != null) {
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
