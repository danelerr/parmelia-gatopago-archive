# GatoPago Web V3

Next.js consumer: marketing, login, shell de cuenta y checkout público. Wallet
Core y Flow siguen siendo los propietarios del estado y la autorización.
Este candidato local todavía no crea Account V3 ni permite recibir/pagar.

## Comprobaciones

Desde la raíz del monorepo:

```powershell
pnpm check:v3:web
```

Incluye inventario de procedencia, hash de los iconos PWA, pruebas de auth/PWA,
compatibilidad de cliente, lint, tipos y build con descriptor de fuentes. No
sustituye el smoke de Firebase/Turnstile provisionados ni las pruebas monetarias.

## Autenticación local sin cuentas ni correos reales

En una terminal, desde `apps/web`:

```powershell
$env:FIREBASE_CLI_DISABLE_USAGE_REPORTING='true'
npx.cmd --yes --package firebase-tools@15.29.0 firebase emulators:start --only auth --project demo-gatopago-v3 --config firebase.emulator.json --non-interactive
```

En otra terminal, desde la raíz:

```powershell
$env:GATOPAGO_LOCAL_AUTH='1'
pnpm --filter @gatopago/web dev
```

- Abrir exactamente `http://localhost:3000/login`; `127.0.0.1`, otros puertos y
  dominios remotos no son orígenes equivalentes para esta configuración.
- Usar únicamente direcciones sintéticas terminadas en `@example.test`.
- El enlace aparece en la terminal del emulador; no se envía un correo.
- Google abre el formulario del emulador en `127.0.0.1:9099`, no Google real.
- En el mismo navegador, el enlace completa la sesión automáticamente. En otro
  navegador pide escribir el correo; nunca lo obtiene del query string.
- Entrar no crea passkeys, no ejecuta recovery y no escribe una smart account.
- Cerrar ambas terminales al terminar. No exportar/importar usuarios reales en
  este emulador ni reutilizar sus tokens en Workers remotos.

El modo local está prohibido en builds, `next start` y el ambiente production.
`GATOPAGO_LOCAL_AUTH=1` junto a `next build` debe fallar, no producir un release.
El valor público `fake-api-key` es el identificador literal que utiliza el
emulador para sus enlaces; no es una credencial de un proyecto Firebase real.

El CLI de Firebase se usa temporalmente para pruebas locales y no forma parte
de las dependencias desplegadas de Web. `pnpm audit` no cubre ese caché de npx.

## Configuración remota pendiente de E1/E3

La fuente canónica es `packages/environment/environments.json`. Mientras el
ambiente sea `unprovisioned`, la web presenta acceso no habilitado, sin intentar
reutilizar el proyecto Firebase ni las cuentas de versiones anteriores.

| Entrada | Procedencia | Naturaleza |
|---|---|---|
| `GATOPAGO_ENVIRONMENT` | `staging` o `production`, manifiesto aprobado | Configuración pública |
| `firebase_project_id` | Proyecto aislado aprobado en el manifiesto | Identificador público |
| `GATOPAGO_FIREBASE_WEB_API_KEY` | Configuración de la app Web del proyecto Firebase correspondiente | API key pública Firebase Web; no Admin |
| `GATOPAGO_FIREBASE_WEB_APP_ID` | Misma configuración Web de Firebase | Identificador público |
| `GATOPAGO_TURNSTILE_SITE_KEY` | Widget aprobado para el ambiente | Site key pública; no widget secret |

No se generó, recuperó ni cargó ninguno de esos valores remotos en este
incremento. No usar service accounts, secretos de Turnstile, private keys,
relayers ni paymasters en Web. Se rechazan configuraciones parciales o que
mezclen el emulador con recursos remotos.

### Contrato de identidad de Wallet Core V3

`POST /app/v1/auth/email-link/request`, con JSON
`{ email, locale: "es" | "en", turnstileToken }`, devuelve
`202 { sent: true, resendAfterSeconds: 60 }` sólo tras aceptación de Firebase;
no es prueba de recepción en la bandeja.
No acepta `continueUrl`, UID ni destinos proporcionados por el navegador.
El Worker debe conservar cuotas IP/correo/global, Siteverify de un solo uso,
action `email_login`, hostname exacto, respuestas acotadas y fallos cerrados.
La web no envía directamente por el SDK en modo remoto ni recurre a `/auth/*`
de V1/V2. La ruta está implementada en el [candidato aislado Wallet Core V3](../../server/v3/README.md),
con pruebas D1 locales; **no está desplegada ni habilitada**. El manifest real
sigue sin provisionar y el entrypoint falla cerrado. Las cuotas del Worker no
impiden por sí solas llamar directamente a la API pública de Firebase; revisar
controles del proyecto antes de abrir el ambiente.

Además falta verificar en el proyecto aislado: Google + Email Link habilitados,
dominios autorizados y callback OAuth. Los rewrites de Next son proxies
transparentes exclusivamente para `/__/auth/*` y `/__/firebase/*`, al proyecto
del manifiesto. No son redirects ni un BFF financiero. El helper iframe admite
sólo `SAMEORIGIN`; el resto de Web mantiene `DENY`.

Login/App/helpers tienen `no-store` y `no-referrer`. Los logs de acceso del
hosting deben redactar query strings de autenticación antes de usar correos
reales; la configuración de logging de Next sólo controla desarrollo. El
service worker V3 excluye helpers/API/Flight y no guarda documentos privados.
La CSP de documentos Next está implementada; la política efectiva del helper
Firebase proxied y la prueba del proxy/widget reales permanecen pendientes.

## PWA V3: instalación, recarga y offline

- Identidad nueva: manifest `/manifest.webmanifest`, `id=/app`, `start_url=/app`,
  `scope=/`. Los dos PNG son la cara original de Meli, copiada con hash revisado
  mediante `scripts/import-v3-pwa-assets.mjs`; no se importa el SW de V1/V2.
- La cabecera de login/App ofrece **Instalar app**. Si el navegador entrega
  `beforeinstallprompt`, el botón abre su prompt exclusivamente al pulsarlo.
  Si no, ofrece instrucciones para Safari/iOS, Android o escritorio. Se puede
  seguir usando el navegador sin instalar. Un prompt bloqueado tiene timeout de 30s.
- **Recargar** aparece al ejecutar en `display-mode: standalone` o con la señal
  standalone de iOS. No se infiere una instalación OS por `localStorage` ni por
  aceptar un prompt. Recarga sólo el documento actual y nunca otras pestañas.
- El guard browser-only bloquea ese control durante restauración de sesión o
  mutaciones Firebase. Las operaciones monetarias E3/E4 deberán tomar el mismo
  guard y reconsultar operaciones submitted por ID; esto aún no está implementado.
- `/sw.js` sólo se registra en builds de release en el origen canónico o en
  loopback para pruebas. No se registra en `next dev`, con emulador ni previews.
  El runtime captura eventos una vez por documento, no por remontaje React.
- No `skipWaiting`, `clients.claim`, recarga en `controllerchange`, background
  sync ni cola de operaciones. Una versión pendiente muestra instrucciones:
  terminar operaciones, cerrar **todas** las ventanas del origen y reabrir.
  Recargar una sola pestaña no se anuncia como activación de esa actualización.
- Cache API sólo almacena `/offline` y assets de rutas estáticas permitidas:
  hasta 40 assets de 512 KiB cada uno, además del HTML neutro de máximo 8 KiB.
  Se excluyen query strings, Authorization, rangos, respuestas privadas/no-store,
  Vary sensible, redirects y tipos inesperados. La persistencia es best-effort,
  fuera del camino de la respuesta de red; un fallo de caché no bloquea la web.
- Documentos se consultan con `no-store`; sólo un fallo de red/timeout usa el HTML
  offline. No se ocultan 401/404/500. API, OAuth/Firebase, Flight, prefetch y
  solicitudes no GET quedan fuera de la interceptación. No se cachean sesiones,
  quotes, recibos o capabilities. El documento offline no contiene scripts, datos
  de usuario, balances ni confirmaciones y tiene CSP propia.

Smoke local del SW, **sin** `GATOPAGO_LOCAL_AUTH`:

```powershell
pnpm check:v3:web
pnpm --filter @gatopago/web start
```

Abrir `http://localhost:3000/app`, dejar completar el registro y recargar una vez
para obtener control (no hay `claim`). En DevTools verificar Cache Storage y
probar offline/online. Para una actualización con dos ventanas, mantener ambas
abiertas mientras cambia el SW: debe quedar waiting, conservar los documentos
y activarse al cerrar ambas y reabrir. No simular un pago enviando dinero real.

Los 115 tests Web y el smoke Chromium del sexto incremento se detallan en el
[registro E0–E4](../../docs/operations/v3-e0-e4-implementation.md#sexto-incremento-pwa-next-y-actualizaciones-8-de-septiembre-de-2026).
El modo standalone del smoke usó una señal de navegador simulada, **no prueba
instalación nativa ni funcionamiento físico en iPhone/Android**. También faltan
Gate W integral, CSP/auth de proveedores reales y compatibilidad monetaria de releases API/contratos.

## Compatibilidad con Wallet Core

Las solicitudes remotas de correo llevan el ID inmutable de fuentes, versión
de API, ambiente y contexto de contrato explícitamente `none`. El Worker decide
si son compatibles. Un `409 CLIENT_UPDATE_REQUIRED` bloquea nuevas solicitudes
del mismo runtime y muestra actualización/reapertura de ventanas. No se envía
otro correo, no se intenta por Firebase directamente y no se recarga a la fuerza.
Cerrar sesión sigue siendo posible. El botón Recargar usa el guard de operaciones.

El ID se fija al compilar desde `shared/v3/web-release.json`; no se toma de la
respuesta del servidor para fingir que una PWA antigua es nueva. `build` verifica
el descriptor con `scripts/v3-web-release.mjs`; el procedimiento y el contrato
HTTP están en [Wallet Core](../../server/v3/README.md#compatibilidad-de-web-y-worker).
Cambiar las fuentes exige revisar/regenerar el descriptor y reconstruir ambos
artefactos. No constituye una firma de código ni una prueba de despliegue.

Los tests cubren transporte/código de rechazo, bloqueo de reintentos y guard.
El aviso completo con autenticación remota aún necesita prueba de navegador
con el proyecto de staging habilitado; no se habilitan fixtures en producción.
Esta integración no cierra compatibilidad monetaria ni Gate W.

## Evidencia, no promesa de producción

### CSP de documentos y límites de caché

Next genera un nonce aleatorio por respuesta y sobrescribe cualquier nonce/CSP
aportado por el visitante. El header enviado al renderer coincide con la CSP
de respuesta. No se eximen documentos por headers de prefetch/RSC. El nonce del
documento se conserva durante refresh interno; Turnstile lo recibe explícitamente.
En release no se permiten scripts inline sin nonce, `eval` ni handlers HTML.
Se permite CSS en atributos para la UI, no JavaScript. Los recursos estáticos,
SW y offline tienen sus propias políticas; una 404 desconocida es HTML inerte.

**Compromiso:** landing y páginas de cuenta pasan a SSR, con HTML `no-store`;
no se promete CDN/ISR de HTML ni mayor rendimiento sólo por usar Next. Los assets
versionados siguen cacheables. Medir coste/latencia antes de promover el origen.
Auth sólo permite sus endpoints necesarios; analytics/SDK wallet no se montan
en la landing. Los helpers Firebase conservan la política del proveedor, cuya
evidencia real sigue siendo gate: no se les agrega un nonce ajeno a su HTML.

En Chromium release local se comprobaron cinco rutas 200 con todos sus scripts
nonced, una 404 sin scripts y bloqueo de dos scripts insertados en HTML (sin nonce
y con nonce incorrecto), con control positivo nonced. `page.evaluate` por sí solo
no sirve para probar ese bloqueo: DevTools puede eludir CSP al insertar scripts.
Los 140 tests Web, build y límites están registrados en la evidencia E0–E4.

Identidad y WebAuthn locales usan ahora `http://localhost:3000`: Chromium rechaza
una IP como RP ID. El servidor HTTP y el transporte del emulador siguen ligados
a `127.0.0.1`; eso no obliga a usar una IP como origen del navegador. No se
admiten ambos orígenes indistintamente ni se relajan los orígenes de release.

## Adaptador de firma V3 (todavía sin pantalla financiera)

`src/wallet/passkeys.ts` solicita una assertion únicamente desde una acción
explícita, en top-level seguro y con activación de usuario. Exige UV y la llave
seleccionada; bloquea dobles prompts y recargas, cancela por señal/expiración y
libera la UI incluso si el navegador no resuelve su Promise. No crea, retira ni
actualiza llaves al entrar en una pantalla; no envía ni reintenta operaciones.

El codec compartido verifica RP/origin, challenge, flags y firma P-256, normaliza
DER/low-S con `@noble/curves` y produce los bytes aceptados por el verifier de
Solidity. La pantalla futura debe derivar el digest del documento V3 revisado,
comprobar la política vigente y cancelar al cambiar de cuenta/ruta. No llamar
a este helper con un hash arbitrario recibido de la API.

La biblioteca queda fuera de los imports de marketing y login. El smoke en
Chromium usa un harness local y un autenticador virtual; no es enrollment real,
prueba de iPhone/iCloud ni prueba de Account V3. Véase el noveno incremento del
[registro E0–E4](../../docs/operations/v3-e0-e4-implementation.md).

El 8 de septiembre de 2026 se probaron con Chromium y Firebase Auth Emulator:
Google, email link, autocompletado mismo navegador, confirmación en navegador
separado, enlace reutilizado rechazado, persistencia tras recarga y logout.
Son pruebas locales de identidad; no validan Google/iCloud reales, correo real,
un desafío Turnstile real, iPhone/Android físicos ni autoridad onchain.

Fuentes: [Firebase email links](https://firebase.google.com/docs/auth/web/email-link-auth),
[Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[proxy de autenticación](https://firebase.google.com/docs/auth/web/redirect-best-practices).
