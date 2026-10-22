# Despliegue en producción

Dominio público: **https://turnero.serviredgane.cloud**
El TLS lo termina **Cloudflare**; el origen (este servidor) responde en HTTP.

## URLs

| Aplicación | URL |
|---|---|
| Kiosco (tótem de turnos) | `https://turnero.serviredgane.cloud/` |
| Caja + Admin | `https://turnero.serviredgane.cloud/caja/` |
| Pantalla (visualizador TV) | `https://turnero.serviredgane.cloud/pantalla/` |
| API (health) | `https://turnero.serviredgane.cloud/api/health` |
| Descarga del APK (requiere admin) | `https://turnero.serviredgane.cloud/api/apk/download` |

El panel de **administración** está dentro de `/caja/`. Pestañas: turnos, servicios,
impresión/voz, Pantalla (APK) y usuarios.

## Arquitectura

Todo corre en el mismo servidor con Docker Compose. No se usa registry externo: Jenkins
construye las imágenes y levanta el stack localmente.

```
Internet
  └─ Cloudflare (HTTPS)
       └─ Nginx Proxy Manager (HTTP)   [contenedor ya existente en el servidor]
            └─ web  (nginx: sirve los 3 SPAs y hace de proxy hacia el API)
                 └─ api  (NestJS + Sequelize)  ──>  MySQL  MagisoftV1 (172.20.1.92)
```

- **Red:** `red-gane-int` (**externa**, compartida con Nginx Proxy Manager y otros
  servicios del servidor).
- El servicio `web` **no publica ningún puerto en el host**: NPM entra por la red interna.
- Alias de red **únicos**: `turnero-api` y `turnero-web`. En `red-gane-int` existen otros
  contenedores con los alias genéricos `api` y `web`; usar los nuestros evita que nginx
  resuelva al contenedor equivocado.
- Contenedores:
  - `api`: NestJS + OpenJDK 17 + Android SDK (compila el APK de la pantalla bajo demanda).
  - `web`: nginx 1.27 con los tres frontends compilados.
- Volúmenes: `media` (imágenes/videos), `gradle-cache`, `android-build`, `apk-dist`.

## Requisitos en el servidor

- Docker Engine + plugin `docker compose`.
- Jenkins con un job que apunte a `deploy/Jenkinsfile` (agente con acceso a Docker).
- Credencial Jenkins tipo **Secret file**:
  - ID: **`turnero-prod-env`**
  - Contenido: el archivo `deploy/.env` de producción.
- Red externa `red-gane-int` (`docker network create red-gane-int` si no existiera).
- Nginx Proxy Manager conectado a `red-gane-int`.

## Variables de entorno (`deploy/.env`)

| Variable | Descripción |
|---|---|
| `DB_HOST` / `DB_PORT` | Servidor MySQL (`172.20.1.92`, puerto `3306`). |
| `DB_NAME` | Nombre de la base, **entre comillas por el espacio inicial**: `" MagisoftV1"`. |
| `DB_USER` / `DB_PASS` | Usuario y contraseña de MySQL. |
| `DB_SYNCHRONIZE` | `false` en producción. |
| `JWT_SECRET` / `JWT_EXPIRES` | Firma y vigencia de los tokens. |
| `API_URL` | URL pública (`https://turnero.serviredgane.cloud`). |
| `CORS_ORIGINS` | `https://turnero.serviredgane.cloud`. |
| `SEDE_ID` / `EMP_ID` | Sede y empresa de MagisoftV1. |
| `ESTADO_ESPERA` / `ESTADO_LLAMANDO` / `ESTADO_TERMINADO` / `ESTADO_CANCELADO` | Estados de turno. |
| `PRINTER_INTERFACE` | Cómo imprimir: `kiosk` (**el propio kiosco imprime**, como el master), `queue` (agente remoto), `tcp://IP:9100`, `win:Nombre`, `/dev/usb/lp0`, o vacío (`auto`). |
| `PRINTER_AGENT_TOKEN` | Token compartido con el agente de impresión. **Obligatorio** cuando `PRINTER_INTERFACE=queue`. |
| `PRINT_AGENT_URL` | URL del agente local de impresión en la PC del kiosco (`http://localhost:9110`). Se usa cuando `PRINTER_INTERFACE=kiosk`. |
| `PRINTER_TYPE` / `PRINTER_WIDTH` / `PRINTER_CHARACTER_SET` | Tipo de comandos (`epson`), ancho de papel (`48`) y juego de caracteres (`PC850_MULTILINGUAL`). |
| `DISPLAY_SCREEN` | Número de pantalla del visualizador (`1` por defecto). |

> **Importante:** la contraseña de la base de datos debe ser la real (en una plantilla
> antigua aparecía como `cambia_esto`). Con la contraseña de plantilla el API entra en
> bucle de arranque y nginx responde `502`.

## Despliegue

1. **Sube el `.env` de producción** al credential `turnero-prod-env` de Jenkins
   (*Manage Jenkins → Credentials → turnero-prod-env → Update*).
2. **Ejecuta el job.** El pipeline hace:
   - **Preparar**: verifica Docker y copia el credential a `deploy/.env`
     (normalizando BOM/CRLF con `deploy/prepare-env.sh`).
   - **Build imagenes**: `docker compose build --pull`.
   - **Desplegar**: `docker compose up -d --remove-orphans`.
   - **Verificar**: comprueba `GET /api/health` **a través de nginx**, desde dentro
     del contenedor `web`.
   - **post**: borra `deploy/.env` y limpia imágenes colgantes.
3. **Nginx Proxy Manager**: crea/edita el Proxy Host (ver tabla siguiente).

## Nginx Proxy Manager

| Campo | Valor |
|---|---|
| Domain Names | `turnero.serviredgane.cloud` |
| Scheme | `http` |
| Forward Hostname / IP | **`turnero-web`** |
| Forward Port | **`80`** |
| Block Common Exploits | activado |
| Access List | Publicly Accessible |
| SSL | **ninguno** (Cloudflare hace HTTPS; Let's Encrypt choca con Cloudflare) |

## Operación

```bash
cd /var/lib/jenkins/workspace/despliegue\ turnero      # o donde esté el repo

# Estado de los contenedores
sudo docker compose -f deploy/docker-compose.yml ps

# Logs en vivo
sudo docker compose -f deploy/docker-compose.yml logs -f api

# Reiniciar solo el API
sudo docker compose -f deploy/docker-compose.yml restart api

# Forzar recreación con el .env actual
sudo docker compose -f deploy/docker-compose.yml up -d --force-recreate
```

## Disponibilidad (watchdog, alertas y respaldos)

Objetivo: que un fallo se recupere solo y que, si no se recupera, **te enteres antes
que el cliente**.

### Qué ya hace el stack (tras desplegar)

| Medida | Dónde | Para qué |
|---|---|---|
| `restart: unless-stopped` | compose | El contenedor vuelve solo si el proceso muere o si el servidor reinicia. |
| Healthcheck del API | compose | Detecta el proceso colgado. |
| `depends_on: service_healthy` | compose | `web` no arranca si el API no está sano. |
| Rotación de logs (`10m x 3`) | compose | Los logs ya no pueden llenar el disco (la causa #1 de "amaneció caído"). |
| `resolver 127.0.0.11` en nginx | `nginx.conf` | Tras recrear el API, nginx no se queda con la IP vieja → se evita el 502 y la pantalla congelada. |
| `/api/health` y `/api/health/ready` | API | El segundo comprueba la base legacy; úsalo en el monitoreo externo. |

### Instalar el watchdog y el respaldo (una sola vez, en el servidor)

Los scripts trabajan contra los contenedores (`docker ps` con la etiqueta del
proyecto), **no** necesitan el `.env` ni el compose: siguen funcionando después de
que Jenkins borra su `.env` temporal.

```bash
sudo mkdir -p /opt/turnero
sudo cp -r deploy /opt/turnero/deploy
sudo chmod +x /opt/turnero/deploy/watchdog.sh /opt/turnero/deploy/backup.sh
sudo install -m 644 /opt/turnero/deploy/systemd/*.service /etc/systemd/system/
sudo install -m 644 /opt/turnero/deploy/systemd/*.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now turnero-watchdog.timer turnero-backup.timer
```

> Al actualizar el repo, vuelve a copiar `deploy/` a `/opt/turnero/deploy`.

Comprobar que corre:

```bash
systemctl list-timers 'turnero-*'
journalctl -u turnero-watchdog -n 30
tail -n 50 /var/log/turnero-watchdog.log
```

- **Watchdog** (cada minuto): si un contenedor pasa 3 chequeos `unhealthy`, lo
  reinicia; si el API no responde por nginx 3 veces seguidas, reinicia `web` y `api`;
  si la base no responde, avisa sin reiniciar; los domingos limpia imágenes y caché.
- **Respaldo** (diario 02:30, `Persistent=true` recupera el que se perdió si el
  servidor estaba apagado): `mysqldump` de la base legacy + `tar.gz` de los medios en
  `/var/backups/turnero`, con 14 días de retención. Verifica la copia con `gzip -t`.

```bash
# Respaldo manual
sudo /opt/turnero/deploy/backup.sh
ls -lh /var/backups/turnero
```

Restaurar (con el turnero detenido para no escribir durante la restauración):

```bash
cd /var/backups/turnero
gunzip -c db-AAAAmmdd-HHMM.sql.gz | sudo docker exec -i turnero-api-1 sh -c \
  'mysql --host="$DB_HOST" --user="$DB_USER" -p"$DB_PASS" "$DB_NAME"'
sudo docker exec -i turnero-api-1 tar xzf - -C /app/apps/api/public < media-AAAAmmdd-HHMM.tar.gz
```

### Alertas (recomendado)

1. **Webhook** (opcional, sin dependencias): crea `/etc/default/turnero-watchdog` y
   `/etc/default/turnero-backup` con la misma línea y reinicia los timers:

   ```env
   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
   ```

   El cuerpo del POST es `{"text": "..."}` (Slack, Mattermost, Google Chat, Rocket.Chat).
   En Telegram usa `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>` (el
   mensaje va en el cuerpo JSON).

2. **Monitor externo** (independiente de este servidor, para saber si el servidor
   completo se cayó): UptimeRobot/Better Uptime gratis apuntando a
   `https://turnero.serviredgane.cloud/api/health/ready` cada 5 minutos con alerta
   por email. Si prefieres verlo en casa, Uptime Kuma en otro equipo de la red.

> Cloudflare puede responder 502/52x cuando el origen no está; el monitor externo
> debe considerar "caído" cualquier código >= 500 o un timeout.

### Si algo amanece caído: orden de revisión

```bash
sudo docker compose -f deploy/docker-compose.yml ps          # ¿running/healthy?
df -h                                                       # ¿disco lleno?
sudo docker compose -f deploy/docker-compose.yml logs --tail=200 api
curl -sS https://turnero.serviredgane.cloud/api/health/ready
tail -n 100 /var/log/turnero-watchdog.log
```

## Impresión de tickets

El API no imprime por sí mismo: genera el ticket en ESC/POS y lo envía por una de estas vías.

### Modo cola (recomendado)

Útil cuando la impresora está en **otro PC** y la red **no permite** que el servidor la
alcance (habitual en redes corporativas). El servidor **encola** el ticket y un pequeño
agente instalado en el PC de la impresora **sale** a buscarlo por HTTPS.

```
Navegador → API (VPS) ──encola──► GET /api/printer/queue ◄──agente (PC impresora) ──► impresora USB
```

Configuración en el `.env` de producción (credential de Jenkins):

```env
PRINTER_INTERFACE=queue
PRINTER_AGENT_TOKEN=<cadena-larga-aleatoria>
```

Luego, en el **PC que tiene la impresora USB**:

1. Copia `deploy/print-agent/` (el `PrintAgent.ps1` y un `agent.json`).
2. Crea `agent.json` junto al script (cópialo de `agent.example.json`):

   ```json
   {
     "mode": "poll",
     "api": "https://turnero.serviredgane.cloud/api",
     "token": "<el-mismo-PRINTER_AGENT_TOKEN>",
     "interval": 1000
   }
   ```

3. Abre **PowerShell como administrador** y ejecuta una vez (crea regla de firewall +
   tarea programada que arranca al iniciar sesión):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\PrintAgent.ps1 -Install
   ```

4. Comprueba el log (`print-agent.log`): debe decir
   `Agente listo (MODO POLL). Impresora '...'` y `Ticket A-001 (...) impreso [N bytes]`
   por cada turno.

> El agente **no necesita** puerto abierto ni que el servidor lo alcance: solo conexión
> saliente a `https://turnero.serviredgane.cloud`.

### Modo kiosco (imprime el propio kiosco, como el turnero master)

Equivale a como imprimía el turnero **master**: la impresora va conectada al **mismo PC del
kiosco** y es el propio kiosco el que manda el ticket a imprimir. No depende de que el
servidor alcance ninguna impresora ni de un agente «saliente».

```
Kiosco (página web) ──POST /turns──► API ──devuelve ticket (ESC/POS base64)──►
Kiosco ──POST http://localhost:<puerto>/print──► agente local (PC del kiosco) ──► impresora USB
```

Configuración en el `.env` de producción (credential de Jenkins):

```env
PRINTER_INTERFACE=kiosk
PRINT_AGENT_URL=http://localhost:9110
```

Luego, en el **PC del kiosco**:

1. Copia `deploy/print-agent/` (`PrintAgent.ps1` y un `agent.json`).
2. Instala el agente en modo **local** (crea la tarea `TurneroPrintAgentLocal`, que
   arranca al iniciar sesión):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\PrintAgent.ps1 -Mode local -Port 9110 -Install
   ```

   No hace falta tocar el `agent.json`: la tarea lleva el modo y el puerto en sus
   argumentos (y así convive con el agente `poll`, que usa el `agent.json`).

   Si prefieres configurarlo por archivo, crea `agent.json` con:

   ```json
   {
     "mode": "local",
     "printer": "",
     "port": 9110
   }
   ```

   (`printer` vacío = autodetecta la térmica; `port` es el puerto en `localhost`.)

3. Comprueba que el agente responde:

   ```powershell
   Invoke-RestMethod http://localhost:9110/health
   # -> ok      : True
   #    printer  : POS-80-Series
   ```

4. Abre el kiosco en Chrome. **No** hace falta configurar nada más: por defecto el kiosco
   llama a `http://localhost:9110/print`. Para cambiar la URL, define `PRINT_AGENT_URL`
   en el `.env` de producción (o `VITE_PRINT_AGENT_URL` al compilar el kiosco).

> Chrome permite que una página **https** llame a **http://localhost** (origen de confianza),
> por eso funciona aunque el kiosco se sirva por HTTPS. El ticket ya viene armado por el API
> (mismo diseño de ticket que en el modo cola).
>
> **Cada PC de kiosco necesita su propio agente local**; si un kiosco no lo tiene, el turno
> se crea igual pero no se imprime ticket.

#### Atril con Raspberry Pi (Linux)

`PrintAgent.ps1` es solo para Windows (usa el spooler de Windows). En la Raspberry Pi se usa
`deploy/print-agent/print-agent-linux.py`: escucha en `localhost:9110`, recibe el ticket en
base64 y lo manda a la impresora por CUPS con `lp -o raw` (o directo a `/dev/usb/lp0` como
respaldo). No necesita dependencias fuera de Python 3 y CUPS.

En la Raspberry Pi:

```bash
# 1. Nombre exacto de la impresora en CUPS (ej. SAT38TUSE)
lpstat -p

# 2. Copiar el agente y su servicio
sudo mkdir -p /opt/turnero/print-agent
sudo cp deploy/print-agent/print-agent-linux.py /opt/turnero/print-agent/
sudo install -m 644 deploy/print-agent/turnero-print-agent.service /etc/systemd/system/

# 3. Impresora (y usuario, si no es `pi`)
sudo tee /etc/default/turnero-print-agent >/dev/null <<'EOF'
PRINTER_NAME=SAT38TUSE
PORT=9110
EOF

# 4. Arrancar
sudo systemctl daemon-reload
sudo systemctl enable --now turnero-print-agent
curl http://localhost:9110/health
# -> {"ok": true, "printer": "SAT38TUSE"}
```

Probar la impresora sin pasar por el kiosco:

```bash
printf 'PRUEBA DE IMPRESION\n\n\n\n' > /tmp/prueba.txt
lp -d SAT38TUSE -o raw /tmp/prueba.txt
lpstat -o SAT38TUSE        # si queda un trabajo atascado: cancel -a SAT38TUSE
```

Problemas típicos en el atril:

| Síntoma | Causa | Solución |
|---|---|---|
| `curl localhost:9110/health` no responde | El servicio no arrancó. | `journalctl -u turnero-print-agent -n 50` |
| Imprime pero sale basura/cortado | La cola CUPS aplica filtros. | El agente ya usa `-o raw`; si persiste, usa `PRINTER_DEVICE=/dev/usb/lp0`. |
| La impresora aparece **deshabilitada** en `lpstat -p` | Cola pausada. | `sudo cupsenable SAT38TUSE && sudo cupsaccept SAT38TUSE` |
| El turno se crea pero no imprime | El navegador no llega al agente. | Abre la consola del kiosco: debe fallar el `POST http://localhost:9110/print`; revisa `PRINT_AGENT_URL` y que el agente escuche (IPv4/IPv6). |


### Impresora USB conectada al propio servidor

Alternativa si la impresora está enchufada al servidor. El dispositivo hay que exponerlo en
el servicio `api` de `docker-compose.yml`:

```yaml
  api:
    devices:
      - "/dev/usb/lp0:/dev/usb/lp0"
```

y usar `PRINTER_INTERFACE=/dev/usb/lp0`. Si el servidor **no** tiene esa impresora,
**no añadas** la línea (o el `up` fallará).

### Agente como servidor TCP (modo antiguo)

`-Mode tcp` (por defecto) deja al agente escuchando en `9100` y requiere abrir ese puerto
al servidor (`PRINTER_INTERFACE=tcp://IP:9100`). Solo funciona si la red permite
servidor → PC, por eso **no** se usa en la red actual.

## APK de la pantalla

Se genera desde **`/caja/` → pestaña "Pantalla (APK)"** (o `POST /api/apk/build`), y se
descarga con `GET /api/apk/download`. El APK empaqueta un WebView que abre la URL de la
pantalla configurada.

## Problemas típicos

| Síntoma | Causa probable | Solución |
|---|---|---|
| `502 Bad Gateway` en el navegador | El API está caído (revisa `logs api`). | Corregir el `.env` y re-desplegar. Si empezó justo después de un despliegue, nginx tenía la IP vieja: ya se corrige solo con `resolver 127.0.0.11` en `nginx.conf`. |
| `SequelizeAccessDeniedError: Access denied for user ...` | Contraseña incorrecta o MySQL no autoriza esa IP. | Corregir `DB_PASS`; si persiste, autorizar al usuario desde la IP del servidor (`GRANT ... TO 'cliente'@'<ip>'`). |
| `404`/`401` en rutas que existen | nginx resuelve al alias genérico `api`/`web` de **otro** contenedor. | Usar `turnero-api`/`turnero-web` (ya configurado). |
| `port is already allocated` | Un puerto del host ya está ocupado (80 = NPM, 8080 = Jenkins). | No publicar puertos: el `web` va por la red interna. |
| El contenedor no toma el `.env` nuevo | Compose no recreó el contenedor. | `docker compose up -d --force-recreate api`. |

## Notas

- `deploy/.env` **nunca** va a git (está en `.gitignore`); vive solo en el credential de
  Jenkins y en la máquina del administrador.
- El pipeline **no** archiva `deploy/.env` y lo borra al terminar cada build.
