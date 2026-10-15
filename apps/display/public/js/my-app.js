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
    if (localStorage.visualizador === undefined) {
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
    var htmlTurno = '<div style="background: rgb(147, 226, 250);width: 80%;height: 80%;display: flex;flex-direction: column;justify-content: center;align-items: center; border: 1px solid black">';
    htmlTurno += '<h1 style="font-size: 400%; color:red">' + tipo + ', ' + nombre + '</h1>';
    htmlTurno += '<h2 style="font-size: 400%; color:red">' + (modulo || "") + '</h2></div>';
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
                for (var i = 0; i < 5; i++) {
                    //
                    document.getElementById("modulo" + i).style.fontSize = data[0]['tamanoLetra'] + 'px';
                    document.getElementById("cliente" + i).style.fontSize = data[0]['tamanoLetra'] + 'px';
                }
                //
                var valorT = data[0]['tamanoLetra'] / 2;
                document.getElementById("divFecha").style.fontSize = valorT + 'px';
                document.getElementById("mesaje").style.fontSize = data[0]['tamanoLetra'] + 'px';
                //
                if (data[0]['nombrelogo'] !== '') {
                    //
                    document.getElementById("logoCambiar").setAttribute('src', urlImagen + data[0]['nombrelogo']);
                }
                //
                $$('#mesaje').html('<MARQUEE WIDTH=100%>' + data[0]['mensaje'] + '</MARQUEE>');
                //
                arrayC = data[0];
            }
        });
}

//
function voz(text, volumen) {
    //
    var u = new SpeechSynthesisUtterance();
    //
    u.text = text;
    u.lang = 'es-ES';
    u.volume = volumen;
    speechSynthesis.speak(u);
}

//
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
