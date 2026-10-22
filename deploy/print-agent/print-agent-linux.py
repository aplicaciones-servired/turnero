#!/usr/bin/env python3
# =============================================================================
# Turnero - agente de impresion local para Linux / Raspberry Pi (modo kiosco).
#
# Es el equivalente Linux de PrintAgent.ps1 en modo "local": el kiosco (pagina
# servida por https) manda el ticket ESC/POS en base64 a
# http://localhost:9110/print y este agente lo entrega a la impresora termica.
#
# No necesita dependencias: solo Python 3 (viene en Raspberry Pi OS) y `lp`
# (CUPS, paquete cups-client).
#
# Configuracion en /etc/default/turnero-print-agent:
#   PRINTER_NAME=SAT38TUSE        # cola CUPS (vacio = autodetecta)
#   PRINTER_DEVICE=/dev/usb/lp0   # respaldo si CUPS falla (opcional)
#   PORT=9110                     # puerto en localhost
# =============================================================================
import base64
import binascii
import json
import os
import re
import subprocess
import tempfile
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PRINTER_NAME = (os.environ.get("PRINTER_NAME") or "").strip()
PRINTER_DEVICE = (os.environ.get("PRINTER_DEVICE") or "").strip()
PORT = int(os.environ.get("PORT") or 9110)
MAX_BYTES = 4 * 1024 * 1024

_impresion = threading.Lock()
_impresora = None

TERMICA = re.compile(
    r"(pos|thermal|termic|receipt|esc/?pos|58|80|sat|epson|xprinter|ticket)", re.I
)
VIRTUAL = re.compile(r"(pdf|fax|xps|onenote|send to|microsoft print|virtual)", re.I)


def log(mensaje):
    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + mensaje, flush=True)


def detectar_impresora():
    """Nombre de la cola CUPS: PRINTER_NAME o la termica instalada."""
    if PRINTER_NAME:
        return PRINTER_NAME
    try:
        salida = subprocess.run(
            ["lpstat", "-p"], capture_output=True, text=True, timeout=5
        ).stdout
    except Exception as e:
        log("No se pudo ejecutar lpstat: %s" % e)
        return None

    nombres = []
    for linea in salida.splitlines():
        m = re.search(r"(?:printer|impresora)\s+(\S+)", linea, re.I)
        if not m:
            continue
        nombre = m.group(1)
        if re.search(r"(deshabilitad|disabled|paused|pausad)", linea, re.I):
            continue
        nombres.append(nombre)

    for nombre in nombres:
        if VIRTUAL.search(nombre):
            continue
        if TERMICA.search(nombre):
            return nombre

    try:
        salida = subprocess.run(
            ["lpstat", "-d"], capture_output=True, text=True, timeout=5
        ).stdout
        m = re.search(r"(?:system default destination|destino predeterminado)[:\s]+(\S+)", salida, re.I)
        if m:
            return m.group(1)
    except Exception:
        pass
    return nombres[0] if nombres else None


def enviar_a_cups(nombre, datos):
    ruta = None
    try:
        fd, ruta = tempfile.mkstemp(prefix="turno-", suffix=".bin")
        with os.fdopen(fd, "wb") as f:
            f.write(datos)
        # -o raw: CUPS no aplica filtros y manda el ESC/POS tal cual.
        r = subprocess.run(
            ["lp", "-d", nombre, "-o", "raw", ruta],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if r.returncode == 0:
            return True
        log("lp fallo para '%s': %s" % (nombre, (r.stderr or r.stdout).strip()))
        return False
    except Exception as e:
        log("Excepcion enviando a CUPS: %s" % e)
        return False
    finally:
        if ruta and os.path.exists(ruta):
            try:
                os.unlink(ruta)
            except OSError:
                pass


def enviar_a_dispositivo(datos):
    if not PRINTER_DEVICE:
        return False
    try:
        with open(PRINTER_DEVICE, "wb") as f:
            f.write(datos)
            f.flush()
        return True
    except Exception as e:
        log("No se pudo escribir en %s: %s" % (PRINTER_DEVICE, e))
        return False


def imprimir(datos):
    with _impresion:
        if _impresora and enviar_a_cups(_impresora, datos):
            return True
        if enviar_a_dispositivo(datos):
            return True
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "TurneroPrintAgent/1.0"

    def log_message(self, formato, *args):
        log("%s - %s" % (self.address_string(), formato % args))

    def _cors(self):
        # El kiosco se sirve por https y llama a http://localhost: Chrome lo
        # permite (origen de confianza) pero manda un preflight de "private
        # network access", que hay que responder con este header.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, estado, obj):
        cuerpo = json.dumps(obj).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(cuerpo)
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        ruta = self.path.split("?", 1)[0]
        if ruta == "/health":
            self._json(200, {"ok": True, "printer": _impresora})
        else:
            self._json(404, {"ok": False, "error": "ruta no encontrada"})

    def do_POST(self):
        ruta = self.path.split("?", 1)[0]
        if ruta != "/print":
            self._json(404, {"ok": False, "error": "ruta no encontrada"})
            return
        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0
        if largo <= 0 or largo > MAX_BYTES:
            self._json(400, {"ok": False, "error": "tamano invalido"})
            return
        try:
            cuerpo = json.loads(self.rfile.read(largo).decode("utf-8"))
            b64 = cuerpo.get("b64")
            if not b64:
                raise ValueError("falta b64")
            datos = base64.b64decode(b64, validate=True)
        except (ValueError, binascii.Error, UnicodeDecodeError) as e:
            self._json(400, {"ok": False, "error": str(e)})
            return

        ok = imprimir(datos)
        if ok:
            log("Ticket impreso (%d bytes)" % len(datos))
        else:
            log("Fallo al imprimir el ticket (%d bytes)" % len(datos))
        self._json(200, {"ok": ok})


def crear_servidor(direccion):
    clase = ThreadingHTTPServer
    if ":" in direccion:
        import socket

        class IPv6Server(ThreadingHTTPServer):
            address_family = socket.AF_INET6

        clase = IPv6Server
    servidor = clase((direccion, PORT), Handler)
    servidor.daemon_threads = True
    return servidor


def main():
    global _impresora
    _impresora = detectar_impresora()
    if not _impresora and not PRINTER_DEVICE:
        log("ERROR: no hay impresora. Define PRINTER_NAME (lpstat -p) o PRINTER_DEVICE.")
        raise SystemExit(1)
    log(
        "Impresora: %s%s"
        % (
            _impresora or "(sin CUPS)",
            " (device: %s)" % PRINTER_DEVICE if PRINTER_DEVICE else "",
        )
    )

    # Localhost en IPv4 e IPv6: Chrome puede resolver `localhost` a ::1.
    servidores = []
    for direccion in ("127.0.0.1", "::1"):
        try:
            servidores.append(crear_servidor(direccion))
        except OSError as e:
            log("No se pudo escuchar en %s:%d: %s" % (direccion, PORT, e))

    if not servidores:
        log("ERROR: no se pudo abrir el puerto %d" % PORT)
        raise SystemExit(1)

    for servidor in servidores:
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        log("Escuchando en http://%s:%d" % (servidor.server_address[0], PORT))

    threading.Event().wait()


if __name__ == "__main__":
    main()
