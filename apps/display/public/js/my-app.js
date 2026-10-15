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
var sigTurno = false;
//
function iniciar() {
    //
    voz('', 0);
    // respaldos si faltan los assets reales (logo/video)
    document.getElementById("logoCambiar").onerror = function () {
        //
        if (this.getAttribute("src") !== "/img/default.png") {
            //
            this.setAttribute("src", "/img/default.png");
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
    setInterval(consultarFecha, 30010);
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
    sigTurno = false;
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
                consultarTurnos();
                cargarConfig();
                cargarVideos();
            }
        });
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
function actualizarTurnos() {
    //
    if (arrayT.length > 0) {
        //
        for (var i = 0; i < arrayT.length; i++) {
            //
            $$('#modulo' + i).html(arrayT[i]['modulo']);
            $$('#cliente' + i).html(arrayT[i]['nombre']);
        }
        //
        var llamado = '';
        //
        if (arrayT[0]['tipo'] === 'TURNO') {
            //
            var arreglo = arrayT[0]['nombre'].split("");
            //
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
                            perTurno = false
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
        } else {
            //
            llamado = arrayT[0]['nombre'];
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
                document.getElementById("conttL").style.background = "linear-gradient(to bottom, rgba(43,123,160,1) 0%, rgba(16,63,84,1) 100%)";
                document.getElementById("divcontt").style.border = "2px #256e90 solid";
                //
                controlColorDiv = false;
            } else {
                //
                document.getElementById("conttL").style.background = "linear-gradient(to bottom, rgba(156,34,46,1) 0%, rgba(156,34,46,1) 12%, rgba(221,75,86,1) 100%)";
                document.getElementById("divcontt").style.border = "2px #c93e4a solid";
                //
                controlColorDiv = true;
            }
            //
            if (controlColorDivT >= 10) {
                //
                document.getElementById("conttL").style.background = "linear-gradient(to bottom, rgba(43,123,160,1) 0%, rgba(16,63,84,1) 100%)";
                document.getElementById("divcontt").style.border = "2px #256e90 solid";
                //
                clearInterval(intervaloC);
                //
                controlColorDivT = 0;
            }
        }, 1000);
        //
        let htmlTurno = '<div style="background: rgb(147, 226, 250);width: 80%;height: 80%;display: flex;flex-direction: column;justify-content: center;align-items: center; border: 1px solid black">';
        htmlTurno += '<h1 style="font-size: 400%; color:red">' + arrayT[0]['tipo'] + ', ' + arrayT[0]['nombre'] + '</h1>';
        htmlTurno += '<h2 style="font-size: 400%; color:red">' + arrayT[0]['modulo'] + '</h2></div>';

        //
        var VolumenVoz = 0;
        //
        VolumenVoz = (parseInt(arrayC.volumenVoz));

        VolumenVoz = (VolumenVoz === 0) ? 0.1 : VolumenVoz = (VolumenVoz > 9) ? 1 : parseFloat("0." + VolumenVoz);

        //
        var video = document.getElementById("video");
        video.muted = true;
        //
        var llamaarTurno = '';
        var separados = llamado.split(" ");
        llamaarTurno += separados[0] + ' ';
        var controlTurno = 0;

        if (separados[1] === '0') {
            controlTurno = 1;
        } else {
            llamaarTurno += separados[1];
        }

        if (controlTurno === 1) {
            if (separados[2] === '0') {
                llamaarTurno += separados[3];
            } else {
                llamaarTurno += separados[2];
            }
        }

        var mensaje = "atencion " + arrayT[0]['tipo'] + " " + llamaarTurno + " diríjase a. " + arrayT[0]['modulo'];
        clearInterval(intervalo);
        voz(mensaje, VolumenVoz);
        $$('#visualizarTurno').html(htmlTurno);
        //
        var intervalo = setInterval(function () {
            //
            $$('#visualizarTurno').html('');
            consultarTurnos();
            //
            clearInterval(intervalo);
        }, 8000);
    }

    actualizarFecha();
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

var intervalo = null;

//
function consultarTurnos() {
    //
    app.request.post(urlServer + '?accion=cargarTurno&visualizador=' + visualizador,
        function (rsp) {
            //
            var data = JSON.parse(rsp);
            //
            if (data !== 2) {
                //
                if (data[0]['modulo'] === '#12#.3421D') {
                    //
                    cargarVideos();
                    //
                    cargarConfig();
                    //
                    siguienteTruno();
                } else {
                    //
                    if (arrayT.length > 0) {
                        //
                        var j = -1;
                        //
                        for (var i = 0; i < arrayT.length; i++) {
                            //
                            if (arrayT[i]['nombre'] === data[0]['nombre'] && arrayT[i]['modulo'] === data[0]['modulo']) {
                                //
                                j = i;
                            }
                        }
                        //
                        if (j !== -1) {
                            //
                            while (j >= 0) {
                                //
                                if (j === 0) {
                                    //
                                    arrayT[j] = data[0];
                                } else {
                                    //
                                    arrayT[j] = arrayT[j - 1];
                                }
                                //
                                j--;
                            }
                        } else {
                            //
                            var k = arrayT.length;
                            //
                            if (k > 4) {
                                //
                                k = 4;
                            }
                            //
                            while (k > 0) {
                                //
                                arrayT[k] = arrayT[k - 1];
                                //
                                k--;
                                //
                                if (k === 0) {
                                    //
                                    arrayT[k] = data[0];
                                }
                            }
                        }
                    } else {
                        //
                        arrayT[0] = data[0];
                    }
                    //
                    actualizarTurnos();
                }
            } else {
                //
                siguienteTruno();
            }
        },
        function (error) {
            //
            siguienteTruno();
        });
}

//
function siguienteTruno() {
    //
    var intervaloT2 = setInterval(function () {
        //
        consultarTurnos();
        //
        clearInterval(intervaloT2);
    }, 5000);
}

//
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
