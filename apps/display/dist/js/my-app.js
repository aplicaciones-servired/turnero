//
var CFG = window.__TURNERO__ || {};
var apiBase = (CFG.apiUrl || "http://localhost:3001/api").replace(/\/+$/, "");
var mediaBase = (CFG.mediaUrl || "http://localhost:3001/media").replace(/\/+$/, "");
var defaultScreen = parseInt(CFG.screen || "1", 10) || 1;
//
var app = new Framework7({
    root: '#app',
    name: 'Visualizador',
    id: 'visualizador.com',
    panel: {
        swipe: 'left'
    },
    routes: [{
        path: '/home/',
        url: 'index.html'
    }]
});

//
var urlServer = apiBase + '/visualizador/consultas.php';
var urlVideos = mediaBase + '/videos/';
var urlImagen = mediaBase + '/imagenes/';
//
var $$ = Dom7;
//
var mainView = app.views.create('.view-main');
//
var arrayT = [];
var arrayC = [];
var arrayV = [];
var visualizador = 0;
var videoA = 0;
var videoFallas = 0;
var videoFallback = false;
var socket = null;
var ocultarTurnoTimer = null;
var intervaloFecha = null;
//
function iniciar() {
    //
    voz('', 0);
    // respaldos si faltan los assets reales (logo/video)
    document.getElementById("logoCambiar").onerror = function () {
        //
        if (this.getAttribute("src") !== "img/default.png") {
            //
            this.setAttribute("src", "img/default.png");
        }
    };
    document.getElementById("video").onerror = function () {
        //
        if (!videoFallback) {
            //
            actualizarVideos();
        }
    };
    document.getElementById("video").onplaying = function () {
        //
        videoFallas = 0;
    };
    document.getElementById("video").onended = function () {
        cargarVideos(true);
    };
    //
    // Pantalla forzada por URL (?screen=4) tiene prioridad; si no, la guardada.
    var urlScreen = parseInt((location.search.match(/[?&]screen=(\d+)/) || [])[1], 10);
    if (urlScreen > 0) {
        visualizador = urlScreen;
        localStorage.visualizador = visualizador;
    } else if (localStorage.visualizador === undefined) {
        //
        visualizador = defaultScreen;
        localStorage.visualizador = visualizador;
    } else {
        //
        visualizador = parseInt(localStorage.visualizador, 10) || defaultScreen;
    }
    //
    traerIpVisualizador();
    cargarListaVisualizadores(2);
    //
    actualizarFecha();
}

function actualizarFecha() {
    consultarFecha();
    if (intervaloFecha) {
        clearInterval(intervaloFecha);
    }
    intervaloFecha = setInterval(consultarFecha, 30010);
}
//
function consultarFecha() {
    app.request.post(urlServer + '?accion=fechaHora',
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            $$('#fecha').html(data.fecha);
            $$('#hora').html(data.hora);
        });
}
//
function editarIpServidor() {
    //
    app.dialog.prompt('', 'Numero de visualizador', function (v) {
        //
        var n = parseInt(v, 10);
        //
        if (n > 0) {
            visualizadorSeleccionado(n);
        }
    }, function () {
    }, '' + visualizador);
}

//
function cargarListaVisualizadores(valor) {
    //
    app.request.post(urlServer + '?accion=cargarListaVisualizadores',
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            if (data.length > 0) {
                //
                var camposV = '<p>Seleccionar visualizador</p><div class="list"><ul>';
                //
                for (var i = 0; i < data.length; i++) {
                    //
                    camposV += '<li><a class="list-button item-link" href="#" onclick="visualizadorSeleccionado(' + data[i] + ')">Visualizador ' + data[i] + '</a></li>';
                }
                //
                camposV += '</ul></div>';
                //
                document.getElementById("divListaVisualizadores").innerHTML = camposV;
                //
                if (valor === 1) {
                    //
                    document.getElementById("btnListaVisualizadores").click();
                }
            }
        });
}

//
function visualizadorSeleccionado(valor) {
    //
    for (var i = 0; i < 5; i++) {
        //
        $$('#modulo' + i).html('');
        $$('#cliente' + i).html('');
    }
    //
    arrayT = [];
    arrayC = [];
    arrayV = [];
    visualizador = 0;
    videoA = 0;
    //
    visualizador = valor;
    localStorage.visualizador = visualizador;
    //
    traerIpVisualizador();
    //
    app.popup.close('.popover-visualizadores', true);
}

//
function traerIpVisualizador() {
    //
    app.request.post(urlServer + '?accion=traerIpVisualizador&visualizador=' + visualizador,
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            if (data.length !== 2) {
                //
                iniciarSocket();
                cargarConfig();
                cargarVideos();
            }
        });
}

//
// ─────────────────────────────────────────────────────────────
// Tiempo real (Socket.IO): cambios instantaneos, sin polling de turnos
// ─────────────────────────────────────────────────────────────
//
function iniciarSocket() {
    //
    if (socket) {
        return;
    }
    //
    if (typeof io === 'undefined') {
        setTimeout(iniciarSocket, 200);
        return;
    }
    //
    var base = apiBase.replace(/\/api\/?$/, '');
    //
    socket = io(base + '/realtime', {
        transports: ['websocket', 'polling'],
        reconnection: true
    });
    //
    socket.on('connect', function () {
        consultarSnapshot();
    });
    //
    socket.on('queue:updated', function (data) {
        setSnapshot(data);
    });
    //
    socket.on('turn:called', function (payload) {
        //
        if (!payload || !payload.turn) {
            return;
        }
        //
        agregarLlamado(payload.turn, payload.counterName);
        anunciarLlamado(payload.turn, payload.counterName);
    });
    //
    socket.on('turn:finished', function (turn) {
        quitarLlamado(turn);
    });
    //
    socket.on('turn:skipped', function (turn) {
        quitarLlamado(turn);
    });
    //
    socket.on('videos:updated', function () {
        // Si la pantalla quedo en el video de respaldo porque fallaron todos,
        // un video nuevo debe devolverla a la lista real.
        if (videoFallback) {
            videoA = 0;
            videoFallas = 0;
            videoFallback = false;
        }
        cargarVideos(false);
    });
}

//
function consultarSnapshot() {
    //
    app.request.get(apiBase + '/turns/snapshot',
        function (rsp) {
            //
            try {
                setSnapshot(JSON.parse(rsp));
            } catch (e) {
                console.warn("snapshot invalido", e);
            }
        },
        function () {
        });
}

//
function setSnapshot(data) {
    //
    var now = (data && data.nowServing) ? data.nowServing : [];
    //
    arrayT = now.map(function (t) {
        return {
            id: String(t.id),
            modulo: t.counterName || "",
            nombre: t.code || "",
            tipo: "TURNO"
        };
    });
    //
    renderLista();
}

//
function agregarLlamado(turn, modulo) {
    //
    var id = String(turn.id);
    var item = {
        id: id,
        modulo: modulo || "",
        nombre: turn.code || "",
        tipo: "TURNO"
    };
    //
    var j = -1;
    for (var i = 0; i < arrayT.length; i++) {
        if (String(arrayT[i].id) === id || (arrayT[i].nombre && arrayT[i].nombre === item.nombre)) {
            j = i;
            break;
        }
    }
    //
    if (j === -1) {
        arrayT.unshift(item);
    } else {
        arrayT.splice(j, 1);
        arrayT.unshift(item);
    }
    //
    if (arrayT.length > 5) {
        arrayT = arrayT.slice(0, 5);
    }
    //
    renderLista();
}

//
function quitarLlamado(turn) {
    //
    if (!turn) {
        return;
    }
    //
    var id = String(turn.id);
    var code = turn.code || "";
    //
    for (var i = 0; i < arrayT.length; i++) {
        //
        if (String(arrayT[i].id) === id || (code && arrayT[i].nombre === code)) {
            //
            arrayT.splice(i, 1);
            renderLista();
            return;
        }
    }
}

//
function renderLista() {
    //
    for (var i = 0; i < 5; i++) {
        //
        if (i < arrayT.length) {
            //
            $$('#modulo' + i).html(arrayT[i]['modulo']);
            $$('#cliente' + i).html(arrayT[i]['nombre']);
        } else {
            //
            $$('#modulo' + i).html('');
            $$('#cliente' + i).html('');
        }
    }
}

//
function anunciarLlamado(turn, modulo) {
    //
    var nombre = (turn && turn.code) ? turn.code : "";
    var tipo = "TURNO";
    //
    var llamado = formatearLlamado(nombre, tipo);
    //
    var htmlTurno = '<div class="turno-grande" style="background: rgb(147, 226, 250);width: 80%;height: 80%;display: flex;flex-direction: column;justify-content: center;align-items: center; text-align: center; border: 1px solid black; overflow: hidden;">';
    htmlTurno += '<h1 style="font-size: clamp(5vw, 18vw, 18vh); color:red; margin: 0; line-height: 1.1; white-space: normal; word-break: break-word;">' + tipo + ', ' + nombre + '</h1>';
    htmlTurno += '<h2 style="font-size: clamp(4vw, 14vw, 14vh); color:red; margin: 2vh 0 0 0; line-height: 1.1; white-space: normal; word-break: break-word;">' + (modulo || "") + '</h2></div>';
    //
    var volumenVoz = 0;
    //
    if (arrayC && arrayC.volumenVoz != null) {
        volumenVoz = parseInt(arrayC.volumenVoz);
    }
    //
    if (isNaN(volumenVoz)) {
        volumenVoz = 1;
    }
    //
    volumenVoz = (volumenVoz === 0) ? 0.1 : (volumenVoz > 9) ? 1 : parseFloat("0." + volumenVoz);
    //
    var separados = llamado.split(" ");
    var llamaarTurno = separados[0] + ' ';
    var controlTurno = 0;
    //
    if (separados[1] === '0') {
        controlTurno = 1;
    } else {
        llamaarTurno += separados[1];
    }
    //
    if (controlTurno === 1) {
        if (separados[2] === '0') {
            llamaarTurno += separados[3];
        } else {
            llamaarTurno += separados[2];
        }
    }
    //
    var mensaje = "atencion " + tipo + " " + llamaarTurno + " diríjase a. " + (modulo || "");
    //
    voz(mensaje, volumenVoz);
    $$('#visualizarTurno').html(htmlTurno);
    //
    animarConteo();
    //
    if (ocultarTurnoTimer) {
        clearTimeout(ocultarTurnoTimer);
    }
    ocultarTurnoTimer = setTimeout(function () {
        $$('#visualizarTurno').html('');
    }, 8000);
}

//
function formatearLlamado(nombre, tipo) {
    //
    if (tipo !== 'TURNO') {
        return nombre;
    }
    //
    var arreglo = nombre.split("");
    var llamado = '';
    var per = false;
    var perTurno = true;
    //
    arreglo.forEach(function (item) {
        //
        if (per) {
            //
            if (perTurno) {
                if (item === "0") {
                    llamado += item;
                    llamado += " ";
                } else {
                    llamado += item;
                    perTurno = false;
                }
            } else {
                llamado += item;
            }

        } else {
            if (item === "-") {
                //
                llamado += " ";
                per = true;
            } else {
                //
                llamado += item;
                llamado += ",";
            }
        }
    });
    //
    return llamado;
}

//
function animarConteo() {
    //
    var divCon = document.getElementById("conttL");
    var divBorde = document.getElementById("divcontt");
    //
    if (!divCon || !divBorde) {
        return;
    }
    //
    var controlColorDiv = false;
    var controlColorDivT = 0;
    //
    var intervaloC = setInterval(function () {
        //
        controlColorDivT++;
        //
        if (controlColorDiv) {
            //
            divCon.style.background = "linear-gradient(to bottom, rgba(43,123,160,1) 0%, rgba(16,63,84,1) 100%)";
            divBorde.style.border = "2px #256e90 solid";
            //
            controlColorDiv = false;
        } else {
            //
            divCon.style.background = "linear-gradient(to bottom, rgba(156,34,46,1) 0%, rgba(156,34,46,1) 12%, rgba(221,75,86,1) 100%)";
            divBorde.style.border = "2px #c93e4a solid";
            //
            controlColorDiv = true;
        }
        //
        if (controlColorDivT >= 10) {
            //
            divCon.style.background = "linear-gradient(to bottom, rgba(43,123,160,1) 0%, rgba(16,63,84,1) 100%)";
            divBorde.style.border = "2px #256e90 solid";
            //
            clearInterval(intervaloC);
            //
            controlColorDivT = 0;
        }
    }, 1000);
}

//
function cargarVideos(reproducirSiguiente) {
    //
    app.request.post(urlServer + '?accion=cargarVideos&visualizador=' + visualizador,
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            arrayV = data;
            //
            if (videoA === 0 || reproducirSiguiente || arrayV.length === 0) {
                //
                actualizarVideos();
            }
        });
}

//
function actualizarVideos() {
    //
    var videoR = document.getElementById("video");
    videoR.muted = true;
    //
    // Sin videos no se intenta el respaldo: evita un bucle de peticiones 404
    // cuando el admin elimina todos los videos.
    if (arrayV.length === 0) {
        videoA = 0;
        videoFallas = 0;
        videoFallback = false;
        videoR.pause();
        videoR.removeAttribute("src");
        videoR.load();
        return;
    }
    //
    if (videoA >= arrayV.length) {
        //
        videoA = 0;
    }

    //
    if (arrayV.length > 0 && videoFallas <= arrayV.length) {
        //
        var vol = (arrayV[videoA]['volumen'] > 9) ? 1 : parseFloat("0." + arrayV[videoA]['volumen']);
        //
        videoR.volume = isNaN(vol) ? 1 : vol;
        //
        videoR.src = urlVideos + arrayV[videoA]['nombreVideo'] + '.mp4';
        //
        videoA++;
        videoFallas++;
    } else {
        //
        if (arrayV.length > 0) {
            //
            videoFallback = true;
        }
        //
        videoR.volume = 1;
        //
        videoR.src = urlVideos + 'video.mp4';
    }
    //
    videoR.load();
    //
    var pr = videoR.play();
    if (pr && pr.catch) {
        pr.catch(function (error) {
            console.warn("No se pudo iniciar el video:", error);
        });
    }
}

//
function cargarConfig() {
    //
    app.request.post(urlServer + '?accion=cargarConfig&visualizador=' + visualizador,
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            if (data.length > 0) {
                //
                // Tamano de letra configurado en el admin. En el navegador se
                // agranda un 15%; en la APK se deja tal cual (el WebView de la
                // TV ya lo muestra mas grande y se salia de la columna).
                var letra = parseInt(data[0]['tamanoLetra'], 10);
                if (letra > 0) {
                    var enApk = !!(window.AndroidTTS && typeof window.AndroidTTS.speak === 'function');
                    letra = Math.round(letra * (enApk ? 1.0 : 1.15));
                    // Nunca mas de ~5.4% del alto de la pantalla.
                    var tope = Math.round(window.innerHeight * 0.054);
                    if (tope > 0 && letra > tope) {
                        letra = tope;
                    }
                    for (var i = 0; i < 5; i++) {
                        document.getElementById("modulo" + i).style.fontSize = letra + 'px';
                        document.getElementById("cliente" + i).style.fontSize = letra + 'px';
                    }
                    document.getElementById("divFecha").style.fontSize = Math.round(letra / 2) + 'px';
                    document.getElementById("mesaje").style.fontSize = letra + 'px';
                }
                //
                if (data[0]['nombrelogo'] !== '') {
                    //
                    document.getElementById("logoCambiar").setAttribute('src', urlImagen + data[0]['nombrelogo']);
                }
                //
                var texto = data[0]['mensaje'];
                if (texto && String(texto).trim() !== '') {
                    $$('#mesaje').html('<MARQUEE WIDTH=100%>' + texto + '</MARQUEE>');
                }
                //
                arrayC = data[0];
            }
        });
}

//
function voz(text, volumen) {
    //
    if (!text) return;
    var vol = (typeof volumen === 'number') ? volumen : 1;
    if (vol > 1) vol = 1;
    if (vol < 0.1) vol = 0.1;
    //
    // MP3 generado por el servidor (voz natural, sin depender del motor TTS
    // del dispositivo, que en muchos tvbox viene mudo o sin voces en espanol).
    var tl = (typeof CFG !== 'undefined' && CFG.ttsLang) ? CFG.ttsLang : 'es';
    var base = (typeof apiBase !== 'undefined') ? apiBase : ((typeof CFG !== 'undefined' && CFG.apiUrl) ? CFG.apiUrl : 'http://localhost:3001/api');
    base = base.replace(/\/+$/, '');
    //
    // URL ABSOLUTA: el MediaPlayer de la APK no entiende rutas relativas.
    var root = base.replace(/\/api\/?$/, '');
    if (!root) {
        root = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    } else if (!/^https?:\/\//i.test(root)) {
        root = ((typeof location !== 'undefined' && location.origin) ? location.origin : '') + root;
    }
    var urlTts = root + '/api/tts?tl=' + encodeURIComponent(tl) + '&text=' + encodeURIComponent(text);
    //
    function conTtsNativo() {
        if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
            try {
                if (typeof window.AndroidTTS.disponible !== 'function' || window.AndroidTTS.disponible()) {
                    window.AndroidTTS.speak('v' + Date.now() + '-' + Math.random(), text, 0.9, 1);
                    return;
                }
            } catch (e) {
            }
        }
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
    //
    function conPlayNativo() {
        if (window.AndroidTTS && typeof window.AndroidTTS.playAudio === 'function') {
            window.__turneroAudioError = conTtsNativo;
            try {
                window.AndroidTTS.playAudio(urlTts, vol);
                return;
            } catch (e) {
            }
        }
        conTtsNativo();
    }
    //
    // El WebView usa su propia pila de red/TLS (la misma que carga la pagina),
    // que en tvbox viejos si funciona; el MediaPlayer nativo a veces no logra
    // el HTTPS. Por eso se intenta primero por Audio() y luego el nativo.
    function conAudioWeb(alFallar) {
        var a;
        var terminado = false;
        var timer = null;
        try {
            a = new Audio();
        } catch (e) {
            alFallar();
            return;
        }
        //
        function fallar() {
            if (terminado) return;
            terminado = true;
            if (timer) clearTimeout(timer);
            try { a.pause(); } catch (e) { }
            try { a.src = ''; } catch (e) { }
            alFallar();
        }
        //
        try {
            a.volume = vol;
            a.addEventListener('playing', function () {
                terminado = true;
                if (timer) clearTimeout(timer);
            });
            a.addEventListener('abort', fallar);
            a.addEventListener('error', fallar);
            a.src = urlTts;
            // Si en 2.5s no arranco, se prueba el reproductor nativo.
            timer = setTimeout(function () {
                if (terminado) return;
                try { a.pause(); } catch (e) { }
                try { a.src = ''; } catch (e) { }
                alFallar();
            }, 2500);
            var p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(fallar);
            }
        } catch (e) {
            fallar();
        }
    }
    //
    // 1) MP3 del servidor con el motor del WebView (pc, APK y tvbox).
    conAudioWeb(conPlayNativo);
}

//
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
