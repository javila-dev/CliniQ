# Separar CliniQ en dos dominios: sitio público y aplicación

Análisis del 2026-10-24. **No implementado.**

> **Decisión (2026-10-24):** se hace solo la **fase 1**: el landing y el
> registro de clínicas pasan a un dominio nuevo y la app se queda en
> `cliniq.2asoft.tech`, sin fricción para las clínicas ni sus pacientes. La
> fase 2 (mover la app) queda descartada por ahora.
>
> **Dominio del sitio público: `tucliniq.com`** (elegido y comprado el
> 2026-10-24, en Hostinger). El `.co` no se compró.

En este documento se usan dos nombres:

- `SITIO` — landing y registro de clínicas (prueba gratuita): **`tucliniq.com`**,
  con `www.tucliniq.com` redirigiendo a él.
- `APP` — todo lo que hay detrás del inicio de sesión: **`cliniq.2asoft.tech`**
  (no cambia). La fase 2, si algún día se hace, la movería a `app.tucliniq.com`.

Hoy todo vive en `cliniq.2asoft.tech` (Next.js) y la API en
`api.cliniq.2asoft.tech` (Django).

---

## 1. Resumen y recomendación

1. **Una sola app Next con dos hosts** (opción A), con un `middleware.ts` que
   decide qué rutas sirve cada host. Una sola imagen, el mismo
   `build-and-push.ps1` y un dominio más en Dokploy. Pasar después a dos apps
   (opción B) sigue siendo posible y ya no cambiaría ninguna URL.
2. **Hacerlo en dos fases:**
   - **Fase 1:** el landing y el registro se mudan al dominio nuevo (`SITIO`).
     La app **se queda en `cliniq.2asoft.tech`**. Las clínicas no notan nada:
     no tienen que iniciar sesión de nuevo, sus enlaces y marcadores siguen
     sirviendo, y no hay que tocar Meta/Lyvio ni Google.
   - **Fase 2 (opcional, más adelante):** la app se muda a `APP`
     (`app.<dominio>`) y `cliniq.2asoft.tech` queda redirigiendo para siempre.
     Esta fase sí tiene costo: cada usuario inicia sesión una vez, Lyvio tiene
     que agregar el dominio en su app de Meta, hay que actualizar Google OAuth,
     y los iframes de autorregistro que las clínicas pusieron en su sitio web
     pasan a depender de la redirección.
3. **La cookie de sesión no cambia de diseño:** sigue siendo del host
   (sin `Domain=`), solo en el dominio de la app. El sitio público no necesita
   sesión.
4. **El backend casi no cambia:** en la fase 1, nada obligatorio. En la fase 2,
   `FRONTEND_URL` y `DJANGO_CSRF_TRUSTED_ORIGINS`.

---

## 2. Cómo está hoy (lo que importa para la separación)

### Frontend (`frontend/`)

- **Sin `middleware.ts`.** No hay ninguna lógica por host.
- `src/app/page.tsx`: `/` redirige a `/dashboard` (y de ahí, sin sesión, a
  `/login`). **El landing no está en `/`, está en `/landing`.** Para Google, la
  raíz del dominio es una pantalla de login.
- Rutas públicas que existen hoy, sin layout compartido:

  | Ruta | Para quién | Quién genera el enlace |
  |---|---|---|
  | `/landing` | prospectos | — |
  | `/registro-clinica` | prospectos (alta + prueba de 14 días) | landing |
  | `/verificar-clinica/[token]` | clínica recién registrada | correo, `FRONTEND_URL` (`apps/clinicas/services.py:16`) |
  | `/recuperar-contrasena`, `/restablecer-password` | usuarios | correo, `FRONTEND_URL` (`apps/users/services.py:172`) |
  | `/login`, `/console/login` | usuarios, equipo interno | — |
  | `/registro/[token]` | **pacientes** (autorregistro) | `window.location.origin` (`agenda/page.tsx:1503`, `ClinicaConfig.tsx:892`); **se inserta en iframe en el sitio web de la clínica** |
  | `/confirmar/[token]` | pacientes (confirmar cita) | WhatsApp/correo, `FRONTEND_URL` (`apps/agenda/confirmacion.py:39`) |
  | `/firma-movil/[token]` | profesional (firma desde el celular, QR) | `window.location.origin` (`CapturaFirmaProfesional.tsx:85`) |
  | `/firmar-consentimiento/[token]` | pacientes | backend |
  | `/api/media-proxy`, `/api/version` | la app | — |

- Autenticado: grupo `(authenticated)` con `AuthGuard` (cliente) y `/console`
  (superadmin, con suplantación). `AuthGuard` manda a `/login?next=…` con ruta
  relativa: funciona igual en cualquier host.
- `next.config.ts`:
  - Rewrite `/proxy/:path*` → `${BACKEND_URL}/api/:path*/` (red interna de
    Docker). **El navegador nunca habla con `api.cliniq.2asoft.tech`**: en
    producción `NEXT_PUBLIC_API_URL=/proxy/v1`.
  - CSP en solo reporte; `connect-src 'self'`. Aplicada: `object-src`,
    `base-uri`, `form-action` y `frame-ancestors 'self'` en todo menos
    `/registro/*`, que se deja insertar en iframes ajenos.
  - HSTS de un año sin `includeSubDomains`.
  - Redirecciones viejas de Configuración (no dependen del host).
- SEO: solo `metadata` (título y descripción) en `/landing` y en el layout
  raíz. **No hay `robots.txt`, `sitemap.xml`, `metadataBase`, canonical ni
  Open Graph.** Nada impide que se indexen las páginas con token.
- Enlaces internos del landing y del registro con ruta relativa:
  `LandingPageV3.tsx` (`/login`, `/registro-clinica`, logo a `/landing`),
  `Precios.tsx`, `registro-clinica/page.tsx:286` (`/login`),
  `verificar-clinica` (`/login`, `/registro-clinica`).
- `src/components/marketing/LandingPage.tsx` es la versión anterior del landing
  (comentario: "montada en /landing"); `/landing` hoy usa `LandingPageV3` y
  nada importa el archivo viejo.
- Almacenamiento del navegador (por origen): `clinica_id`,
  `superadmin-clinica-activa`, `theme-preferences`, vista de agenda y de
  seguimiento, tour, cámara preferida, borrador del diálogo de tratamiento,
  banner de puesta en marcha. Son preferencias; ninguna es un dato clínico.

### Sesión (cookie HttpOnly)

- `apps/users/cookie_sesion.py`: el refresh va en la cookie `cliniq_refresh`,
  `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, **sin `Domain`** (cookie del
  host). La pone Django, pero como la respuesta pasa por el rewrite `/proxy`,
  el navegador la guarda para **el host del frontend** (`cliniq.2asoft.tech`).
- El access token vive en memoria; al recargar se pide con la cookie
  (`lib/api/sesion.ts`). `BroadcastChannel('cliniq-sesion')` avisa a las demás
  pestañas del mismo origen.
- Suplantación (`ImpersonateUserView` / `TerminarSuplantacionView`): solo un
  access token de 60 minutos, sin cookie; la sesión del superadmin sigue en su
  cookie y vuelve a ella al terminar. Todo ocurre en la misma pestaña y el
  mismo origen.

### Backend (`backend/config/`)

- `ALLOWED_HOSTS` por `DJANGO_ALLOWED_HOSTS` (por defecto `*`).
- `CSRF_TRUSTED_ORIGINS` por `DJANGO_CSRF_TRUSTED_ORIGINS`; por defecto
  `https://api.cliniq.2asoft.tech,https://cliniq.2asoft.tech`.
- CORS cerrado: `CORS_ALLOWED_ORIGINS` vacío y `CORS_ALLOW_CREDENTIALS=False`,
  porque todo entra por el mismo origen.
- `FRONTEND_URL` es la única base de URLs absolutas: confirmación de cita,
  verificación de clínica, invitación y restablecimiento de contraseña, y
  avisos de la suscripción (`apps/suscripciones/ciclo_vida.py:233`, rutas
  `/preparar-clinica`, `/agenda`, `/configuracion/plan`).
- Webhooks: Documenso en `/webhooks/documenso/` (fuera de `/api`, así que solo
  puede llegar por `api.cliniq.2asoft.tech`); Wompi en
  `/api/v1/suscripcion/webhooks/wompi/`; Lyvio en
  `/api/v1/notificaciones/lyvio-webhook/`. Estos dos últimos podrían estar
  configurados contra la API o contra `cliniq.2asoft.tech/proxy/v1/...`:
  **hay que mirarlo en los paneles de Wompi y Lyvio** (ver §6).
- Wompi: el pago se hace en la pantalla `/configuracion/plan` de la app
  (tokenización desde el navegador, sin URL de retorno). Alegra no enlaza a
  CliniQ.

### Despliegue (Dokploy)

- Frontend: `frontend/docker-compose.prod.yml` con la imagen
  `jorgeavilag/cliniq:latest`; los dominios se configuran en la pestaña
  Domains de Dokploy (Traefik), no en el compose. `build-and-push.ps1` hornea
  las `NEXT_PUBLIC_*` desde `frontend/.env.production` (en la máquina que
  compila) y dispara el webhook de Dokploy.
- Backend: `backend/docker-compose.prod.yml`, sin puertos publicados; Traefik
  enruta `api.cliniq.2asoft.tech`. Push a `main` despliega.

### Servicios externos atados al host actual

- **Meta / Lyvio (WhatsApp con número propio):** el Embedded Signup usa el SDK
  de Facebook con la app de **Lyvio** (`2050257332050356`), y
  `https://cliniq.2asoft.tech/` está en sus "dominios permitidos del SDK de
  JavaScript" (`docs/plan-whatsapp-numero-propio.md`). Si la app cambia de
  host, **Lyvio** tiene que agregar el nuevo; nosotros no podemos.
- **Google Sign-In:** el cliente OAuth tiene orígenes JavaScript autorizados;
  el host de la app debe estar ahí.
- **Documenso embebido:** `frame-src` lo permite desde nuestro lado; hay que
  confirmar que la instancia no restrinja desde qué origen se embebe.
- **n8n:** los mensajes llevan las URLs que arma el backend, pero algún flujo
  podría tener `cliniq.2asoft.tech` escrito a mano.

---

## 3. Qué ruta va en cada dominio

Regla: **en `SITIO` solo lo que sirve para vender y dar de alta una clínica.
Todo lo que termina en una sesión o lo usa un paciente con token va en `APP`.**

| Ruta | Dominio | Motivo |
|---|---|---|
| `/` (hoy `/landing`) | SITIO | El landing pasa a la raíz. |
| `/registro-clinica` | SITIO | Alta de clínica; es parte del embudo. |
| Futuras: `/precios`, `/funciones/*`, `/blog`, `/legal/*` | SITIO | Contenido para SEO. |
| `/proxy/v1/registro-clinica/*` (planes, alta, verificación) | SITIO | El formulario llama a la API por el proxy. Solo estos endpoints. |
| `/verificar-clinica/[token]` | APP | Lleva directo a crear contraseña y de ahí al login; el correo lo arma `FRONTEND_URL`. |
| `/login`, `/recuperar-contrasena`, `/restablecer-password` | APP | La cookie se pone en el host del login. |
| `(authenticated)/*`, `/console/*` | APP | La suplantación necesita el mismo origen que el console. |
| `/registro/[token]` (autorregistro de pacientes) | APP | Usa la API de la clínica, ya está repartido en iframes y enlaces. |
| `/confirmar/[token]`, `/firma-movil/[token]`, `/firmar-consentimiento/[token]` | APP | Mismo motivo; además no deben indexarse. |
| `/api/media-proxy`, `/api/version`, `/proxy/*` completo | APP | Archivos privados y la API. |

Con esto el backend **no necesita una URL nueva** (`SITIO_URL`): ningún correo
ni WhatsApp enlaza al sitio público. `FRONTEND_URL` sigue siendo la URL de la
app.

**Flujo de alta con dos dominios:**
`SITIO/` → `SITIO/registro-clinica` (envía el formulario por
`SITIO/proxy/v1/registro-clinica/`) → correo con
`APP/verificar-clinica/<token>` → `APP/recuperar-contrasena?token=…` (crear
contraseña) → `APP/login` → `APP/preparar-clinica`.
El enlace "Inicia sesión" del registro y del landing pasa a ser una URL
absoluta a `APP/login` (si ya hay sesión, el login redirige solo; ya lo hace).

---

## 4. Opciones de arquitectura

### Opción A — una sola app Next con dos hosts (recomendada)

Los dos dominios apuntan al mismo contenedor. Un `src/middleware.ts` mira el
host:

- **Host `SITIO`:**
  - `/` → *rewrite* a `/landing` (la URL no cambia).
  - Deja pasar `/registro-clinica`, `/proxy/v1/registro-clinica/*`,
    `/proxy/v1/core/csp-reporte/`, `/_next/*`, `/img/*`, `/brand/*`,
    fuentes, `robots.txt`, `sitemap.xml`, `icon.png`.
  - Cualquier otra ruta → **308 a `APP` con la misma ruta y query** (quien
    escriba `SITIO/login` o `SITIO/agenda` termina en la app).
  - `/proxy/*` que no sea registro → 404. Así el sitio público no expone la
    API de la app, aunque sin cookie tampoco podría usarla.
- **Host `APP`:**
  - `/` sigue redirigiendo a `/dashboard` (como hoy).
  - `/landing` y `/registro-clinica` → 308 a `SITIO` (para enlaces viejos y
    anuncios ya publicados).
- **Cualquier otro host** (IP cruda, el viejo en la fase 2): ver §7.
- Si las variables de host están vacías, el middleware no hace nada: la app se
  comporta exactamente como hoy. Así se puede desplegar el código antes de
  tener el dominio.

Cabeceras por host con `has: [{ type: 'host', value: … }]` en `headers()`
de `next.config.ts`:

- `APP`: `X-Robots-Tag: noindex, nofollow` en todo.
- `SITIO`: la CSP puede abrirse para lo que marketing necesite (píxel de Meta,
  Google Analytics/Tag Manager) **sin abrirla en la app**, donde hay datos de
  pacientes. Esto es una ventaja concreta de separar.

Las URLs cruzadas se hornean en el build como las demás `NEXT_PUBLIC_*`
(`frontend/.env.production`): `NEXT_PUBLIC_SITIO_URL` y
`NEXT_PUBLIC_APP_URL`. El middleware usa los hosts que salen de ellas
(no depender de variables de entorno en tiempo de ejecución en el middleware:
según la versión de Next en *standalone* se leen en el build).

**A favor:**
- Una imagen, un build, un deploy: `build-and-push.ps1` y la imagen no cambian;
  en Dokploy solo se agrega un dominio al servicio del frontend.
- El registro reutiliza `apiClient`, los componentes de UI y el proxy sin
  tocar CORS.
- Poco código: el middleware, enlaces absolutos, `robots`/`sitemap`/metadatos.

**En contra:**
- El landing se despliega junto con la app: un cambio de texto en el landing
  obliga a reconstruir y subir todo, y un build roto de la app también tumba el
  landing.
- El middleware corre en cada petición (hay que excluir `/_next/static`, etc.
  con `matcher`) y es una pieza nueva que no existe hoy.
- Todo el bundle de la app viaja en la misma imagen que el sitio (no afecta lo
  que descarga el visitante del landing, que solo baja su ruta).

### Opción B — dos apps separadas

Una app nueva (por ejemplo `sitio/` en el repo, Next con `output: 'export'`
o Astro) para el landing y el registro, con su imagen, su script de build y su
servicio en Dokploy. La app actual pierde `/landing` y `/registro-clinica`.

**A favor:**
- Marketing se despliega solo; un error en el landing no toca la app y
  viceversa.
- El sitio puede ser estático (más rápido y barato, ideal para SEO) o pasar a
  un CMS/constructor sin tocar la app.
- La app queda sin rutas de marketing.

**En contra:**
- Segundo pipeline: otra imagen en Docker Hub, otro `build-and-push`, otro
  servicio y webhook en Dokploy, otro `.env.production`.
- El formulario de registro necesita llegar a la API. Dos caminos:
  1. Que el sitio tenga su propio proxy al backend (no puede ser estático y
     debe estar en `cliniq_network`), o
  2. Llamar directo a `api.<dominio>/api/v1/registro-clinica/` con
     `CORS_ALLOWED_ORIGINS=https://SITIO` (sin credenciales) y revisar que el
     límite de intentos por IP siga funcionando (`DRF_NUM_PROXIES`) cuando la
     petición llega por Traefik y no por Next.
- Duplicar fuentes (Geist), tokens de diseño y componentes de UI del
  formulario, o montar un paquete compartido.

### Comparación

| | A: una app, dos hosts | B: dos apps |
|---|---|---|
| Trabajo inicial | Bajo (middleware + enlaces + SEO) | Medio/alto (app nueva, pipeline, CORS o proxy) |
| Deploy del landing | Junto con la app | Independiente |
| Riesgo para las clínicas | Bajo si el middleware queda inactivo sin variables | Bajo |
| Registro de clínicas | Igual que hoy (proxy) | Requiere CORS o proxy propio |
| CSP de marketing separada | Sí, por host | Sí, por app |
| Cambiar de opción después | A → B sin cambiar URLs | — |

**Recomendación:** A ahora. Lo caro de cambiar son los dominios (enlaces
repartidos, Meta, Google, iframes); la topología de despliegue no. Con A las
URLs quedan separadas desde el primer día y pasar a B más adelante es un
cambio interno de despliegue.

---

## 5. Qué se rompe y qué hay que cambiar

### Cookies y sesión

- **Fase 1:** nada. La app sigue en el mismo host y la cookie no cambia.
- **Fase 2:** la cookie es del host `cliniq.2asoft.tech`; en `APP` no existe.
  **Cada usuario tendrá que iniciar sesión una vez.** Trasladar la sesión
  entre dominios (token de un solo uso en la redirección) es posible, pero
  agrega una superficie de ataque nueva sobre la sesión para ahorrar un login;
  no se recomienda.
- **No poner `Domain=.<dominio>`** en la cookie. Mandaría el refresh token a
  todos los subdominios, incluido el sitio público y cualquier herramienta de
  marketing que se monte en un subdominio (blog, páginas de anuncios). En
  `2asoft.tech` además se compartiría con aplicaciones que no son CliniQ.
- `Path=/` y `SameSite=Lax` sirven igual en el nuevo host.
- La suplantación no cambia mientras el console siga en el mismo host que la
  app. **No mover `/console` a un dominio propio**: el token de suplantación
  vive en la memoria de la pestaña y la vuelta a la sesión del superadmin
  depende de la cookie del mismo origen.
- Las preferencias en `localStorage` se pierden en la fase 2 (clínica activa
  del superadmin, vista de agenda, tema, tour). Molestia menor, sin datos
  clínicos.

### Redirecciones de login y registro

- Landing y registro: enlaces a `/login` pasan a `NEXT_PUBLIC_APP_URL + '/login'`.
- Logo del landing: de `/landing` a `/`.
- `verificar-clinica`: el botón "Volver a registrarte" (`/registro-clinica`)
  pasa a `NEXT_PUBLIC_SITIO_URL + '/registro-clinica'`.
- `AuthGuard`, `login?next=`, `console/login → /login`: relativos, no cambian.
- `/` en `APP` sigue llevando a `/dashboard`; en `SITIO` muestra el landing.

### URLs absolutas (correos, WhatsApp, QR, iframes)

| Origen del enlace | Fase 1 | Fase 2 |
|---|---|---|
| `FRONTEND_URL` (confirmar cita, verificar clínica, invitación, restablecer contraseña, avisos de suscripción) | Sin cambio | Cambiar a `https://APP`. Los enlaces ya enviados siguen sirviendo por la redirección del host viejo. |
| `window.location.origin` (autorregistro de pacientes, QR de firma móvil) | Sin cambio | Se arreglan solos: toman el host donde está el usuario. |
| Iframes de `/registro/<token>` en sitios de clínicas | Sin cambio | Dependen de la redirección del host viejo (un 301 dentro de un iframe funciona si el destino permite iframes, y `/registro/*` lo permite). Conviene avisar a las clínicas para que actualicen el código del iframe. |
| Plantillas de WhatsApp (Lyvio/Meta) | Sin cambio: el enlace es una variable completa, no un botón con dominio fijo | Igual |
| Documenso (firma) | Sin cambio: los enlaces son de `documenso.2asoft.tech` | Igual |
| Webhooks (Documenso, Wompi, Lyvio, n8n) | Sin cambio si apuntan a `api.cliniq.2asoft.tech` | Igual, **salvo** que alguno apunte a `cliniq.2asoft.tech/proxy/...`: revisarlo antes |
| Enlaces fuera del código (bio de Instagram, Google Business, anuncios, firmas de correo, videos promocionales, mensajes de ventas) | Cambiar a `SITIO` | — |

### SEO

- Hoy la raíz del dominio es un login y no hay `robots`/`sitemap`: separar
  arregla eso.
- `SITIO`: landing en `/`, `metadataBase`, canonical, Open Graph (imagen para
  compartir en WhatsApp/redes), `robots.txt` que permite todo, `sitemap.xml`,
  propiedad nueva en Google Search Console.
- `APP`: `X-Robots-Tag: noindex` en todo, y `robots.txt` con
  `Disallow: /`. Sobre todo las rutas con token (`/registro/`, `/confirmar/`,
  `/firma-movil/`, `/firmar-consentimiento/`).
- `/landing` en el host viejo → 301 a `SITIO/` para pasar lo poco que tenga
  indexado.
- Con dominio propio se puede activar HSTS con `includeSubDomains` (y
  *preload*) cuando todos los subdominios estén en HTTPS; en `2asoft.tech` no,
  porque hay subdominios ajenos a CliniQ.
- `www.SITIO` → 301 a `SITIO` (o al revés; elegir uno).

### Backend

| Variable | Fase 1 | Fase 2 |
|---|---|---|
| `FRONTEND_URL` | Sin cambio | `https://APP` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Agregar `https://SITIO` (no lo exige la API con JWT, pero mantiene la lista completa) | Agregar `https://APP` |
| `CORS_ALLOWED_ORIGINS` | Vacío (todo va por el proxy) | Vacío. Solo con la opción B y llamada directa: `https://SITIO`, sin credenciales |
| `DJANGO_ALLOWED_HOSTS` | Revisar el valor en Dokploy; por el proxy el `Host` que llega es el interno | Igual |
| `DEFAULT_FROM_EMAIL` (`noreply.2asoft.tech`) | Opcional: pasar a un correo del dominio propio (requiere SPF/DKIM/DMARC del dominio nuevo) | — |

---

## 6. Antes de empezar: cosas por revisar fuera del código

1. En el panel de **Wompi**: la URL de eventos (webhook) apunta a
   `api.cliniq.2asoft.tech/...` y no a `cliniq.2asoft.tech/proxy/...`.
2. En **Lyvio**: lo mismo para el webhook de la cuenta.
3. En **n8n**: buscar `cliniq.2asoft.tech` escrito a mano en los flujos
   (recordatorios, envío de documentos, firma).
4. En **Google Cloud**: los orígenes autorizados del cliente OAuth (solo
   importa en la fase 2).
5. Con **Lyvio**: que agreguen `https://APP` a los dominios permitidos del SDK
   de su app de Meta **antes** de la fase 2. Sin eso, conectar el número propio
   de WhatsApp deja de funcionar en la app.
6. **Documenso:** confirmar que el embebido no está limitado a un origen.
7. Cuántas clínicas pusieron el iframe de autorregistro en su sitio web (no se
   puede saber desde CliniQ; preguntar o revisar los registros con `Referer`).

---

## 7. Orden de migración sin cortar a las clínicas

### Fase 1 — sitio público en el dominio nuevo (la app no se mueve)

1. **DNS** (el dominio ya está comprado): registros A de `tucliniq.com` y
   `www.tucliniq.com` a la IP del servidor de Dokploy, en lugar de la del
   estacionamiento de Hostinger.
2. **Código del frontend — hecho el 2026-10-24, sin commit** (ver §10):
   - `src/middleware.ts` por host, **inactivo si no hay variables**. Pone
     `X-Robots-Tag: noindex` en la app y le responde un `robots.txt` que no
     deja indexar nada.
   - Enlaces absolutos en el landing, el registro y la verificación.
   - `robots.ts`/`sitemap.ts`, `metadataBase`, canonical y Open Graph.
3. **Desplegar ese código sin las variables nuevas.** Nadie nota nada.
4. **Dokploy:** agregar `tucliniq.com` y `www.tucliniq.com` como dominios del
   servicio del frontend (puerto 3000, HTTPS con Let's Encrypt). Probar que el
   certificado salga antes de anunciar nada.
5. **Activar:** agregar a `frontend/.env.production` (en la máquina que compila)

   ```
   NEXT_PUBLIC_SITIO_URL=https://tucliniq.com
   NEXT_PUBLIC_APP_URL=https://cliniq.2asoft.tech
   NEXT_PUBLIC_SITIO_ALIAS=www.tucliniq.com
   ```

   y reconstruir y desplegar con `build-and-push.ps1`. En el backend no hace
   falta nada: el registro no usa CSRF (es anónimo y con JWT). Si se quiere la
   lista completa, agregar `https://tucliniq.com` a
   `DJANGO_CSRF_TRUSTED_ORIGINS` en Dokploy.
6. **Probar el embudo completo en producción:** landing → registro → correo →
   verificar → crear contraseña → login → preparar clínica. Y que en la app
   `/landing` y `/registro-clinica` redirijan al sitio.
7. **Fuera del código:** Search Console, bio de Instagram, Google Business,
   anuncios, firmas, mensajes de ventas.

Si algo falla en los pasos 5–6, se quitan las variables y se reconstruye: el
middleware vuelve a quedar inactivo.

### Fase 2 (opcional) — la app a `app.<dominio>`

1. Requisitos del §6 resueltos (Lyvio/Meta, Google OAuth, webhooks, n8n).
2. DNS de `APP`; agregarlo como dominio del servicio del frontend en Dokploy.
   Durante unos días la app responde en los dos hosts (cada uno con su propia
   cookie) para probar `APP` con un usuario de prueba.
3. Avisar a las clínicas con un banner unos días antes: "a partir del día X
   CliniQ estará en `app.<dominio>`; tendrás que iniciar sesión de nuevo".
   Pedir a quienes tienen el iframe de autorregistro que actualicen el código.
4. Día del cambio, en horario de poco uso (noche o domingo):
   - Backend: `FRONTEND_URL=https://APP`, `DJANGO_CSRF_TRUSTED_ORIGINS` con
     `https://APP`. Push / redeploy.
   - Frontend: `NEXT_PUBLIC_APP_URL=https://APP`, reconstruir y desplegar.
   - `cliniq.2asoft.tech` → **301 a `https://APP` conservando ruta y query**
     (en el middleware o con una regla de Traefik en Dokploy).
5. **Mantener esa redirección para siempre.** Cuesta nada y cubre los iframes,
   los enlaces de confirmación de citas ya enviados, los QR impresos y los
   marcadores. Las invitaciones (72 h), restablecimientos (2 h) y
   verificaciones (24 h) vencen solos.
6. `api.cliniq.2asoft.tech` puede quedarse como está: el navegador no la usa.
   Renombrarla a `api.<dominio>` es otro cambio, con sus propios webhooks
   (Documenso, Wompi, Lyvio) por actualizar, y no aporta nada a esta separación.

---

## 8. Decisiones que tienes que tomar

1. **Los dominios.** ¿Dominio propio nuevo (por ejemplo `cliniq.co` o
   `cliniq.com.co`) o un subdominio de `2asoft.tech`? Recomendación: dominio
   propio para el sitio. Para vender, un dominio de marca pesa más que un
   subdominio de otra empresa, y permite HSTS con subdominios y correo propio.
2. **¿Fase 2 sí o no, y cuándo?** Recomendación: hacer la fase 1 ya y dejar la
   fase 2 para cuando haya un motivo (marca dentro de la app, correo del
   dominio) y Lyvio haya agregado el dominio en Meta.
3. **Opción A o B.** Recomendación: A.
4. **Qué pasa con `cliniq.2asoft.tech`.** Recomendación: en la fase 1 sigue
   siendo la app; en la fase 2 redirige para siempre.
5. **`www` o sin `www`** para el sitio público.
6. **¿El autorregistro de pacientes (`/registro/[token]`) se queda en la app?**
   Recomendación: sí. Moverlo al sitio obliga a cambiar cómo se arma el enlace
   y rompe los iframes actuales, a cambio de nada.
7. **¿Analítica o píxel de anuncios en el sitio público?** Si sí, solo en
   `SITIO`, con su propia CSP; nunca en la app.
8. **¿El correo remitente pasa al dominio nuevo?** Requiere configurar
   SPF/DKIM/DMARC; se puede hacer aparte.

---

## 9. Trabajo estimado (opción A, fase 1)

| Pieza | Dónde |
|---|---|
| `middleware.ts` por host, con `matcher` que excluya estáticos | `frontend/src/middleware.ts` (nuevo) |
| Enlaces absolutos | `LandingPageV3.tsx`, `Precios.tsx`, `registro-clinica/page.tsx`, `verificar-clinica/[token]/page.tsx` |
| `robots`, `sitemap`, metadatos por host | `frontend/src/app/robots.ts`, `sitemap.ts`, `landing/page.tsx`, `layout.tsx` |
| Cabeceras por host (`noindex`, CSP del sitio) | `frontend/next.config.ts` |
| Variables nuevas | `frontend/.env.production` (fuera del repo) |
| Dominio en Dokploy y DNS | Panel de Dokploy, registrador |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Entorno del backend en Dokploy |
| Limpieza opcional: borrar `components/marketing/LandingPage.tsx` (sin uso) | frontend |

Sin cambios de modelos ni migraciones; no toca el núcleo del backend.

---

## 10. Estado de la implementación (fase 1)

Hecho el 2026-10-24 en la rama `claude/objective-feistel-964dbe`, **sin commit**:

| Archivo | Qué hace |
|---|---|
| `frontend/src/lib/dominios.ts` | Lee `NEXT_PUBLIC_SITIO_URL`, `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITIO_ALIAS`; `urlApp()`, `urlSitio()`, `INICIO_SITIO`. Sin las dos URLs, `DOMINIOS_SEPARADOS` es falso y todo queda relativo. |
| `frontend/src/middleware.ts` | Reparte rutas por host (tabla del §3). En el sitio: `/` muestra el landing, `/landing` → `/`, `/registro-clinica` y los archivos estáticos se sirven, de la API solo `registro-clinica`, `csp-reporte` y `/api/version`; lo demás → 308 a la app. En la app: `/landing` y `/registro-clinica` → 308 al sitio, `noindex` y `robots.txt` cerrado. `www` → 308 al dominio principal. |
| `frontend/src/app/robots.ts`, `sitemap.ts` | robots y sitemap del sitio público. |
| `frontend/src/app/landing/page.tsx`, `registro-clinica/layout.tsx` | `metadataBase`, canonical y Open Graph cuando los dominios están separados. |
| `LandingPageV3.tsx`, `registro-clinica/page.tsx`, `verificar-clinica/[token]/page.tsx` | "Iniciar sesión" va a la app, "Volver al registro" va al sitio. Con dominios separados el landing ya no consulta la sesión (no tiene la cookie). |

Probado con `next dev` y hosts locales (`sitio.localhost`, `app.localhost`,
`www.sitio.localhost`): cada ruta de la tabla responde lo esperado. Sin
variables, `/` sigue llevando a `/dashboard`, `/landing` y `/registro-clinica`
responden 200 sin redirecciones y los enlaces quedan relativos (lo único
nuevo es un `robots.txt` que permite todo y un sitemap vacío). `tsc --noEmit`
pasa. No se probó el envío real del formulario de registro por el proxy del
sitio (el backend local no estaba arriba): el middleware deja pasar la
petición, pero hay que probar el alta completa en el paso 6 del §7.
