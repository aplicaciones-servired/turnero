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
| `502 Bad Gateway` en el navegador | El API está caído (revisa `logs api`). | Corregir el `.env` y re-desplegar. |
| `SequelizeAccessDeniedError: Access denied for user ...` | Contraseña incorrecta o MySQL no autoriza esa IP. | Corregir `DB_PASS`; si persiste, autorizar al usuario desde la IP del servidor (`GRANT ... TO 'cliente'@'<ip>'`). |
| `404`/`401` en rutas que existen | nginx resuelve al alias genérico `api`/`web` de **otro** contenedor. | Usar `turnero-api`/`turnero-web` (ya configurado). |
| `port is already allocated` | Un puerto del host ya está ocupado (80 = NPM, 8080 = Jenkins). | No publicar puertos: el `web` va por la red interna. |
| El contenedor no toma el `.env` nuevo | Compose no recreó el contenedor. | `docker compose up -d --force-recreate api`. |

## Notas

- `deploy/.env` **nunca** va a git (está en `.gitignore`); vive solo en el credential de
  Jenkins y en la máquina del administrador.
- El pipeline **no** archiva `deploy/.env` y lo borra al terminar cada build.
