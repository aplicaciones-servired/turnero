//
function voz(text, volumen) {
    //
    if (!text) return;
    var vol = (typeof volumen === 'number') ? volumen : 1;
    if (vol > 1) vol = 1;
    if (vol < 0.1) vol = 0.1;
    //
    var tl = (typeof CFG !== 'undefined' && CFG.ttsLang) ? CFG.ttsLang : 'es';
    var base = (typeof apiBase !== 'undefined') ? apiBase : ((typeof CFG !== 'undefined' && CFG.apiUrl) ? CFG.apiUrl : 'http://localhost:3001/api');
    base = base.replace(/\/+$/, '');
    var root = base.replace(/\/api\/?$/, '');
    var urlTts = root + '/api/tts?tl=' + encodeURIComponent(tl) + '&text=' + encodeURIComponent(text);
    //
    // 1) MP3 desde el servidor (mas fiable en Android WebView)
    if (window.AndroidTTS && typeof window.AndroidTTS.playAudio === 'function') {
        try {
            window.AndroidTTS.playAudio(urlTts, vol);
            return;
        } catch (e) {
        }
    }
    //
    try {
        var a = new Audio();
        a.volume = vol;
        a.src = urlTts;
        var p = a.play();
        if (p && typeof p.catch === 'function') {
            p.catch(function () {
                // fallback a TTS nativo si el Audio falla
                if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
                    try {
                        if (typeof window.AndroidTTS.disponible !== 'function' || window.AndroidTTS.disponible()) {
                            window.AndroidTTS.speak('v' + Date.now() + '-' + Math.random(), text, 0.9, 1);
                        }
                    } catch (e2) {
                    }
                }
            });
        }
        return;
    } catch (e) {
    }
    //
    // 2) TTS nativo
    if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
        try {
            if (typeof window.AndroidTTS.disponible !== 'function' || window.AndroidTTS.disponible()) {
                window.AndroidTTS.speak('v' + Date.now() + '-' + Math.random(), text, 0.9, 1);
                return;
            }
        } catch (e3) {
        }
    }
    //
    // 3) Web Speech API
    try {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
            return;
        }
        var u2 = new SpeechSynthesisUtterance();
        u2.text = text;
        u2.lang = 'es-ES';
        u2.volume = vol;
        speechSynthesis.cancel();
        speechSynthesis.speak(u2);
    } catch (e) {
        console.warn("voz no disponible", e);
    }
}
