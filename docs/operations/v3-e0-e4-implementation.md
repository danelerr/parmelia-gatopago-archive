# Implementación V3 — E0 a E4

**Alcance autorizado:** implementar E0–E4 de [V3 FUSION](../architecture/V3-FUSION.md).
Testnet con corte limpio; no se exige que las cuentas V1/V2 sigan funcionando.
No activar mainnet. Este registro no autoriza acciones remotas adicionales por sí mismo.

## Estado de entregas

| Entrega | Estado comprobado | Qué falta para cerrarla |
|---|---|---|
| E0 — Especificaciones ejecutables | En curso: primitives, schemas, diez autorizaciones, modelo, storage, procedencia Solidity, WebAuthn, quorum/enrollment y transiciones stateful de seguridad con firmas reales | Revisión del modelo, admisión de la composición Account/4337/upgrade, proof determinístico remoto, manifest de despliegue y threat review independiente; Gate A sigue abierto |
| E1 — Entornos | Configuración pública creada; ambos ambientes `unprovisioned`; inventario local de landing/App y cuatro capturas base | Matriz completa de rutas/destinos, recursos separados, proyectos Firebase, credenciales por rol, routing y preflight remoto |
| E2 — Next Web | Iniciada: landing ES/EN, identidad con emulador, PWA, compatibilidad de identidad y CSP de documentos verificadas localmente | Legales/docs, auth/CSP de proveedores reales, Consumer monetario, checkout, PWA física, compatibilidad monetaria, rutas/accesibilidad y Gate W |
| E3 — Wallet Core | Account V3 compuesto localmente: creación, seguridad, CALLs 4337/directos, ERC-1271, receivers, UUPS con quorum/demora/veto/freeze; factory comprueba ambas bibliotecas y consulta identidad tras upgrade; NO cierre de E3 | Presupuesto WebAuthn/políticas mayores, ERC-7562 completo, admisión independiente de artefactos/layout/manifests e integración de inspección, esquema financiero, proveedores, pantallas de seguridad/salida y tres testnets |
| E4 — Integración/corte | Integración parcial local; sin corte remoto | Completar App V3, recorridos humanos, corte de RP/dominio/PWA, retiro de runtimes anteriores |

## Código y comprobaciones disponibles

- [Primitives](../../shared/v3/primitives.ts): IDs de recurso distintos, cantidades
  uint256 como strings, red CAIP-2 y activos EVM. Representar otro ecosistema no
  implica habilitar su ejecución.
- [Schemas JSON](../../shared/v3/wire-schemas.json): forma estricta, sin coerción,
  propiedades extras ni defaults implícitos. Validadores precompilados para no
  ejecutar el generador de Ajv dentro de Workers. Ajv es dependencia de desarrollo.
- [Transferencias](../../shared/v3/transfer.ts): solicitud `exact|max`, consistencia
  de activo/red, rechazo de overflow y resolución de MAX en unidades enteras.
  Es una solicitud; no sustituye simulación, consentimiento o saldo observado.
- [Entornos](../../packages/environment/environments.json): RP/origins exactos,
  tres candidatas EVM de testnet y ninguna red habilitada. Firebase aún `null`;
  no se inventaron IDs de recursos remotos.
- [Validación/routing](../../packages/environment/index.ts): producción y staging
  distintos, testnet-only en E0–E4, propietario por colección y subruta. Este
  selector es un contrato local de routing, no evidencia de Workers Routes desplegadas.
- [Política](../../shared/v3/securityPolicy.ts): thresholds alcanzables, roles,
  descriptor/codehash, orden canónico, no contar la misma clave dos veces.
  Asistencia sólo como voto de recovery, nunca imprescindible para su threshold.
- [Política Solidity](../../contracts/src/v3/AccountV3Policy.sol),
  [firmas/quorum](../../contracts/src/v3/AccountV3Signatures.sol) y
  [enrolamiento](../../contracts/src/v3/AccountV3Enrollment.sol): validación de
  políticas, verifiers acotados y consentimientos reales. Son bibliotecas internas,
  sin instalación de signers, consumo de nonces, timelock ni ejecución de activos.
- [Seguridad stateful](../../contracts/src/v3/AccountV3Security.sol): usa esas
  bibliotecas con la política cargada del namespace V3. Implementa prepare/commit
  de política, recovery con espera, veto, expiración y freeze. Instala políticas
  y consume nonces, pero no inicializa una cuenta, ejecuta activos ni upgrades.
- [Autorizaciones](../../shared/v3/authorizations.ts) y
  [tipos Solidity](../../contracts/src/v3/AccountV3Types.sol): identidad y hashes
  de ejecución/admin/recovery/upgrade. La biblioteca Solidity no es una cuenta,
  no verifica firmas, no guarda estado y no concede autoridad.
- [Vectores públicos](../../shared/fixtures/v3-protocol.json): valores sintéticos,
  no keys operativas ni transacciones válidas para enviar. Se comparan entre
  TypeScript y Solidity; no demuestran despliegue determinístico real.
- [Modelo de autoridades](../../server/test/models/v3AuthorityModel.ts): inicialización,
  bootstrap, prepare/commit, recuperación, upgrade, veto, freeze, expiración y nonces.
  Vive exclusivamente en `test/`. Sus witnesses son hechos de firma ya verificada
  **asumidos por el modelo**, no firmas ni una API de autorización de producción.
- [Storage V3](../../contracts/src/v3/AccountV3Storage.sol): namespace ERC-7201 nuevo,
  separado de V1/V2. El [snapshot del compilador](../../shared/fixtures/v3-storage-layout.json)
  incluye slots, offsets, tipos anidados y orden del enum de propuestas.
  [El guard](../../scripts/v3-storage-layout.mjs) detecta alteraciones semánticas e
  ignora IDs de AST; su ejecución no aprueba por sí sola una migración/upgrade.

Comandos locales:

```sh
pnpm check:v3
pnpm --filter server exec tsc --noEmit
pnpm --filter server exec vitest run --config vitest.config.ts
```

`check:v3` comprueba schemas generados, vectores, storage, pruebas TS y Foundry V3.
Se agregó a la verificación local y CI. No sustituye `verify:all`, tests de
Worker runtime, smokes remotos, recepción/canje real de magic links ni WebAuthn humano.

### Evidencia del incremento inicial

- `pnpm check:v3`: 79 pruebas TS V3 y 8 Foundry V3; dos pruebas fuzz con
  256 ejecuciones cada una. Validadores standalone y vectores coinciden.
- Suite unitaria completa de App Worker: 49 archivos, 367 pruebas pasadas.
- TypeScript de Server (incluye shared y tests de environment): sin errores.
- ESLint dirigido a las cinco suites nuevas: sin advertencias.
- Knip: sin exports/dependencias muertos en el árbol comprobado.
- Diagramas: 29 SVGs verificados; `git diff --check` sin errores de whitespace
  en los cambios tracked, con avisos existentes de normalización LF/CRLF.

Estos conteos describen el incremento inicial, no un gate E0–E4 terminado.

### Segundo incremento local: autoridades y storage

- Verificación final del incremento: `pnpm check:v3` pasó con 112 pruebas TS
  V3 y 19 Foundry V3 (tres fuzz de 256 ejecuciones). La suite unitaria completa
  de App Worker pasó con 400 pruebas en 50 archivos; las 112 de V3 son un
  subconjunto, no pruebas adicionales a esas 400. TypeScript, ESLint dirigido,
  Knip y los 29 diagramas también pasaron. No se ejecutó `verify:all` ni E2E remoto.
- Diez formatos EIP-712 contrastados entre TypeScript y Solidity. Se verifica
  que cambiar cualquier campo o el dominio cambia el digest o rechaza el input.
- Modelo probado con cambios válidos y rechazos; exploración determinística de
  32 secuencias de 48 pasos, sin reducir escenarios cuando corre la suite completa.
- Snapshot derivado con Solc 0.8.34 del probe de storage. Hash actual:
  `0x1db59f278cb6ee7f51095e572dc040bf37f9c1e4e63143a9fe0e0eacac97f3b7`.
  El decimoquinto incremento compacta el namespace de 31 a 28 slots;
  los hashes de incrementos anteriores se conservan como evidencia histórica.
- `storageLayoutHash` en este perfil es SHA-256 del JSON compacto y ordenado del
  descriptor, **no** el runtime codehash. El código desplegado usa keccak256.
  Una edición del layout exige inspeccionar el diff y regenerar expresamente;
  nunca se rebasa automáticamente en el check de CI.
- Pruebas de storage comprueban namespace real, no colisión con el slot de
  implementación ERC-1967, separación de nonces y borrado de pending sin borrar
  política/freeze. Es un harness sin autorización, NO una cuenta desplegable.

### Procedencia Solidity y tercer incremento: Web

- [Guard de dependencias](../../scripts/verify-solidity-dependencies.mjs): compara
  546 archivos de fuente/configuración contra objetos Git de los commits fijados
  en `foundry.lock`, incluidos los tres submódulos revisados de OpenZeppelin.
  Se normalizaron CRLF a LF únicamente donde el resultado coincide exactamente
  con el blob upstream. No se actualizaron versiones Solidity ni lógica de librerías.
- [Manifest de contenido](../../contracts/dependency-integrity.json), SHA-256:
  `0x8b149e352d8319824d12f6c22413e7aeee17c5d00d778d19ccc0d2d445b389b2`.
  El check ordinario es offline; regenerarlo exige verificación contra upstream,
  no afirmar igualdad basándose sólo en el árbol local. No es una auditoría de la
  librería completa ni sustituye el attestation del futuro artefacto Account V3.
- Foundry sigue mostrando el HEAD padre porque `contracts/lib` carece de metadata
  Git propia. Esa advertencia ahora se complementa con evidencia de contenido real;
  no se suprimió para hacer pasar el build. Snapshot de storage sin cambios.
- [Inventario Web](./v3-web-source-inventory.json): 77 archivos de landing y 141
  de Consumer, hashes y cambios locales; cuatro capturas ES/EN a 1440×1000 y
  390×844 en `output/playwright/v3-landing-baseline/`. Las capturas permanecen
  como artefactos locales ignorados por Git; el inventario registra sus hashes.
  No se copiaron `.env`, documentos privados, credenciales ni directorios `.git`.
- [Importador acotado](../../scripts/import-v3-landing.mjs): verifica el hash de
  cada entrada antes del traslado, transforma markup Astro a JSX y nunca sobrescribe
  destinos existentes. Es una herramienta de migración, no dependencia del build.
- [Next Web](../../apps/web/package.json): Next 16.3.4, React 19.2.8, Node 24;
  marketing se prerenderiza y sólo las interacciones pequeñas usan Client Components.
  No monta Firebase, proveedores de wallet, llamadas financieras o el cliente Vite.
  [Meli](../../packages/brand/package.json) conserva los 14 sprites originales.
- Se conservó el diseño local y se adaptó el texto de acceso/recovery a V3.
  El candidato se identifica como no operativo; `/app` es un aviso temporal,
  **no** login ni wallet. `/pay/demo-cafe-norte` es un ejemplo explícitamente
  no cobrable, no una implementación del checkout de Flow. Legales y docs todavía
  no están portados: sus enlaces no satisfacen aún el gate de paridad de rutas.
- Interacciones nativas con limpieza de listeners/timers: menú móvil y Escape,
  modo siesta, selector del recorrido y diálogo de demostración. Se corrigieron
  el foco visible y el rol de los botones; el contenido SSR no se oculta si falla JS.
  Clipboard sólo muestra éxito si la escritura se resuelve; falta su prueba de fallo
  automatizada. No se presenta este smoke como auditoría de accesibilidad completa.
- `pnpm check:v3:web` verifica inventario, lint, tipos y build; agregado a CI.
  `pnpm check:v3` conserva 112 pruebas TS y 19 Foundry. Knip pasó. La build de
  Next prerenderiza `/`, `/en`, `/app` y el ejemplo; aún no hay service worker nuevo.
  También se repitió la suite unitaria completa de App Worker: 400 pruebas en
  50 archivos; las 112 de V3 están incluidas en ese total. Los 29 SVGs se validaron.
- La revisión de dependencias detectó Browserslist vulnerable mediante Babel/
  styled-jsx; fijado 4.28.8 para versiones anteriores a 4.28.7. Referencias:
  [aviso de memoria](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) y
  [aviso de custom stats](https://github.com/advisories/GHSA-73wf-gq98-2v4g).
  Ajv de desarrollo se actualizó a 8.18.0; los validadores generados son idénticos
  y no requirieron rebaseline. `pnpm audit` completo terminó sin avisos conocidos.
- Navegador Chromium local: ES/EN, menú móvil, Escape, siesta, ciclo y apertura/
  cierre de diálogo; consola sin errores/advertencias en las páginas observadas.
  Esto NO verifica iPhone real, passkeys, Firebase, balances o pagos.

No se ejecutó `verify:all`, no se publicó el candidato y no se retiró todavía
el cliente anterior. El estado de `/app` y auth de ese incremento es histórico;
el siguiente apartado registra su sustitución por el shell de sesión. E2 es
trabajo en curso, no Gate W aprobado.

## Cuarto incremento: identidad Web en Next, 8 de septiembre de 2026

- [Módulo auth](../../apps/web/src/auth/AuthScreen.tsx) nuevo, sin importar el
  cliente Vite: Google y magic links de Firebase, sesión, logout y mensajes
  ES/EN. SDK sólo se inicializa en el navegador en rutas de identidad/cuenta;
  marketing no monta Firebase. Ninguna de estas acciones registra llaves,
  inicia recovery, crea smart accounts ni obtiene autorización monetaria.
- Configuración pública derivada del manifiesto; ambientes no provisionados
  siguen deshabilitados. Sólo el modo development de staging permite un
  proyecto fijo `demo-gatopago-v3`, en loopback y con correos `@example.test`.
  La build con `GATOPAGO_LOCAL_AUTH=1` fue rechazada, exit 1 esperado.
- Enlaces con origen/proyecto/acción incorrectos o parámetros ambiguos se
  rechazan. Email nunca se toma de la URL; el hint local dura una hora y está
  ligado al proyecto. Mismo navegador completa automáticamente; en navegador
  separado se pide el correo sin enviar otro mensaje. Se retira el código de
  la barra de dirección y se usa navegación replace al completar.
- Mutaciones de identidad excluyentes, sin retries automáticos; Google
  cancelado no fuerza redirect. Popup bloqueado/PWA remota tienen estrategia
  de redirect prevista, aún pendiente de prueba real en iOS/proyecto aislado.
  Inicialización/operación lenta presentan error o recarga para revisar sesión;
  no afirman cancelar una operación que el SDK todavía tiene pendiente.
- Turnstile nuevo no acepta token vacío ni ignora expiración después de éxito;
  callbacks tardíos y desmontaje quedan cerrados. La guía Spin se aplicó al
  ciclo del token, sin ejecutar aprovisionamiento/lectura de secrets. Siteverify
  y cuotas pertenecen al Worker; no se trasladaron a Next. La prueba del
  widget real permanece pendiente, las pruebas del ciclo usan callbacks locales.
- `/login` y `/app` son dinámicos; auth/App/helpers llevan no-store/no-referrer.
  Proxy de Firebase derivado del proyecto, nunca redirect ni proxy general;
  sólo el helper admite iframe SAMEORIGIN. La comprobación del proxy remoto,
  CSP completo y redacción de logs en hosting siguen siendo gates abiertos.
- Se añadió export `default` del mismo validador ESM para el loader Node 24
  de next.config; no cambió el validador generado ni su contenido. Next dev
  generó dos archivos de instrucciones de agentes; se desactivó esa generación
  y se retiraron esos archivos generados, sin eliminar documentación del usuario.
- 49 pruebas Web: ambiente, parser, hint/TTL, contrato de envío, límites del SDK,
  concurrencia, cancelación y ciclo Turnstile. Incorporadas en `check:v3:web`.
  Se repitió `check:v3`: 112 TS + 19 Foundry, con procedencia/layout/vectores
  intactos. Knip y `pnpm audit` completo pasaron; cero avisos conocidos.
- Chromium + SDK Firebase 12.18.0 + Auth Emulator 15.29.0: Google sintético,
  solicitud de enlace, consumo, autologin en el mismo navegador, navegador
  separado con campo vacío, enlace usado rechazado, recarga con sesión y logout
  sin identidad visible al volver a `/app`. Un error de popup al reiniciar
  Next dev durante esa operación se distinguió de la prueba fresca, que pasó.
  El rechazo de un código usado produjo el HTTP 400 esperado, no un éxito falso.
- Capturas locales en `output/playwright/v3-auth-{session-mobile,login-mobile,used-link}.png`;
  viewport móvil 390×844 revisado. Son capturas con banners de emulador/dev,
  no evidencia de dispositivo iPhone, PWA instalada o producción.
- `check:v3:web` completo pasó con 49 pruebas, lint, tipos y build. En
  `next start` local sin emulador, `/login` y `/app` respondieron 200,
  no-store/no-referrer y DENY, sin identidad en HTML ni solicitudes no estáticas
  en el navegador observado. `/__/auth/iframe` respondió 404 esperado porque
  el ambiente sigue sin provisionar, con SAMEORIGIN/no-store; esto comprueba
  cabeceras, **no** el funcionamiento del proxy Firebase remoto.
- Regresión final del incremento: App Worker unitario 400/400 (incluye los
  112 de V3, no se suman dos veces), 29 diagramas SVG verificados. No se
  ejecutó `verify:all` ni el runtime completo de Workers en esta revisión.

**Límite de ese incremento:** el cliente remoto apuntaba a
`/app/v1/auth/email-link/request` sin implementación Worker. El quinto incremento
añade el candidato aislado descrito abajo, todavía sin desplegar. No se usa
`/auth/*` histórico como fallback.
La ruta `/app` ya contiene una sesión real del emulador, no una cuenta financiera.
El [runbook Web](../../apps/web/README.md) documenta configuración, origen de
valores públicos, pruebas locales y requisitos remotos pendientes.

## Quinto incremento: entrada Wallet Core V3, 8 de septiembre de 2026

Se revalidó el árbol actual después de la consulta arquitectónica (sin cambios
de implementación en aquella respuesta). Se implementó la frontera pendiente
entre Next y Wallet Core; no se redujo el objetivo E0–E4 a completar el login.

- [Entrypoint V3](../../server/src/v3/index.ts) independiente del router antiguo;
  no importa OTP, recovery, Admin SDK, contratos V1/V2 ni estado financiero.
- [Ruta](../../server/src/v3/auth/route.ts): manifest/origins exactos,
  validación estricta, Siteverify obligatorio incluso en testnet, envío Firebase
  de una sola vez con presupuestos/cancelación y sin destinos arbitrarios.
- [D1 de cuotas](../../server/v3/migrations/0001_auth_send_limits.sql): nueva
  migración local sin tablas históricas. HMAC de IP/correo, escritura atómica,
  cooldown, presupuestos globales y poda acotada. No se aplicó a D1 remota.
- [Runbook y configuración](../../server/v3/README.md): nombres y procedencia de
  bindings, placeholders sin valores, límites antiabuso y pasos pendientes.
  La API pública Firebase sigue necesitando sus propios controles; un Origin
  y las cuotas de este endpoint no bloquean todas las llamadas al proveedor.
- El manifest versionado sigue `unprovisioned`: el entrypoint real rechaza
  correos con 503 y liveness anuncia `ready:false`. Las pruebas positivas usan
  manifest sintético e interceptan proveedores; no son prueba de correo real.
- `check:v3:wallet-api` incorporado a CI: tipos generados, TypeScript, runtime
  D1 y bundle dry-run. No publica ni cambia el entrypoint del Worker anterior.

Evidencia comprobada: 55/55 pruebas V3 en workerd con D1 local, incluidos
timeouts reales de 3s/5s, cancelación, límites concurrentes y ausencia de rutas
legacy; `check:v3:wallet-api` exit 0 y bundle dry-run de 55,64 KiB / 9,27 KiB gzip.
Regresión: App Worker unitario 400/400, runtime anterior 29/29, TypeScript,
lint, Knip y guard de ownership. No se ejecutó `verify:all` en este incremento.
También pasaron 49/49 unitarias Web y `pnpm audit` sin vulnerabilidades conocidas.
El bundle no contiene las referencias legacy/privilegios monetarios buscados;
esta inspección puntual no sustituye el threat review ni una auditoría.
Wrangler avisa de secrets ausentes al leer la configuración local: esperado;
los proveedores y valores del test son sintéticos inyectados por Miniflare.
Se consultaron tipos publicados `@cloudflare/workers-types` 5.20260908.1 sin
actualizar las dependencias del proyecto. El workerd de pruebas conserva la
fecha compatible instalada, descrita en el runbook; no equivale al target remoto.

Siguen abiertos Gate A/B/W, PWA/CSP/legales, contratos Account V3, datos financieros,
salida independiente, entornos reales y recorridos humanos E4. No se tocaron
DNS, secrets reales, despliegues, Git remoto, bandejas ni fondos.

## Sexto incremento: PWA Next y actualizaciones, 8 de septiembre de 2026

Se continuó E2 después de la evaluación sobre Next; no se redefinió E0–E4 como
una entrega sólo de frontend. No se modificaron los Workers/contratos remotos,
DNS, credenciales, correos, fondos, ni el cliente Vite activo.

### Implementación local

- Manifest nuevo `/app`, PNG de Meli 192/512 con hashes verificados en CI,
  metadatos Apple y viewport. El icono representa sólo la cara de Meli.
- Botón de instalar con prompt nativo cuando está disponible y diálogo ES/EN
  accesible cuando no; timeout de 30s. En standalone cambia a recarga de la página.
- Runtime único por documento; guard de recarga/instalación durante restauración
  y operaciones Firebase. No se añadieron providers de wallets ni librerías PWA.
  Las pautas React se aplicaron para evitar listeners duplicados en remounts.
- SW sirve un offline neutro, autocontenido y con CSP; no guarda HTML privado,
  sesiones, capabilities, API, Flight ni datos monetarios. Los recursos públicos
  de rutas permitidas tienen límite de tamaño y cantidad; errores/quota de Cache
  API no impiden entregar una respuesta de red válida. Persistir no bloquea esa respuesta.
- Actualización natural: sin `skipWaiting`, `claim`, recarga entre ventanas ni
  reenvío de operaciones. Se informa que hay que cerrar todas las ventanas para
  aplicar una versión waiting. No se registra el SW en dev/emulador/previews.
- Se corrigieron también títulos de login/App en `?lang=en`, detectados durante
  la prueba de la ayuda de instalación en inglés.

### Evidencia de este incremento

- **115/115 unitarias Web**: se ejecuta el `public/sw.js` real en un harness de
  APIs browser. Casos: instalación inválida, stream que no termina, caché denegada,
  presupuesto, concurrencia de 55 assets, HTML privado, mutaciones/OAuth/Flight,
  errores HTTP, prompts, guard, remounts y lifecycle. Es un harness, no navegador.
- **Build local de release + Chromium real**, en `127.0.0.1:3000`: SW activated
  sin controlar forzosamente el documento inicial; tras una navegación, controller
  activo. Cache Storage observado con `/offline` y exclusivamente assets estáticos.
- Cabeceras reales: SW y manifest revalidados; `/app` private/no-store;
  `/offline` con el hash CSP de su CSS. CSP de toda Web permanece pendiente.
- Instalación fallback ES/EN abre un diálogo, devuelve el foco y cierra por
  Escape; viewport 390×844 sin overflow horizontal. Axe no encontró violaciones
  en el shell sin sesión ni en el diálogo de instalación en inglés; no es un
  audit de toda la aplicación ni validación de lector de pantalla físico.
- Offline → `/app` presentó sólo la pantalla neutra. Recuperar conexión y pulsar
  Volver devolvió el shell; POST sintético, helper OAuth y Flight offline fallaron,
  sin sustituirse por HTML ni encolarse por el SW. Tres errores de red de esa
  inyección deliberada se distinguieron de fallos del producto.
- **Actualización real con dos pestañas:** se cambió un comentario del SW local
  servido (sin sustituir su política), se solicitó `registration.update()` y ambas
  observaron waiting/banner conservando el mismo controller y `performance.timeOrigin`.
  Cerrar sólo una mantuvo waiting; cerrar las dos y reabrir dio activated, sin
  waiting ni banner. No se usó un mensaje que forzara activación.
- La rama **Recargar** se comprobó en Chromium con `navigator.standalone=true`
  inyectado como fixture; el click produjo navegación de tipo `reload`. Esta prueba
  NO demuestra instalación OS real ni Safari/iOS físico. La detección de modo
  standalone también tiene pruebas unitarias, sin flags persistidos de instalación.
- Capturas revisadas visualmente en `output/playwright/`: `v3-pwa-install-mobile.png`,
  `v3-pwa-offline-mobile.png`, `v3-pwa-update-waiting.png` y
  `v3-pwa-reload-standalone-fixture.png`. Son artefactos locales ignorados por Git.
- Regresión final: `pnpm check:v3:web` exit 0 (inventario, iconos, 115 tests,
  lint, tipos y build), Knip y ownership de backends exit 0; App Worker 400
  unitarias + 29 runtime aprobadas. El pretest de Foundry verificó contenido de
  546 fuentes vendorizadas; permanecen los avisos históricos de metadata Git de
  submódulos, no se corrigieron reescribiendo dependencias. La build final fue
  reiniciada localmente y confirmó los títulos EN de App/login y SW activo.
  `git diff --check` pasó para archivos tracked, con avisos LF/CRLF. Se cerraron
  las dos ventanas de prueba y el servidor local iniciado por este incremento.

**Pendientes que no cierra esta prueba:** instalación/lifecycle en dispositivos
físicos, cambio de usuario con datos reales, operación submitted tras actualización,
release mínimo API/contratos, CSP general, auth remota, Account V3/seguridad/salida,
E1 remoto y aceptación E4. Los gates A/B/W siguen abiertos. No se ejecutó
`verify:all` ni se afirma readiness de producción/mainnet.

## Séptimo incremento: compatibilidad de cliente, 8 de septiembre de 2026

La respuesta anterior sobre Next fue una evaluación sin implementación. Este
incremento continúa E0/E2, conservando el objetivo íntegro E0–E4.

- [Contrato compartido](../../shared/v3/clientRelease.ts): ID de cliente fijado
  al compilar, versión API, ambiente y contexto de contrato explícito. Allowlist
  exacta con expiración N/N-1, sin comparar versiones lexicográficamente ni
  aceptar automáticamente un número superior. Revocar todos los releases es
  posible; el mínimo público se calcula con las entradas aún vigentes.
- [Guard y política pública](../../server/src/v3/clientCompatibility.ts): GET
  no-store en `/app/v1/client-compatibility`; POST de identidad incompatible
  devuelve 409 antes de leer body, escribir cuotas o invocar proveedores.
  Preflight permite sólo Content-Type y las cinco cabeceras declaradas. Ausentes,
  duplicados, API/ambiente ajenos y perfiles mezclados se rechazan.
- Identidad declara generación/manifest `none`; el catálogo de perfiles de
  cuenta permanece vacío. El helper monetario falla cerrado, **pero no hay aún
  endpoints financieros V3 ni prueba de compatibilidad onchain**. Estos metadatos
  falsificables no sustituyen auth, firmas, nonces, codehashes o SecurityManifest.
- Web envía su propio ID; no consulta el ID del backend para fingir un cliente
  nuevo. Un rechazo impide repetir envíos en ese runtime, no usa SDK alternativo
  ni recarga automáticamente. UI ES/EN ofrece recargar/cerrar ventanas; logout
  sigue disponible y Recargar usa el guard de operaciones.
- [Descriptor de fuentes](../../shared/v3/web-release.json) y
  [comprobador](../../scripts/v3-web-release.mjs): SHA-256 de 90 inputs
  seleccionados, con normalización CRLF sólo en texto. Web y build local Worker
  se detienen si las fuentes/lockfile no coinciden. `--describe` sólo imprime el
  JSON para actualizarlo después de revisión. No se certifican hosting, secrets,
  instalación de dependencias ni reproducibilidad byte a byte de bundles.
- Se declaró la dependencia local Web → shared; instalación offline, sin nuevo
  proveedor o paquete externo. Las guías Workers motivaron el rechazo previo a
  I/O; React/Firebase conservaron carga aislada y los dos métodos de identidad.

### Evidencia local del séptimo incremento

- `pnpm check:v3:web`: **117 tests**, ESLint, TypeScript y Next build pasaron.
- `pnpm check:v3:wallet-api`: tipos generados vigentes, tsc de Server/runtime,
  **68 tests workerd/D1** y bundle dry-run pasaron. Proveedores de correo/desafío
  son mocks; D1 es local. Advertencia de secrets vacíos esperada en candidato.
- `pnpm test:v3:unit`: **130 tests** en 8 archivos. Incluye 11 de compatibilidad
  y 7 de procedencia con filesystem temporal: alteraciones de cada fuente,
  lockfile, nuevo archivo, binario e ID manual bloquean el build. CRLF textual
  y artefactos fuera de las raíces seleccionadas no cambian el descriptor.
- `pnpm --filter server test:unit`: **418 tests**. ESLint dirigido, Knip y
  `check:backend-boundaries` pasaron. Este último conserva el alcance de su
  guard histórico, no demuestra toda la arquitectura V3.
- Chromium con Next release local: landing → App → volver, diálogo de
  instalación a 390×844, Escape y captura visual inspeccionada. Consola sin
  errores/avisos. Artefacto ignorado: `output/playwright/v3-release-app-mobile.png`.
  Este smoke mantiene auth deshabilitada; **no prueba el aviso de incompatibilidad
  integrado con Firebase remoto ni una operación monetaria**.
- No se ejecutó `verify:all`, no cambió Solidity, no hubo commit/push/deploy,
  recursos remotos, nuevos secrets, DNS, bandejas reales ni fondos.

**Pendiente:** CSP general, legales/docs, integración auth remota y aviso de
actualización real, Account V3/recuperación/salida, perfiles y mutaciones de
contratos, recursos E1 y recorridos E4. Gates A/B/W siguen abiertos. La nueva
comprobación no convierte E2 ni el objetivo completo en terminados.

## Octavo incremento: CSP Next y verificación WebAuthn V3, 8 de septiembre de 2026

La revisión conceptual anterior no implementó código. Este incremento retoma
E0–E4: termina la comprobación local pendiente de CSP e implementa una pieza
criptográfica real de E3, sin sustituir el objetivo por una demo de identidad.

### Web

- Nonce aleatorio por respuesta, request/response CSP coherentes y rechazo de
  headers de nonce falsificados. No exención por prefetch/RSC. Root conserva el
  nonce inicial durante navegación/refresh interno y lo entrega a Turnstile.
- La 404 prerenderizada estándar tenía 9 scripts sin nonce. El catch-all actual
  devuelve una 404 bilingüe inerte (cero scripts), sin reflejar el URL del visitante.
- `pnpm check:v3:web` pasó con **140 tests**, ESLint, tipos y build. Chromium
  comprobó `/`, `/en`, `/app`, `/login`, `/pay/demo-cafe-norte`: 200, no-store,
  scripts 11/11/12/12/10, ninguno sin su nonce, sin errores JavaScript y sin
  requests a Firebase/analytics en este ambiente no provisionado. La 404 devuelve
  404 y cero scripts; el aviso de recurso 404 en consola no es una falla JavaScript.
- Prueba negativa sobre HTML interceptado sólo en el navegador de prueba:
  script con nonce correcto ejecutado; sin nonce y nonce falso bloqueados por
  `script-src-elem`. Un handler `onclick` también fue bloqueado por `script-src-attr`.
  La primera prueba con scripts añadidos desde DevTools no era válida para
  `script-src-elem`; se corrigió usando el parser HTML, sin modificar el servidor.
- Coste explícito: todo HTML del Document Next es SSR/no-store; assets siguen
  cacheándose por su política. No afirmar ahorro, SSG/ISR de landing ni mejora de
  latencia sin medir. Helpers Firebase conservan CSP upstream; proxy/widget real,
  Google/iCloud y PWA física siguen pendientes. No se cambió un proveedor remoto.

### Verificador de passkeys

- [AccountV3WebAuthnVerifier](../../contracts/src/v3/AccountV3WebAuthnVerifier.sol)
  extiende el verifier instalado de OpenZeppelin, sin copiar P256 ni WebAuthn.
  La implementación base omite RP/origin deliberadamente; V3 los liga mediante
  los primeros 64 bytes de su descriptor. No utiliza el verifier V2 de 64 bytes.
- `SHA256(rpId)|SHA256(origin)|qx|qy`; prefijo W3C limited verification, challenge
  exacto, crossOrigin=false, UP/UV y BE/BS. Límites de tamaños e índices antes de
  copiar datos o verificar criptografía; rechazo de inputs truncados/nested/overflow.
- **16 tests Foundry**, tres fuzz de 256 runs, incluyen P256 genuino por software
  sin simular un resultado válido; native 0x100 se simula ausente. Runtime de
  **6.982 bytes**. La presencia/corrección del precompile real no queda demostrada.
- Captura pública de `navigator.credentials.create/get` en Chromium con un
  autenticador virtual CTAP2 (no dispositivo físico):
  [vector](../../shared/fixtures/v3-webauthn-chromium.json). El contexto fue cerrado;
  no se extrajo clave privada ni se usó una cuenta/ceremonia del usuario.
  **3 tests Node/OpenSSL** verifican de forma independiente la firma DER original,
  RP/challenge/origin y relación de `s` original con su normalización low-S.
  Foundry valida esa misma assertion normalizada y rechaza su `s` alto original.
- La captura inicial con RP `127.0.0.1` fue rechazada por Chromium (invalid domain).
  `localhost` funcionó. La configuración del emulador de identidad en 127.0.0.1
  aún debe unificarse con un origen WebAuthn válido al conectar las ceremonias E3.
- `pnpm check:v3`: **133 TS + 35 Foundry**, schemas/vectores/storage y procedencia
  de **546 archivos Solidity/config** pasaron. Foundry conserva avisos del checkout
  de dependencias sin su metadata Git propia; el guard de contenidos sí comparó
  los bytes fijados. Lint dirigido del nuevo contrato/tests pasó sin advertencias.

**No cerrado:** este verifier no instala signers, consume nonces, decide quorum,
registra recuperación ni despliega una cuenta. Faltan encoder DER/low-S del cliente,
verificación de otros factores, Account/factory/proxy, manifest, revisión independiente,
staging y todos los recorridos financieros/soberanos E4. No se invoca `update_goal`
como complete. No hubo commits, deploys, cambios DNS/secrets ni movimientos de fondos.

Fuentes: [W3C limited verification](https://www.w3.org/TR/webauthn-3/#clientdatajson-verification),
[OpenZeppelin WebAuthn instalado](../../contracts/lib/openzeppelin-contracts/contracts/utils/cryptography/WebAuthn.sol),
[Next CSP](https://nextjs.org/docs/app/guides/content-security-policy).

## Noveno incremento: codec WebAuthn y ceremonia browser, 8 de septiembre de 2026

La evaluación anterior de Next fue una respuesta sin implementación. Este
incremento continúa el alcance E0–E4 completo, sin considerar terminada la
cuenta por haber completado un verificador o un login.

### Implementación

- [Codec compartido](../../shared/v3/webauthn.ts): perfil SPKI ES256 explícito,
  punto P-256 válido, scope/RP y challenge canónicos, UTF-8 exacto sin reserializar
  clientDataJSON, presencia/UV y BE/BS, límites y verificación criptográfica real.
  DER y normalización low-S usan `@noble/curves@1.9.7`, versión ya presente en
  el lockfile y ahora dependencia directa de shared. No se copió el parser V2
  ni se incorporó un proveedor de wallet o un servicio externo.
- [Vector ABI](../../shared/fixtures/v3-webauthn-encoding.json) generado a partir
  de la assertion Chromium pública, comparado con el codec mediante
  `node scripts/v3-webauthn-encoding.mjs` e incorporado a `check:v3`. Foundry
  entrega esos bytes exactos al verifier sin recodificarlos; acepta el digest
  correcto y rechaza uno distinto. No son keys operativas ni una transacción.
- [Ceremonia de firma](../../apps/web/src/wallet/passkeys.ts): requiere origen
  exacto, top-level seguro, activación de usuario, llave conocida y UV. Conserva
  un snapshot del desafío y descriptor revisados. Evita prompts simultáneos,
  admite cancelación y expira como máximo a los 60 segundos, aun si la Promise
  del navegador no termina. Mantiene el bloqueo de recarga sólo durante la
  ceremonia y lo libera en éxito/error/timeout. No llama a create, signal,
  recovery ni envío de pagos. No se importa en marketing o login.
- Identidad local y firma comparten `http://localhost:3000`; el emulador escucha
  en `127.0.0.1:9099`. No se agregaron excepciones a staging/production ni aliases
  equivalentes por IP. Se conservan Google y magic links.

### Evidencia ejecutada

- Codec: **62 pruebas**, incluyendo límites de orden P-256/DER, mutaciones,
  high-S capturado, 32 firmas efímeras Node/OpenSSL y bytes firmados adicionales.
- Browser adapter: **30 pruebas**, con API del navegador mockeada pero firma
  real; cubren gesto, SSR/iframe/origin, credential ID, cancelación tardía,
  doble prompt, expiración y desbloqueo de recarga. Web total: **170 pruebas**.
- `pnpm check:v3`: **195 pruebas TS + 36 Foundry V3**, fixtures/schemas/storage
  y procedencia de 546 fuentes/configs. Verifier: **17 pruebas**, incluida la
  comparación ABI. No demuestra el precompile de cada red ni revisa el quorum.
- `pnpm --filter server test`: **483 unitarias + 29 runtime**. Lint y tipos de
  Server/Web, Knip y lint dirigido Foundry pasaron. `git diff --check` sin errores
  de whitespace; persisten avisos LF/CRLF y de metadata Git de las dependencias
  Foundry hidratadas, con su contenido verificado por el guard de procedencia.
- Chromium real, CTAP2 virtual: create de credencial sintética sólo en el
  harness local, seguido por clic en el adaptador V3 compilado desde sus fuentes.
  La assertion se verificó y produjo **576 bytes ABI**. No se extrajo la clave
  privada ni se añadió una ruta de pruebas al frontend servido.
  Captura local: `output/playwright/v3-passkeys-browser.png`.
- Firebase Auth Emulator: solicitud/canje de magic link sintético desde
  `localhost`, llegada a `/app?lang=en`, persistencia al recargar y logout.
  Google emulado también completó popup → sesión de otro usuario sintético →
  logout en el mismo origen. No se contactó un proveedor Google real ni un inbox.
  La primera observación coincidió con Fast Refresh del descriptor y mostró
  petición de recarga; la comprobación fresca posterior pasó sin ese error.
  Un wait inicialmente esperaba `/app` sin query y agotó su timeout aunque
  la navegación había llegado correctamente a `/app?lang=en`; se comprobó
  después pathname, identidad y persistencia, sin volver a canjear el enlace.
- `pnpm check:v3:web` y `pnpm check:v3:wallet-api` pasaron: Next build, bindings,
  tipos, **68 runtime V3** y bundle local de Worker **60.64 KiB / 10.44 KiB gzip**.
  Ambos artefactos contienen `web-v3-ac894eb38cb6261351564c27b68abcc472a9107221eb6e4ca342b0ae472c3526`
  (99 inputs normalizados), comprobado leyendo el output, no sólo el descriptor.
  Worker se compiló con `--dry-run`, sin publicación ni provisioning.
- `pnpm audit --prod`: sin vulnerabilidades conocidas. Fronteras backend y
  29 SVG PlantUML validados. Se cerraron browser y servidores locales. Los
  artefactos del harness y logs de emulador permanecen ignorados por Git.

**Pendiente:** no hay Account V3 stateful, factory/proxy, quorum, enrollment,
recovery/salida ni pantalla financiera conectada al adaptador. El UI futuro
debe derivar el digest desde el documento revisado, verificar la política y
cancelar al cambiar de cuenta/ruta. El verificador onchain sigue siendo la
autoridad criptográfica; el codec cliente no sustituye nonces ni autorización.
Staging remoto, Gate A/B/W y la aceptación humana E4 siguen abiertos. No se
desplegó, publicó, movió dinero, cambió DNS ni creó/rotó secretos remotos.

Fuentes: [WebAuthn W3C](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion),
OpenZeppelin y noble instalados (se inspeccionaron sus APIs antes de integrar).

## Décimo incremento: políticas, quorum y enrolamiento criptográfico, 8 de septiembre de 2026

La evaluación anterior sobre Next no implementó cambios. Este incremento retoma
E0/E3 y conserva E0–E4 completo; no convierte pruebas de firmas en una Account lista.

### Implementación y decisiones

- `AccountV3Policy` reproduce las restricciones de TypeScript: 1–16 miembros,
  orden por signerId, no repetir la misma clave mediante otro verifier/RP/kind,
  roles y thresholds alcanzables, mínimo 72h/máximo 30 días para las esperas.
- `AccountV3Signatures` valida ECDSA low-S de 65 bytes mediante OpenZeppelin,
  WebAuthn mediante el verifier V3 y ERC-1271 directo. Se explicitó en TS/Solidity
  que ERC-1271 exige `verifier == address(key)` y codehash de la wallet; no existe
  adapter implícito. Los hashes/vectores de políticas E0 existentes no cambiaron.
- STATICCALL acotado a 1.000.000 gas y 4096 bytes por firma; sólo se copian 32
  bytes de retorno y se verifica el magic value con su padding ABI. La librería
  de OpenZeppelin aporta recuperación ECDSA/P256, pero SignatureChecker no ofrece
  ese límite de gas por verifier y su overload 7913 copia el retorno completo.
- Quorum sólo para política activa y un rol exacto; un índice repetido, firma
  adicional inválida, miembro de otro rol o threshold cero nunca autoriza. La
  ruta bootstrap es explícita y no habilita gasto. Asistencia tiene a lo sumo
  un voto recovery y el threshold puede alcanzarse sin ella; no posee spend/admin.
- `AccountV3Enrollment` verifica autoridad de la política anterior y posesión
  de cada descriptor nuevo o cambio de roles/asistencia, con `EnrollmentProof`
  específico. Compone el dominio desde chainId/address(this), la propuesta padre,
  política futura, nonce, versión y ventana. No permite usar firma de propuesta
  como prueba de enrolamiento ni reutilizar la prueba para recovery de otro propósito.

### Evidencia ejecutada

- `pnpm check:v3`: **197 TS + 75 Foundry V3**, schema/vectores/storage/tamper y
  los 546 archivos fijados de dependencias pasan. Las 39 pruebas nuevas se
  distribuyen en 28 policy/signatures y 11 enrollment, con siete fuzz tests
  nuevos a 256 casos. El vector TS de WebAuthn pasa por quorum con ECDSA real;
  bootstrap usa P256 real generado en test, no un verifier que retorna éxito fijo.
- Verificadores hostiles: revert, agotamiento de gas, retorno corto/vacío/padding
  incorrecto, intento de escritura, cambio de código, revocación sin cambiar el
  codehash y retorno de 64KiB. Los dobles hostiles no se presentan como verifiers
  de producción. Las pruebas reales usan claves sintéticas, nunca llaves operativas.
- `forge test --summary`: **268 passed, 0 failed, 4 skipped**. Los cuatro skips
  son forks históricos sin RPC; los invariants de routers históricos pasaron y
  no se atribuyen como prueba de invariants de una Account V3 aún inexistente.
- Web: **170 tests**, lint, types y build; Wallet Core V3: **68 runtime**, bindings,
  types y dry-run; Server: **485 unitarias + 29 runtime**. Knip, límites backend,
  lint Server, Forge lint/fmt dirigidos y `pnpm audit --prod` pasaron.
- Descriptor de fuentes actualizado por el cambio TS:
  `web-v3-fb215605b66edc299a5a35298a7cf819f426094733ca4cb62ee31607ce7d07c8`
  (99 inputs). Encontrado en el chunk Next y `server/v3/.wrangler/v3-build/index.js`.
  No se desplegó ninguno de los dos. `git diff --check` pasó con avisos LF/CRLF.
- Slither global conserva errores IR en tres métodos V2/OpenZeppelin, por lo
  que **no constituye una revisión completa**. Se ejecutó además Slither sobre
  `src/v3/AccountV3Enrollment.sol` con su árbol de imports y solc 0.8.34/via-IR/
  Cancun/optimizer 1.000.000: 11 contracts/101 detectors, sin error de parser,
  14 avisos, exit 0 con `--fail-high`. No se ocultaron detectores. Revisión local:
  nueve avisos de escalares inicializados por defecto a cero/false; retorno
  diagnóstico de ECDSA ignorado (sí se comprueba RecoverError); ventana timestamp
  intencionada y probada en ambos bordes; assembly acotado; pragmas de dependencias
  con compilador fijado; complejidad 15 del validador. Esto no sustituye Gate A.
  La herramienta instaló solc 0.8.34 en su caché; el `solc` global siguió en 0.8.36.

### Límites y siguiente paso

Un codehash no demuestra inmutabilidad detrás de un proxy ni independencia de
owners/dispositivos. Los límites de gas/firma son un perfil candidato, no soporte
universal ERC-1271; requieren medición con wallets reales y pruebas por chain.
El predicado puede repetirse mientras la firma sea válida: falta Account que
cargue la política desde storage, contraste identidad/predecessor/versión/scope,
consuma nonces y aplique prepare/commit/veto/expiry/timelock. No exponer un endpoint
de autoridad que acepte como vigente una política suministrada por el solicitante.
Siguen abiertos Account/factory/proxy, manifests determinísticos, recovery/exit,
staging y pruebas humanas E4. No hubo commit/push, deploy, DNS, secretos, correos,
migraciones remotas o fondos. El objetivo permanece activo.

Referencias contrastadas: [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271),
[ERC-7913](https://eips.ethereum.org/EIPS/eip-7913) y fuentes OpenZeppelin fijadas.

## Undécimo incremento: transiciones de seguridad con estado, 8 de septiembre de 2026

El incremento anterior contenía predicados criptográficos. Ahora
`AccountV3Security` los integra con el namespace `AccountV3Storage` real:

- Prepare valida identidad, generación, versión, predecessor, ventana, scope
  positivo/ordenado/único de hasta 32 chains que incluye la actual, nonce y
  consentimiento de la política **vigente**, más posesión de miembros nuevos o
  modificados. Consume el nonce admin/recovery; la política activa no cambia.
- Commit requiere otra autorización admin vigente y nonce fresco, además del
  proposal hash, scope y compromiso de acknowledgements. Bootstrap usa su
  passkey original para promoción y commit separados; no habilita gasto antes.
- Sólo commit/activación instalan la política pendiente, avanzan una versión,
  encadenan el manifest y limpian los arrays/payloads de la propuesta. No cambian
  la identidad, los nonces consumidos ni un freeze previo.
- Recovery desplaza una propuesta admin, pero no otra recovery. Su espera usa
  el delay **anterior**, contado desde aceptación; backdating o acortar el delay
  de la política nueva no reduce la espera. Cualquier relayer puede activar
  después de `readyAt` y antes de `validUntil`.
- Veto sólo admite signers/guardians vigentes y su nonce propio persistente.
  Un miembro nuevo pendiente o retirado no puede vetar. Expiración es pública,
  no instala nada ni rehabilita firmas consumidas.
- Freeze es irreversible; no reinicia recovery ni altera su espera. La prueba
  que cancela una propuesta Upgrade usa un fixture explícito: **no demuestra
  propuesta ni ejecución UUPS**, todavía pendientes.
- `requireSpendEnabled` bloquea bootstrap y recovery pendiente, incluso una
  recovery vencida hasta su limpieza explícita. Es un guard necesario, **no una
  autorización de gasto**. La ejecución futura debe verificar firmas/nonce,
  límites, EntryPoint y mantener `executing` durante todo el batch.

OpenZeppelin sigue siendo la implementación de criptografía y downcasts
comprobados (`SafeCast`). Se inspeccionaron TimelockController, Nonces y
NoncesKeyed: sus roles/llamadas arbitrarias y almacenamiento por address no son
el protocolo firmado de política/guardian con contadores uint256 por propósito
y signer IDs bytes32. No se copió código de esas dependencias ni se agregaron
slots o paquetes. El hash del layout sigue siendo
`0x13c0d86a1b5923422b4a13f9a1b40d1a2a202445ead723a0b8d01a90b45fcb77`.

### Evidencia de este incremento

- `pnpm check:v3`: **197 pruebas TypeScript y 103 Foundry V3**, exit 0.
  Schemas, vectores, ABI WebAuthn, storage/tamper y los 546 archivos de
  dependencias fijados pasan. No cambió el compromiso de storage ni Web release.
- `AccountV3SecurityTest`: **25 pruebas**, cuatro fuzz con 256 casos cada una.
  Incluyen promoción/commit con WebAuthn P256 software real, revocación de una
  wallet ERC-1271 entre prepare y commit sin cambiar su codehash, rechazo por
  dominio/cuenta, nonce/versión agotados, overflow temporal y rollback de estado.
- `AccountV3SecurityInvariantTest`: **dos invariantes**, 128 secuencias de 64
  llamadas por invariante (**8.192 llamadas cada una**, sin reverts inesperados),
  más un recorrido determinístico que obliga a ejercer todas las transiciones
  exitosas del handler. Las ramas no aplicables pueden omitir acciones; el
  contador de llamadas no equivale a transiciones aceptadas. Los ghosts cuentan
  sólo acciones aceptadas y se comparan con nonces, versión, manifest y freeze.
- El harness de invariantes no tiene setters de estado. Las firmas ECDSA son
  reales sobre claves sintéticas; el fuzzer combina prepare/commit/recovery,
  avance temporal, veto, expiración, freeze y solicitudes corruptas. El token
  ERC-20 de prueba, ETH y slot ERC-1967 permanecen intactos. Esto prueba los
  límites de la biblioteca, no la seguridad de un ejecutor todavía inexistente.
- Slither aislado sobre `src/v3/AccountV3Security.sol`, solc 0.8.34/via-IR/Cancun:
  **13 contratos/dependencias, 101 detectores, 23 observaciones**, exit 0 con
  `--fail-high`, sin error de parseo IR. Revisión de observaciones: 12 locales
  usan inicialización cero/false de Solidity; un retorno es sólo `errArg` de
  ECDSA (sí se comprueba `RecoverError`); cinco alertas de timestamps son las
  ventanas/esperas deliberadas; dos de assembly son namespace/STATICCALL acotado;
  una de pragmas mixtas usa compilador fijado; dos de complejidad señalan
  `Policy.validate` y `Security.prepare`. No equivale a auditoría independiente
  ni análisis completo de Account V3.
- Suite Foundry general: **296 pasaron, cero fallaron, cuatro fork smokes
  omitidos** por RPC local no configurado. Incluye contratos históricos como
  control de regresión, no como compatibilidad exigida a V3.
- `forge build --sizes`, lint dirigido con `--severity high med low --deny
  warnings` y formato: pasan. El harness de seguridad mide **18.523 bytes** de
  runtime, el de bordes **19.600 bytes**. Incluyen getters/fixtures y NO predicen
  el tamaño final de Account; los 57 bytes del artefacto de biblioteca no
  representan el código interno que se integra al consumidor. Account completo
  debe volver a medirse contra EIP-170 antes de fijar bytecode/determinismo.
- `git diff --check` pasa (avisos LF/CRLF), 29 SVG PlantUML verificados y el
  descriptor Web continúa siendo
  `web-v3-fb215605b66edc299a5a35298a7cf819f426094733ca4cb62ee31607ce7d07c8`
  sobre 99 inputs. No se reconstruyeron/desplegaron frontends por cambios sólo
  de Solidity/docs. No se ejecutó `verify:all` ni aceptación humana en este incremento.

Los harnesses viven sólo en `contracts/test/`: su constructor siembra una
política para probar transiciones, no es inicialización autenticada por factory
ni un despliegue Account/4337. El harness de bordes permite corrupción explícita
sólo para tests unitarios; no es objetivo del fuzzer. `acknowledgementsHash` sigue
siendo compromiso firmado, no prueba de finality remota.

**Pendiente:** inicialización/factory/proxy y determinismo real, spend/4337,
upgrade seguro, integración con Wallet Core/Next, aceptación física de passkeys,
staging y corte E4. Gate A permanece abierto. No hubo commit/push, despliegues,
DNS, secretos, correos, fondos ni borrado de cuentas. No se modificó el frontend
en este incremento ni se activó un runtime V3.

## Duodécimo incremento: creación autenticada y proxy real, 8 de septiembre de 2026

La respuesta anterior sobre Next fue una evaluación sin cambios. Este incremento
retoma E0/E3; no modifica Web, contratos anteriores ni recursos remotos.

### Código y alcance probado

- `AccountV3Proxy` extiende **ERC1967Proxy de OpenZeppelin**. Su constructor sólo
  recibe la implementación fija: no introduce signers, proofs ni ventanas en el
  initcode. El override de `_unsafeAllowUninitialized` existe exclusivamente para
  que la factory despliegue e inicialice atómicamente. Un proxy desplegado por
  otra vía no constituye una cuenta incorporada a GatoPago.
- `AccountFactoryV3` fija implementación, EntryPoint, senderCreator y sus hashes
  observados en construcción. Sólo senderCreator puede llamar `createAccount`.
  No hay owner, registry mutable, proveedor de wallets ni fallback V1/V2.
- `AccountV3Initializable` usa **Initializable de OpenZeppelin**, deshabilita la
  implementación y exige contexto de proxy, implementación, runtime y dirección
  CREATE2 correctos. La firma liga además factory y EntryPoint. Así se evita una
  dependencia circular entre direcciones inmutables factory/implementación.
- `AccountV3Initialization` valida identidad, política, scope ordenado/acotado,
  ventana semiabierta y posesión de **todos** los signers iniciales. Verifica el
  `InitializationApproval` existente, separado de UserOp, con dominio chain/cuenta.
  No bastan el threshold spend, una sesión Firebase ni declaraciones del backend.
- Una falla revierte también CREATE2 y el flag Initializable. La cuenta puede
  recibir activos antes de desplegarse; las pruebas conservan ETH/ERC20 tanto
  después de un rechazo como después de una creación válida. **No prueban el
  primer gasto**, porque todavía no hay executor.
- `creationIdentity` expone generación/ID/commitment/salt iniciales, no la política
  vigente. Una consulta de creación repetida no reinstala llaves, reinicia nonces,
  deshace recovery ni retira freeze. Para cuentas existentes no se exige renovar
  una autorización inicial vencida: esa rama no adquiere autoridad ni escribe.
- El selector `proxyImplementation()` es no delegado y debe quedar reservado en
  Account. Este candidato sólo acepta la implementación inicial en `createAccount`;
  `getAddress` sigue calculando la dirección independientemente de upgrades. La
  semántica de consulta tras un upgrade admitido aún debe cerrarse con UUPS.

`V3InitializedSecurityHarness` compone inicialización y transiciones de seguridad
sin constructor que precargue políticas ni setters de storage. Se reutiliza el
handler de invariantes anterior contra este proxy real y se conserva además su
suite aislada. `V3CreationEntryPoint`/`V3CreationSender` son **fixtures de caller**,
no implementaciones ERC-4337 ni evidencia de aceptación por un bundler.

### Verificación dirigida

- `AccountV3CreationTest`: **24 pruebas**, seis fuzz de 256 casos, sin omitidas.
  Incluyen suplantación de identity/policy/factory/EntryPoint, scope inválido,
  posesión faltante/duplicada, doble init, ventanas, rollback y prefunding, cambios
  de código, recuperación/rotación y bootstrap con criptografía WebAuthn real.
- `AccountV3CreationInvariantTest`: **dos invariantes**, 128 runs × 64 llamadas
  (8.192 por invariante), más una secuencia dirigida que fuerza rotación, recovery,
  veto, expiry y freeze. Conserva identidad, proxy/implementación, fondos y nonces
  aun al volver a consultar la factory. Ramas no aplicables del handler son no-op;
  el número de llamadas no equivale al de transiciones aceptadas.
- El ensayo de dos chain IDs usa snapshot/revert local y **CREATE2 real**, no
  `vm.etch` para simular despliegues. Las firmas de la primera chain se rechazan
  en la segunda y las direcciones/runtime coinciden al firmar correctamente.
  **No demuestra los tres despliegues remotos de Gate B.** `vm.etch`/`vm.store`
  se usan solamente en pruebas separadas de corrupción deliberada.
- Lint dirigido con `--deny warnings` pasó. Slither aislado, solc 0.8.34 vía IR:
  inicialización 15 observaciones; factory 16, ambas `--fail-high` exit 0. Incluyen
  defaults locales cero, retorno auxiliar ECDSA ignorado (sí se comprueba el error),
  timestamp, assembly acotado, pragmas y complejidad; factory añade evento después
  de initialize. La factory no tiene estado de autoridad mutable, restringe caller
  y sus verificadores usan STATICCALL. No es auditoría independiente ni cero hallazgos.
- `forge test --force --match-contract AccountV3 --summary`: **130 pruebas, nueve
  suites**, sin fallos ni omitidas. `pnpm check:v3` repetido después: **197 TypeScript
  + 130 Foundry**, exit 0; schemas, vectores, 546 archivos de dependencias y layout
  conservan sus checks. La primera ejecución incremental había contado sólo 106:
  el artefacto de `AccountV3CreationTest` tenía ABI pero bytecode vacío después de
  las herramientas parciales. Se descartó como evidencia completa y se recompiló
  con `--force`. No ejecutar builds/inspect/lint simultáneos sobre el mismo cache;
  comprobar descubrimiento de suites y reconstruir ante artefactos parciales.
- El guard Web mantiene `web-v3-fb215605b66edc299a5a35298a7cf819f426094733ca4cb62ee31607ce7d07c8`
  (99 inputs). No se cambiaron sus fuentes, runtime, despliegues ni configuración.
- `forge test --summary` completo terminó exit 0: **323 pruebas pasan**, cero
  fallos y cuatro fork smokes omitidos por falta de RPC (uno Arbitrum Sepolia y
  tres UniversalCheckout). Esto incluye regresión V2, no certificación V3 ni
  aceptación física. `docs:architecture:check` verificó 29 SVG y `git diff --check`
  pasó con los avisos LF→CRLF ya presentes. No se ejecutó `verify:all` ni pruebas
  remotas en este incremento.

### Hallazgos que cambian el siguiente incremento

1. **Tamaño:** `forge build --sizes` mide factory 8.807 B, proxy 285 B y harness
   integrado **24.361 B**, sólo **215 B** bajo EIP-170. Todavía faltan spend/4337 y
   upgrades. Se debe redistribuir/reducir el código sin debilitar autorización ni
   introducir un ejecutor arbitrario; no asumir que cabe el Account final.
2. **Validación ERC-7562:** el candidato comprueba `block.timestamp` dentro de la
   creación y compara codehash de EntryPoint en ese frame. Eso no cumple el perfil
   canónico: OP-011 bloquea TIMESTAMP y OP-051–054 restringen acceso a EntryPoint.
   Hay que integrar la ventana firmada con `validationData` del EntryPoint real,
   preservar expiración y no declarar autorización fuera de plazo. También probar
   storage de ERC-1271, gas y opcodes mediante trazas de bundler. No se sustituye
   este gate por un relay privado que omita la validación.
3. **Storage:** no se modificó el namespace V3 ni sus encodings. OZ Initializable
   añade su namespace propio, comprobado sin colisión en el proxy. El guard actual
   del layout sólo cubre V3: el manifest/upgrade final debe incluir todas las
   namespaces, slots ERC-1967 y selectores reservados de la composición definitiva.
4. Falta Account completo, upgrade/freeze integrado al ejecutor, manifiestos de
   artefactos, revisión independiente Gate A, proveedores/redes reales, salida
   portable, integración Consumer y corte E4. No se habilitó ninguna red.

Referencias comprobadas: [ERC-4337: factory y creación](https://eips.ethereum.org/EIPS/eip-4337#factory-contracts),
[CREATE2](https://eips.ethereum.org/EIPS/eip-1014) y
[ERC-7562: reglas de validación](https://eips.ethereum.org/EIPS/eip-7562#opcode-rules).
Se importaron las piezas de OpenZeppelin instaladas; no se copiaron proxy,
Initializable, CREATE2 ni criptografía de la biblioteca.

## Contrato de encoding E0, revisión 2

Los nombres, orden y tipos exactos están en el código y en vectores. No cambiar
un encoding y regenerar fixtures para hacer pasar CI sin revisar su significado.
El generador de vectores sólo escribe con `--write`; por defecto compara.

1. **Identidad EVM:** `keccak256(abi.encode(IDENTITY_TYPEHASH, uint32(3),
   initialSecurityCommitment, userSaltCommitment))`. El primer compromiso es
   `hashSecurityPolicy(initialPolicy)`; el salt proviene de entropía cliente,
   no de Firebase, email, username o una red principal. CREATE2 usa `accountId`
   como salt y el hash de init code constante del proxy. Los valores de factory
   e init code del fixture son sintéticos; falta fijar los reales.
2. **Política:** miembros ordenados por `signerId`, límite 16 y votos unitarios.
   `signerId` compromete kind/verifier/codehash/key; el hash de miembro añade
   roles y asistencia. El hash de política compromete el conjunto, modo,
   thresholds y esperas. Roles: spend=1, admin=2, recovery=4.
3. **Formatos de clave:** ECDSA y ERC-1271 usan address de 20 bytes. ECDSA directo
   tiene verifier/codehash cero. Los verifiers de contrato están fijados por
   dirección y codehash. El perfil WebAuthn V3 reserva 128 bytes para
   `SHA256(rpId) | SHA256(origin) | qx | qy`; requiere verifier V3, NO reutilizar el
   verifier V2 de 64 bytes. Assertion/encoder/quorum/enrollment stateless ya tienen
   candidatos; quedan revisión independiente e integración stateful Account.
4. **Independencia:** el mismo public key no cuenta dos veces por usar otro RP
   o verifier. Esto no demuestra que dos claves diferentes vivan en dispositivos
   independientes. Provenance, proof of possession y la salida real se prueban
   aparte. `sovereign_ready` no se obtiene de esta función de validación.
5. **Bootstrap:** una passkey, spend threshold 1, admin/recovery thresholds 0.
   Esos ceros significan autoridad deshabilitada, NUNCA aprobación sin firmas.
   No se puede usar la política bootstrap como política active. El modelo E0
   fija recibir/promover únicamente: spend, recovery y upgrade están bloqueados
   hasta la promoción; no inferir autorización sólo del threshold spend.
6. **Active:** spend al menos 1; admin y recovery al menos 2. Recovery puede
   alcanzarse sin el voto asistido. Pruebas de posesión implementadas como predicado;
   transiciones pendientes: una política válida y firmada no se instala por sí sola.
7. **Tiempo:** recovery y upgrade mínimos de 72 horas, máximos configurables
   de 30 días en este perfil. Se resolvió 48h vs 72h a favor de la Parte III de
   V3 FUSION. El contrato futuro calcula la espera desde la propuesta aceptada;
   una firma vieja o `validAfter` pasado no permite saltarla.
8. **Scope:** `keccak256(abi.encode(uint256[]))`, entre 1 y 32 chain IDs positivos,
   únicos y ordenados. V3 usa firmas por chain: el scope no elimina chainId de
   EIP-712. Mensajes deliberadamente portables entre chains siguen fuera del release.
9. **Calls:** `keccak256(abi.encode(Call[]))`, orden preservado, entre 1 y 32 calls;
   tuple `(address target,uint256 value,bytes data)`. Sólo CALL y lote atómico.
10. **Domain:** `GatoPago Account`, versión `3`, chainId y verifyingContract.
    `ExecutionPlan` compromete EntryPoint, UserOp hash, batch, límites de activos,
    política de fees, paymaster, preview, securityVersion, nonce y validez.
    No equivale a que el preview sea un display confiable ni que esos límites
    estén ya aplicados onchain.
11. **Autoridades:** `SecurityChange` y `RecoveryProposal` tienen payload
    similar, pero distinto typehash y deben usar nonces/thresholds distintos.
    `securityVersion` refiere a la versión vigente esperada; activar el cambio
    debe incrementar exactamente una versión y verificar predecessor.
12. **Upgrade:** compromete implementación, runtime codehash, storage layout,
    scope y hash de calldata de migración. Recovery no ejecuta esta transición.
    El storage-layout hash declara un compromiso verificable en CI; no permite
    que un contrato infiera automáticamente compatibilidad de storage.
13. **Inicialización:** `InitializationApproval` vincula identidad, compromisos,
    factory, EntryPoint, scope, nonce cero y ventana, con dominio por chain y
    dirección contrafactual. Se firma antes de construir initCode/UserOperation;
    no incluye el UserOp hash, para evitar el ciclo proof → initCode → hash → proof.
    La ejecución posterior tendrá su autorización distinta. La factory real
    todavía debe implementar atomicidad, caller `senderCreator` y one-time init.
14. **Enrolamiento:** `EnrollmentProof` vincula signerId, política futura y digest
    completo de la propuesta (`contextHash`), además de identidad, versión, nonce
    y ventana. Se exige para nuevos descriptors y cambios de roles/asistencia.
    Su replay queda ligado al consumo del nonce/versión de la propuesta padre.
15. **Bootstrap:** `BootstrapActivation` tiene el payload de cambio de seguridad,
    pero propósito distinto. Prepare requiere la passkey vigente y posesión de
    los factores nuevos/modificados; no usa un threshold admin cero. Commit
    requiere consentimiento fresco de la passkey sobre la propuesta preparada.
16. **Commit:** `CommitProposal` vincula proposalHash y acknowledgementsHash,
    predecessor, scope, nonce admin, versión y validez. Los cambios planificados
    no se aplican en prepare. El hash de acknowledgements es un compromiso firmado
    por los usuarios: no demuestra finality remota por sí mismo. Falta implementar
    el formato de esas observaciones y su comprobación independiente antes de firmar.
17. **Veto:** `VetoProposal` vincula propuesta y signer vigente; nonces por signer
    separados de spend/admin/recovery. Basta un miembro vigente, incluso guardian.
    Una llave propuesta o retirada no obtiene veto por conocer el ID del intento.
18. **Freeze:** `FreezeUpgrades` usa quorum y nonce admin, es irreversible y
    cancela upgrade pendiente. No se borra al recuperar ni al limpiar pending.
    Sigue disponible durante recovery sin reiniciar su espera.
19. **Manifest común:** `SecurityManifest` contiene identidad, generación, versión,
    predecessor, policyHash y scope. Firmas, nonces y receipts son envelopes por
    chain, fuera de este hash común. Esto permite convergencia cuando una chain
    consumió más nonces por cancelaciones; no implica atomicidad multichain.

### Reglas ejecutables y límites del modelo

- Una sola propuesta de seguridad pendiente por instancia. Recovery con quorum
  puede reemplazar una propuesta admin; un admin no reemplaza recovery pendiente.
- Los nonces se consumen al aceptar la propuesta y no se reciclan tras veto/expiry.
  El commit consume otro nonce admin. Gastar usa exclusivamente el nonce spend.
- La espera comienza en el tiempo de aceptación, no en un `validAfter` antiguo.
  Ventanas semiabiertas: `validAfter <= now < validUntil`. Expirar libera pending.
- Recovery bloquea spend durante la espera y su activación sólo instala política;
  cualquier relayer puede retransmitir después del quorum almacenado y la espera.
  No existe argumento de transferencia, implementación o migrationCall en esa acción.
- Upgrade exige nuevo consentimiento admin después de la espera, codehash observado
  y calldata exacto; avanza securityVersion y la cadena de manifests aunque no
  cambie la política. La compatibilidad y efectos reales de migrationCall siguen
  pendientes de implementación y revisión; el modelo no ejecuta delegatecall.
- Rechazos conservan el estado original; freeze es monotónico; las versiones
  avanzan de una en una. IDs/direcciones no cambian al recuperar o actualizar.
- El contador de spend del modelo NO representa balances, gas ni transferencias.
  Esta especificación no demuestra ERC-4337, criptografía WebAuthn, clear signing,
  independencia física de factores ni resistencia a un cliente comprometido.

Referencias de formato: [EIP-712](https://eips.ethereum.org/EIPS/eip-712) y
[ERC-7201](https://eips.ethereum.org/EIPS/eip-7201). La protección contra replay y
las transiciones son obligaciones de GatoPago, no garantías automáticas del estándar.

## Decimotercer incremento: composición de seguridad enlazada, 8 de septiembre de 2026

El hallazgo de tamaño del duodécimo incremento no se resuelve eliminando firmas,
quorums, timelocks o recovery. `AccountV3Security` ahora se enlaza como biblioteca
fija y `AccountV3SecurityModule` integra sus seis transiciones en la cuenta.
Solidity genera las delegaciones tipadas; no se añade un ejecutor de módulos,
registry, admin de biblioteca ni un nuevo servicio backend.

- La dirección está enlazada en la implementación. Su constructor exige código
  y captura el runtime hash; cada transición falla antes de delegar si cambia.
- La factory exige el mismo enlace y hash que la implementación y lo comprueba
  también antes de crear/devolver una cuenta. No puede aceptar silenciosamente
  una biblioteca alterada entre la construcción de implementación y factory.
- Continúan las comprobaciones de identidad/proxy, posesión inicial de todas las
  llaves, inicialización única, dominio por cuenta, nonces y autoridad vigente.
  Storage y mensajes EIP-712 no cambiaron. Las llamadas de seguridad usan
  STATICCALL para los verificadores, igual que antes.
- El harness de composición baja de **24.361 a 18.868 B**; quedan **5.708 B**
  bajo EIP-170. La biblioteca ocupa **15.432 B**. La nueva prueba exige una
  composición menor o igual a 20.000 B, biblioteca menor o igual a 24.576 B e
  initcode dentro de EIP-3860. No certifica el tamaño del Account completo futuro.
- Diez pruebas nuevas comprueban dirección/hash, presupuesto, construcción sin
  biblioteca, deriva antes de factory, enlace discrepante, bloqueo de las seis
  entradas ante código hostil, runtime fuzzed/ausente, CALL directo rechazado,
  separación entre cuentas/eventos y rechazo del dominio de firma de la biblioteca.
  El fuzzer de corrupción de factory ahora cubre cuatro componentes; el invariante
  del proxy verifica también el enlace/hash durante las transiciones de autoridad.

### Verificación de este incremento

- `pnpm check:v3`: **197 pruebas TypeScript + 140 Foundry V3**, diez suites
  Foundry, exit 0; sin fallos ni omitidas en V3. Schema/vectores y commitment de
  storage se conservan; guard de dependencias verifica los mismos 546 archivos.
- `forge test --force --summary`: **333 pruebas pasan**, cero fallos y cuatro
  fork smokes omitidos por falta de RPC (uno Arbitrum Sepolia, tres checkout).
  La compilación completa reconstruyó 139 archivos con solc 0.8.34. Se comprobó
  que Creation y SecurityModule tienen bytecode de test no vacío y 24/10 tests;
  no se aceptó un descubrimiento parcial por cache como evidencia de cobertura.
- `forge build --sizes`: factory **8.976 B**, proxy **285 B**, biblioteca
  **15.432 B** e integración **18.868 B**. `forge fmt --check` y lint dirigido
  `--severity high med low --deny warnings` pasan.
- Slither aislado sobre módulo/factory, con solc 0.8.34, via IR y optimizer
  1.000.000: **22 y 27 observaciones**, respectivamente; `--fail-high` exit 0.
  Incluyen defaults cero de locales, retorno auxiliar ECDSA (el error sí se
  comprueba), timestamps para ventanas/timelocks, assembly acotado y complejidad.
  Factory añade evento tras initialize; no posee autoridad mutable y sólo el
  senderCreator fijado puede crear. No es auditoría ni una afirmación de cero riesgos.
- Diagrama 19 actualizado con enlaces/bibliotecas; render y check pasan para
  los **29 SVG**. `git diff --check` pasa, con avisos LF→CRLF preexistentes.
- Descriptor Web sigue siendo
  `web-v3-fb215605b66edc299a5a35298a7cf819f426094733ca4cb62ee31607ce7d07c8`,
  99 inputs. No se reconstruyó/desplegó Web ni se ejecutaron navegador,
  `verify:all`, sesiones físicas o pruebas monetarias remotas en este incremento.

**Límite de confianza añadido explícitamente:** un hash capturado no demuestra
que el código original sea seguro. La biblioteca es otra dependencia onchain
del artefacto; exige procedencia, dirección/codehash iguales por red, referencias
de linker verificadas y presencia en el paquete de salida. No se admite un proxy
como biblioteca. El módulo fijo sigue sujeto a revisión independiente de Gate A;
no constituye ERC-7579 ni habilita delegaciones seleccionadas por el usuario.

**ERC-4337/7562 sigue abierto:** no se eliminó el control de tiempo actual ni se
promovió la fixture a EntryPoint real. La consulta pública a npm encontró estable
`@account-abstraction/contracts` 0.8.0 y 0.9.0-rc.1, pero no 0.9.0. El tag oficial
`v0.9.0` existe en Git con commit
`b36a1ed52ae00da6f8a4c8d50181e2877e4fa410`. No se instaló una RC ni se inventó una
versión npm. La integración siguiente debe incorporar la fuente oficial fijada,
probar `handleOps`/`validationData` real y trazar el frame de validación; no basta
con `senderCreator` sintético. Fuente: [release oficial](https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.9.0).

La lectura de `contracts/core/EntryPoint.sol` en ese commit confirma dos detalles
que deben tener regresiones en la integración: `_getValidationData` usa
`validAfter < now <= validUntil`, mientras V3 compromete una ventana semiabierta
`validAfter <= now < validUntil` (no copiar los campos sin adaptar sus límites);
y `_createSenderIfNeeded` ignora `initCode` si la cuenta ya existe. Por tanto,
`initCode.length > 0` no es evidencia de primera inicialización. Falta diseñar y
probar la vinculación de la ventana de creación a la validación real sin reabrir
inicialización, bloquear una cuenta ya creada ni retirar expiración.

La separación utiliza las [bibliotecas enlazadas de Solidity](https://docs.soliditylang.org/en/v0.8.34/contracts.html#libraries)
y conserva OpenZeppelin para proxy, inicialización y firmas; no copia su código.
No se crearon recursos remotos, dependencias de paquete nuevas ni secretos, y
no hubo commits, despliegues, movimientos de fondos ni activación de mainnet.

## Decimocuarto incremento: validación con EntryPoint real, 8 de septiembre de 2026

Se incorpora la fuente oficial v0.9 desde el commit fijo
`b36a1ed52ae00da6f8a4c8d50181e2877e4fa410` como dependencia **de desarrollo**.
No es una RC, una descarga dinámica en runtime ni una prueba del bytecode de
un EntryPoint remoto. Se compila localmente con solc 0.8.34, Cancun y el OZ
fijado por este repositorio. El guard offline verifica los 35 archivos del
inventario (Solidity, LICENSE y package), contra tamaño y Git blob; prueba
también alteraciones de contenido y longitud en memoria, sin tocar la dependencia.

`AccountV3EntryPoint` es una base abstracta que conserva `onlyEntryPoint` y
prefund de OpenZeppelin. El probe de pruebas utiliza la política persistida,
firmas reales y el hash que calcula el EntryPoint sobre gas, nonce, initCode y
callData. Su única acción es un acknowledgement firmado, no una transferencia,
un Account completo, un bypass de quorum ni evidencia de passkey física.

- Las ventanas V3 semiabiertas se adaptan a `validationData` sin TIMESTAMP/NUMBER
  en el factory/account. TypeScript rechaza ventanas iniciales/de ejecución
  fuera del perfil positivo de 47 bits antes de firmar; no cambian los typehashes.
- La validez de creación se almacena de forma persistente, no en transient
  storage, y bloquea cambios de seguridad hasta validarse. Se añade un uint256
  al slot relativo 30; el diff del layout no mueve campos anteriores.
- Un fallo de firma/ventana/nonce revierte creación, depósito y todo el bundle.
  Un fallo de ejecución posterior no deshace la creación ni devuelve el gas.
  Operaciones posteriores usan autoridad actual; initCode antiguo no reinstala
  la política ni vuelve a aplicar una ventana de creación ya consumida.
- La factory deja de leer el codehash del EntryPoint durante validación (OP-054).
  Lo captura en construcción y su admisión sigue siendo obligación del manifest.
  No admitir EntryPoints mutables/no verificados. Los guards de implementación,
  senderCreator y biblioteca fija se conservan. CREATE2 nativo evita el
  SELFBALANCE que ejecutaba el helper de despliegue; dirección/proxy siguen en OZ.
- La prueba de traza observa factory, cuenta y el reloj del EntryPoint para
  evitar una comprobación vacía. No equivale a todas las reglas de almacenamiento,
  reputación, gas o mempool de ERC-7562. Foundry necesita verbosity 3 para esta
  instrumentación; el gas de recorrer la traza en el test NO es gas de un pago.

**Bloqueo descubierto, no silenciado:** la prueba
`test_creationFitsCanonicalVerificationGasBudget` exige 500.000 gas y falla con
`AA13 initCode failed or OOG`. Con presupuesto diagnóstico mayor, la traza mide
517.930 gas en `createAccount` y 53.739 en `validateUserOp` para dos signers
ECDSA. Son costes locales del probe, no una tarifa ni latencia de usuario.
EntryPoint además comprueba el total de validación: no basta optimizar sólo
CREATE2 hasta 499.999. La regresión debe seguir exigiendo el límite, no omitirse,
convertirse en un expected-failure ni subirlo para declarar verde el candidato.
El siguiente incremento debe reducir almacenamiento/serialización y trabajo
duplicado preservando inicialización atómica, todas las pruebas de posesión,
identidad, ventanas, quorum y portabilidad. WebAuthn y políticas mayores necesitan
su propia evidencia de presupuesto; no quedan cubiertas por el caso ECDSA.

### Verificación de este incremento

- `pnpm check:v3`: **exit 1**, deliberadamente no se presenta como verde.
  Pasan schemas, los diez vectores, WebAuthn encoding, procedencia y layout con
  pruebas de alteración; **199 pruebas TypeScript** pasan. Foundry V3 descubre
  once suites: **156 pasan y una falla**, la regresión de 500.000 gas. Dentro
  de la nueva suite EntryPoint son 16/17; incluye cuatro fuzz de 256 ejecuciones.
- `forge test --force --summary`, repetido sin otro compilador modificando sus
  artefactos: **349 pasan, una falla y cuatro forks omitidos** por falta de RPC.
  Se comprueba código no vacío y 17 entradas de test en el artefacto EntryPoint.
  No se ejecutó `verify:all`: su gate V3 no está satisfecho.
- Runtimes locales compilados: factory **8.695 B**, proxy **285 B**, biblioteca
  de seguridad **15.510 B**, composición security-only **19.711 B** y probe con
  EntryPoint **19.593 B**. El presupuesto de 20.000 B de security-only sigue
  pasando. Su helper de validación es una fixture acotada; el presupuesto del
  Account completo con ejecución/upgrades sigue sin demostrarse.
- `pnpm check:v3:web`: **170 pruebas**, lint, tipos y build pasan. Nuevo descriptor
  `web-v3-8e12cf14e017710caad25b4bbf407f3de9c88cbcd80f18a2e526db15429fa93f`,
  99 inputs, actualizado por los cambios reales en dependencias/shared. No se
  editó UI, no hubo prueba física de PWA ni despliegue.
- `pnpm check:v3:wallet-api`: typegen, TypeScript, **68 runtime tests** y dry-run
  pasan después de reconstruir los artefactos. El ambiente sigue `unprovisioned`;
  los tests no demuestran Firebase/Turnstile reales. Bundle local 60,64 KiB,
  10,44 KiB gzip. La ejecución anterior chocó con artefactos ausentes y no se
  utilizó como evidencia positiva.
- Slither sobre la base abstracta informa **28 observaciones**, `--fail-high`
  exit 0: defaults cero, retorno auxiliar ECDSA, tiempo en transiciones de
  seguridad (no frame validado), assembly acotado, complejidad/pragma y métodos
  abstractos aún no implementados. No sustituye el análisis del Account final
  ni el threat review independiente. Su autodetección invocó `forge clean`;
  por eso se descartó esa ventana de artefactos y se repitió la compilación y
  suite completas de forma aislada antes de registrar el resultado de arriba.
- `forge fmt --check` y lint dirigido de las bases Solidity pasan; ESLint del
  test TypeScript pasa con config explícita. El archivo shared no está dentro
  del alcance de ese ESLint, pero sí pasó tipos/vectores/tests/builds. Los 29
  diagramas se verifican y `git diff --check` no detecta errores (avisos CRLF).

La incorporación reutiliza las fuentes oficiales de
[EntryPoint v0.9](https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.9.0),
[ERC-7562](https://eips.ethereum.org/EIPS/eip-7562) y OpenZeppelin instalado.
No hubo operaciones remotas, credenciales nuevas, commits ni despliegues.

## Decimoquinto incremento: almacenamiento compacto y creación

Trabajo presente al retomar la implementación, comprobado otra vez por la
regresión del decimosexto incremento:

- `StoredSigner` representa ECDSA/ERC-1271 con identidad compacta y conserva
  los 128 bytes completos de claves WebAuthn. El formato público y sus firmas
  no cambian; reemplazar una política limpia arrays/bytes anteriores.
- `StoredPolicy` comparte cabecera; la ventana de creación ocupa offsets
  15/21 del slot cabecera. `accountId` se deriva de sus dos preimágenes
  persistidas. Namespace de 28 slots, no upgrade compatible con el anterior.
- La factory evita doble validación del caso nuevo. La instalación autenticada
  reutiliza la biblioteca fija, bajo validación de proxy, posesión y one-time init.
- Las regresiones de creación con dos ECDSA aceptan presupuestos 500.000 y
  496.000 de verification gas; no demuestran ese límite para toda política.
- Layout vigente: `0x1db59f278cb6ee7f51095e572dc040bf37f9c1e4e63143a9fe0e0eacac97f3b7`.
  No hubo una migración ni alteración de cuentas remotas.

## Decimosexto incremento: ejecución y salida directa, 8 de septiembre de 2026

La respuesta conceptual anterior sobre Next no modificó código. Se retomó
E0/E3 y se añadió ejecución efectiva de activos, no un acknowledgement de prueba.

### Implementación

- [AccountV3Execution](../../contracts/src/v3/AccountV3Execution.sol): batch
  atómico 1–32 CALL con OpenZeppelin, sin DELEGATECALL elegido por usuario.
  Una sola transferencia es un batch de una llamada.
- UserOp: hash real de EntryPoint, calldata canónica, `callsHash`, nonce key 0,
  versión, paymaster y dominio firmados. Sólo EntryPoint ejecuta implícitamente;
  ni self ni una llave EOA pueden saltar el quorum llamando a `execute`.
- `executeSigned` usa modo 1 y nonce independiente. Un tercero puede pagar el
  gas sin autoridad ni reembolso implícito. La prueba retira incluso el depósito
  de la cuenta en EntryPoint sin bundler ni relayer GatoPago. No equivale aún a
  entregar el paquete portable ni el cliente de emergencia al usuario.
- Se verifica de nuevo recovery/securityVersion al ejecutar. Pruebas reales
  con dos cuentas en un handleOps hacen que la primera prepare recovery o
  confirme una rotación y que el spend ya validado de la segunda sea rechazado.
- `executing` bloquea las transiciones de seguridad durante callbacks;
  ReentrancyGuardTransient de OZ protege ambos ejecutores y libera el bloqueo.
- Bootstrap WebAuthn real sólo termina creación, sin gastar. Su prueba de
  fallback P-256 utiliza un presupuesto explícitamente mayor; sigue abierto
  el perfil de admisión a 500k. No se simula aceptación mediante un verifier falso.
- Codec [TypeScript](../../shared/v3/execution.ts) contrasta llamadas/envelopes
  con el ABI compilado de Solidity. No se publica una nueva API comercial.

### Tamaño y alcance

La primera composición medía 26.667 B y no era desplegable bajo EIP-170.
Quitar vistas de inspección grandes no bastó. Se reutilizó la predicación de
firmas ya contenida en la biblioteca fija `AccountV3Security`, conservando
los controles del ejecutor y el guard de codehash. Resultado comprobado:

| Artefacto | Runtime | Margen EIP-170 |
|---|---:|---:|
| Composición de ejecución/seguridad para pruebas | 23.118 B | 1.458 B |
| Biblioteca fija Security | 22.251 B | 2.325 B |

Hay una prueba que rechaza exceder EIP-170; esto **no** satisface el presupuesto
de margen del Account final ni incluye ERC-1271/UUPS/receivers. El prototipo no
es el artefacto a promover. El enlace no tiene administrador ni registry mutable.

`CallsExecuted` expresa éxito EVM, no pago conciliado. Un ERC-20 puede devolver
false sin revertir; no se presume settlement por el retorno del CALL. Los hashes
de fees/límites/preview están firmados pero el ejecutor no interpreta esas
políticas ni garantías de output. Esa evidencia debe cerrarse al integrar adapters.

### Evidencia local

- `pnpm check:v3`: exit 0; **203 pruebas TS + 195 Foundry V3**. Incluye las
  21 pruebas de ejecución y tres invariantes nuevas, cada una con 256 secuencias
  y 128.000 llamadas. Ninguna falló ni fue omitida.
- Pruebas dirigidas: transferencia nativa contrafactual, ERC-20, rollback,
  replay entre modos/chains, quorum faltante/duplicado, nonce key, límites de
  batch, llamadas reentrantes, callbacks admin y cambio de autoridad en bundle.
- `pnpm check:v3:web`: exit 0; 170 pruebas, lint, tipos y build Next.
  El nuevo módulo compartido actualiza el release a
  `web-v3-ff5ea28b5c45338a7f2a69e916cc514a3d5a70ff633d16f9342dd1f1d64eb1c8`, 100 inputs.
- TypeScript server y lint dirigido del test nuevos: exit 0. El primer comando
  de lint con un archivo fuera del proyecto no encontraba config; se repitió
  desde server con `--config eslint.config.js`, sin modificar reglas.
- `pnpm check:v3:wallet-api`: exit 0; types/bindings, 68 pruebas runtime y
  build dry-run (60,64 KiB, gzip 10,44 KiB). Firebase sigue `unprovisioned`.
- Regresión general Foundry (`forge test --summary`): exit 0; 388 pruebas
  aprobadas y cuatro fork smokes omitidos por falta de RPC local. `forge fmt
  --check` y `forge lint src/v3 --severity high med low --deny warnings` pasaron.
  Se documentó únicamente la excepción puntual `block-timestamp` del intervalo
  firmado directo, igual que en enrollment; no se desactivó la regla global.
  Los 29 SVG de arquitectura y `git diff --check` también pasaron.
- Slither, forzando solc (sin `forge clean`), exit 0 con `--fail-high`:
  47 contratos/101 detectores, 27 observaciones revisadas. Incluyen ceros
  implícitos de Solidity, resultado ignorado del validador de ventana usado por
  sus reverts, timestamps necesarios en ejecución directa/timelocks, assembly
  previo y complejidad. El aviso de transient storage corresponde al guard OZ
  que se limpia al retornar, probado en secuencias. No es una auditoría externa.
- Integridad de 546 archivos Solidity y 35 fuentes EntryPoint, vectores y
  checksums de storage siguen pasando. No se cambió el namespace en este incremento.

Los fallos iniciales de pruebas provinieron del llamador sintético de handleOps
(v0.9 exige EOA/origin), comparación de checksum de dirección en TS y medición
de bytecode. Se corrigieron fixtures/normalización/composición y se repitieron
los gates; no se relajaron firmas, límites temporales ni asserts de resultados.
No se ejecutó `verify:all`, aceptación humana ni despliegues en este incremento.

### Decimoséptimo incremento — firmas de cuenta e interoperabilidad

Se añadió `AccountV3Interop`: ERC-1271, dominio ERC-5267 y receptores
ERC-721/ERC-1155 de OpenZeppelin, conservando el receptor nativo de OZ Account.
La composición de las pruebas de ejecución ahora usa esta implementación real,
no un stub que devuelve false para toda firma de cuenta.

El mensaje `AccountSignature` está ligado a cuenta, generación, versión,
chain y hash de aplicación. Es un perfil de lectura separado de las diez
autorizaciones con nonce: no se amplía ni reutiliza `ExecutionPlan`. TypeScript
y Solidity comparan typehash, struct hash, digest y bytes de envelope mediante
el vector público de protocolo revisión 3. No se adopta silenciosamente el
draft ERC-7739. El integrador debe producir el nuevo envelope; la aplicación
receptora usa ERC-1271 ordinario y conserva responsabilidad por dominio, nonce
y deadline. ABI inválido puede revertir y se trata como firma inválida.

**Seguridad:** quorum SPEND, sin autoridad por login/owner bruto, ni votos
admin/recovery sin rol SPEND. Creación pendiente, bootstrap y recovery pendiente
bloquean la aprobación. Rotación invalida las firmas anteriores. Verificar no
consume un nonce ni autoriza una transacción por sí mismo; una aplicación
puede interpretar su mensaje como orden monetaria. La UI no debe esconderlo.
La lectura permanece disponible durante ejecución; el flag compartido sigue
bloqueando reentrancia de gasto y mutaciones de seguridad. No hay escrituras,
logs o lecturas del reloj en la traza de firma, incluida la biblioteca enlazada.

**Límites encontrados y corregidos:** la primera composición medía 24.968 B,
por encima de EIP-170. Se movió la validación de identidad/política al instalador
fijo que ya verifica posesión, conservando el guard de proxy/factory y one-time
initializer. También apareció un `AA26` en creación con primer envío. Se
eliminó la revalidación estructural duplicada sólo para descriptores/políticas
ya validados antes de instalarlos; los predicados conservan todos los checks de
quorum y criptografía. El test diferencial cubre equivalencia para políticas
válidas; los tests de creación/storage siguen rechazando entradas inválidas.
No se subieron los límites ni se redujo el número de firmas de las pruebas.

Resultado medido: Account compuesto 22.138 B; biblioteca 24.046 B. La biblioteca
sólo deja 530 B bajo EIP-170: UUPS requiere revisar la composición/margen, no
agregar lógica ciegamente ni declarar el Account final. El namespace, slots
y hash del layout no cambian. No se instalaron ni actualizaron dependencias.

Pruebas añadidas: 18 de interoperabilidad, un vector Solidity, una prueba
diferencial de quorum y una de primer envío con 496.000 gas de verificación.
Las invariantes de ejecución incluyen consultas de firma intercaladas con
transferencias/replays/fallos, sin consumir balances, nonces o permisos. Las
pruebas con WebAuthn incluyen aserciones P-256 reales sobre una política activa
y rechazo bootstrap; la creación software usa un presupuesto caracterizado de
4 millones, NO se declara compatible con el perfil de bundler de 500k.

La primera prueba WebAuthn detectó un error de fixture: ordenar una copia memory
de una política storage no la persistía. Se corrigió el fixture; no se relajó
el orden canónico. El codec TS requirió extraer el dominio a constantes ESM
compartidas con sus declaraciones `.d.mts`; pasan tanto Node como TypeScript.
Una invocación con `-vv` no habilitó la instrumentación; la traza se verificó
después con la verbosidad 3 del proyecto, sin sustituirla por inspección estática.

Validación actual: 207 pruebas TypeScript V3 y 216 Foundry V3 aprobadas;
170 pruebas web más lint/types/build Next; 68 pruebas Wallet API runtime,
typegen/TypeScript y dry-run de 60,64 KiB (gzip 10,44 KiB). El release local es
`web-v3-a7d426d1ed09686e2d7d22ad9b0c48e0e9ec1bc51ee6a0e73d4cffc46f702322`,
101 inputs. Es una identidad de fuentes, no evidencia de deploy.

Regresión general Foundry: 409 pruebas aprobadas, cuatro forks omitidos por
RPC local ausente; formato y lint Solidity (high/med/low, deny warnings) pasan.
Slither sobre la composición de interoperabilidad, forzando solc sin limpiar
Foundry, analizó 55 contratos con 101 detectores: 27 observaciones y exit 0
con `--fail-high`. Se revisaron ceros implícitos de locales, retornos auxiliares
ignorados, relojes necesarios en ejecución/timelocks, assembly existente y
complejidad. No es una auditoría externa ni una afirmación de cero riesgos.
El guard transient de OZ se limpia; las secuencias de ejecución/firma lo prueban.
Las dependencias conservan sus 546 archivos de Solidity y 35 de EntryPoint.

No se han desplegado estos cambios, usado inboxes, alterado DNS/secrets,
aplicado migraciones remotas, movido fondos ni activado mainnet.

### Decimoctavo incremento — actualización de Account V3 controlada por el usuario

El chequeo agregado que quedó sin salida recuperable en el turno anterior se
repitió: **216 pruebas Foundry V3** y guard de layout aislado aprobaron antes de
continuar. No se asumió que una sesión ya ausente hubiera terminado bien.

`contracts/src/v3/AccountV3.sol` compone el core real y el UUPS instalado de OZ.
La nueva biblioteca fija `AccountV3Upgrade` no es un plugin: su dirección y
codehash están ligados al artefacto. Se separa del código de seguridad para
mantener ambos dentro del presupuesto; no hay módulos instalables ni claves
operativas que puedan cambiar el destino. La escritura ERC-1967 sigue en OZ.

El protocolo implementado exige:

- `proposeUpgrade`: identidad, generation, securityVersion, predecessor,
  nonce ADMIN, scope ordenado, vigencia, política ACTIVE y quorum ADMIN actual.
- Espera de la política, mínimo 72h, contada desde la aceptación onchain; una
  ventana firmada antigua no adelanta el reloj.
- `commitUpgrade`: otra firma tipada del quorum vigente, acknowledgements,
  propuesta madura/no expirada y hash exacto de migración. El selector
  genérico `upgradeToAndCall` no es una puerta alternativa, ni para EntryPoint.
- Verificación de codehash, UUID UUPS y declaración layout/EntryPoint/generation
  antes de proponer y de aplicar; lecturas de metadata limitadas a 60k/32 bytes.
- Veto por miembro vigente, expiración sin devolver nonces, recovery que
  desplaza la propuesta y freeze irreversible que también cancela upgrades.
- Avance de securityVersion y manifest, invalidando autorizaciones anteriores;
  mismo accountId/dirección, política y nonces de otros propósitos.
- Migración no vacía mediante capacidad transient de un uso y calldata exacto.
  Un callback durante spend no es una migración, y un callback anidado durante
  la migración tampoco puede reutilizar esa capacidad.
- Rollback atómico de la implementación y de todo el estado si falla OZ, la
  migración o el checkpoint del core.

El checkpoint no inspecciona todos los tokens/mappings/namespaces ni convierte
bytecode malicioso aprobado en seguro. `upgradeCompatibility` es una declaración
del target; se mantienen los gates de storage diff completo, provenance,
simulación y revisión independiente. Migraciones no deben derivar autoridad de
`msg.sender`, que puede ser un relayer. Distintas claves tampoco demuestran por
sí solas que estén almacenadas en dispositivos independientes.

**Perfil de compilación:** la primera composición medía 25.696 B con el perfil
heredado de V2 (1.000.000 runs), por encima de EIP-170. Se midieron 10.000 y 200
runs antes de cambiar la configuración. Con 10.000 aún medía 23.013 B. Se fija
200 runs, conservando solc 0.8.34, Cancun, via-IR y el test de primer envío con
496.000 gas de verificación. El test exige <=20.000 B para Account real y cada
biblioteca, no sólo para un mock sin ejecución. No se ampliaron presupuestos de
gas/tamaño para hacer pasar las pruebas. El nuevo perfil cambia bytecode y
predicciones CREATE2; ninguna dirección/manifest histórico se reutiliza.
La compilación aislada final mide **19.263 B Account / 19.475 B Security /
10.680 B Upgrade**. El guard reafirma el hash
`0x1db59f278cb6ee7f51095e572dc040bf37f9c1e4e63143a9fe0e0eacac97f3b7`;
los helpers adicionales de observación no se presentan como Account de producción.

**Artefactos:** Foundry lint puede dejar sólo ABI incluso cuando los tests
compilan y ejecutan bytecode correcto. El guard ahora compila probe + Account
en output/cache temporales propios, exige runtime presente, perfil esperado y
exactamente los enlaces `AccountV3Security`/`AccountV3Upgrade`, además del límite
de tamaño. No borra el output/cache compartido. El hash declarado por el Account
se compara contra el layout generado por el compilador; no se rebaselineó el
namespace de 28 slots ni se aceptó una afirmación manual de compatibilidad.

**Transporte:** `shared/v3/upgrade.ts` expone encoders tipados de propuesta y
commit, con validación de scope/votos y binding de los bytes de migración. Los
tres tests TS comparan sus llamadas con el ABI del Account compuesto, no con
un contrato de ejemplo. Esto todavía no es una pantalla ni un endpoint remoto.

**Evidencia local:** 24 pruebas dirigidas y tres de handler/invariantes sobre
proxy creado con factory y EntryPoint reales; 128 secuencias/8192 llamadas por
invariante. Incluyen upgrades repetidos, códigos/UUID/layout/EP incorrectos,
metadata hostil, roles, firmas, relojes, cancelación, recovery, callbacks y
migraciones corruptoras que deben revertir. El chequeo agregado posterior pasó
**243 pruebas Foundry V3** y **210 TypeScript**. Pasan los 170 tests web más
lint/types/build Next, y los 68 tests runtime de Wallet API más typegen/types y
dry-run de 60,64 KiB (gzip 10,44 KiB). El guard de release rechazó correctamente
el descriptor anterior al añadirse el encoder; se revisaron los inputs y se
actualizó mediante `--describe` y edición explícita, no saltándose el guard.

Release de fuentes: `web-v3-81dbf8bb4d8f6bb27be9a854b89d196e628a1719e66a1d4e9a0c11a9c40dce44`,
102 inputs. No acredita deploy. Slither del Account compuesto: 60 contratos,
101 detectores, 28 observaciones revisadas; `--fail-high` exit 0. Son 14 locales
con cero implícito, dos retornos auxiliares ignorados, seis usos del reloj para
validez/demoras, tres bloques assembly delimitados y tres avisos de complejidad.
El aviso general de transient storage se contrasta con tests de limpieza,
callbacks y múltiples operaciones; no se presenta como auditoría independiente.

Regresión general final con el perfil nuevo: **436 pruebas Foundry aprobadas,
cuatro forks omitidos** por RPC local ausente; formato y build de tamaños pasan.
El guard aislado ampliado pasó después del agregado, con bytecode real y layout
sin cambios. También pasan los 29 SVGs y `git diff --check` (avisos LF/CRLF).
No se ejecutó `verify:all` ni se realizaron ceremonias humanas remotas en este
incremento; estos resultados no equivalen a aceptación integral E0–E4.

No hubo commit/push, despliegues, inboxes, cambios DNS/secrets, migraciones
remotas ni movimiento de fondos/mainnet. E0–E4 siguen abiertos donde falta su
evidencia; este incremento no redefine su alcance ni cierra E3.

### Decimonoveno incremento — composición de factory y consulta tras upgrade

8 de septiembre de 2026. La respuesta anterior sobre Next fue una revisión, no
un incremento de implementación. Este incremento modifica código local de E3;
no altera el alcance E0–E4 ni declara cerrado ningún gate.

`AccountFactoryV3` ahora comprueba las dos bibliotecas fijas, layout inicial y
UUID UUPS de la implementación, además del EntryPoint. Rechaza composiciones
parciales y no puede volver a capturar una biblioteca cambiada después del
constructor de la cuenta como si fuese la original. La creación comprueba el
codehash de Upgrade sin reintroducir acceso al código del EntryPoint durante
validación. Es consistencia del stack, no admisión de procedencia por sí sola.

Se añade `inspectAccount`, sólo lectura. Deriva la cuenta desde sus compromisos
iniciales, exige el proxy canónico, obtiene la implementación desde el selector
no delegado y compara su código **antes** de llamar getters del target. Recibe
la expectativa explícita de implementación/layout/bibliotecas del manifest del
cliente; no añade registros mutables, permisos GatoPago ni listas de upgrades.
Un upgrade real ya se puede consultar con la expectativa nueva. La versión
original de la factory no se vuelve a instalar ni tiene que seguir disponible
para leer/gastar desde una cuenta legítimamente actualizada.

Límites: el lector debe verificar la procedencia de su manifest y el código de
la propia factory por separado. No se permite obtener los hashes esperados del
mismo estado RPC no verificado. Inspeccionar identidad no significa creación
validada ni permiso para gastar; tampoco sustituye finality, evidencia de red,
reconciliación de política/versión o admisión del layout. Una biblioteca Upgrade
ausente invalida el perfil completo, pero no inutiliza el envío directo, que no
depende de ella. La herramienta portable no debe depender de esta vista.

Las pruebas de creación pasan a una composición Account completa (con una
entrada fixture explícita sólo para aislar la fase de creación). Las pruebas
con EntryPoint real eliminan el override de autorización del antiguo probe:
usan validación/ejecución/UUPS de producción y una acción externa de prueba
invocada mediante CALL firmado. No se hicieron virtuales métodos de producción
para conservar un simulador de autoridad. El guard de 20k se mantiene sobre la
cuenta de producción; el harness con vistas extra tiene sólo el límite EIP-170.

`AccountV3InspectionTest` añade doce casos unitarios/fuzz: composición parcial,
layout/UUID/metadata incorrectos, los siete campos de expectativa, drift de
proxy/identidad/dependencias, cuenta contrafactual, creación pendiente, upgrade
con firmas reales, retiro del target anterior, recovery/freeze y salida directa
sin biblioteca Upgrade. Una tercera invariante de la suite de upgrades contrasta
identidad/target/versión durante secuencias de upgrades, pagos, veto y freeze.

El guard de compilación incluye ahora factory y proxy, exige los dos enlaces
fijos de Account/factory y rechaza storage ordinario fuera de namespaces. No
cambia el layout ni amplía límites de código, gas, política o firmas.

Verificación terminal: `pnpm check:v3` pasa, con **256 pruebas Foundry V3** y
los checks TS/schemas/vectores/storage. La nueva invariante ejecuta 128 secuencias
y 8192 llamadas sin reverts. Las 18 pruebas de EntryPoint completo pasan, incluida
creación/primera ejecución con 496.000 de verification gas y la traza sin lecturas
de reloj, balances o código del EntryPoint dentro de factory/account. Esa traza
limitada no prueba todas las reglas de [ERC-7562](https://eips.ethereum.org/EIPS/eip-7562).

Compilación aislada (optimizer 200): Account 19.263 B, Security 19.475 B,
Upgrade 10.680 B, factory 9.220 B y proxy 232 B. El hash de layout no cambió.
`pnpm check:v3:web` pasa: 170 pruebas, lint, tipos y build Next. También pasa
`pnpm check:v3:wallet-api`: 68 pruebas runtime, typegen/tipos y dry-run de
60,64 KiB (gzip 10,44 KiB); Firebase continúa `unprovisioned`. No se modificó
el descriptor Web: los 102 inputs y su hash siguen iguales al incremento 18.

Slither de factory y dependencias: 62 contratos, 101 detectores, 29 observaciones,
`--fail-high` exit 0. Se revisaron las 28 categorías/instancias previamente
descritas más el aviso de evento después de initialize: la factory exige
SenderCreator, los verificadores se invocan por STATICCALL y el evento se emite
después de validar el estado, dentro de la misma transacción atómica. No se
suprimió el detector ni se presenta como auditoría independiente. Formato y lint
de `src/v3` pasan; se verificaron los 29 SVG y `git diff --check`.

La regresión general `forge test --summary` terminó con exit 0 y cuatro forks
omitidos por falta de RPC local. Un primer intento con `-vv` falló porque
deshabilitó el tracer requerido por dos pruebas: se repitió sin ese override,
respetando `verbosity = 3` del proyecto. No se omitieron ni debilitaron las
pruebas de traza. El agregado V3 ya había pasado con la configuración correcta.
No se ejecutó `verify:all` ni aceptación humana. No hay deploy, commit/push,
cambios de DNS/secrets, RPC remotos ni fondos movidos.

### Vigésimo incremento — perfil de despliegue fijado y lector Wallet Core

8 de septiembre de 2026. Se retoma E0–E4 después de una respuesta de evaluación
de Next sin implementación. Este incremento añade código local de E0/E3; no
promueve cuentas, redes ni despliegues y mantiene Gate A abierto.

- `shared/v3/deployment-schema.json` y su validador standalone definen un perfil
  de inspección de la revisión actual. Registra red/genesis, factory, receta del
  proxy, implementación, bibliotecas fijas, layout, compilador, commit/árbol,
  dependencias/build, hashes de creación/runtime/ABI y evidencia declarada de
  despliegue. No es el manifest completo de habilitación de red: no demuestra
  EntryPoint/bundler/paymaster, finality, gas ni procedencia por rellenar campos.
- `loadPinnedDeploymentManifest` requiere un SHA-256 externo de los bytes UTF-8
  exactos; rechaza archivos alterados, campos extra, roles duplicados, hashes
  nulos, cantidades ambiguas, recetas CREATE2 inconsistentes y URLs con secretos.
  Retorna una copia congelada y limita el documento a 64 KiB. El pin debe venir
  de una release admitida independientemente o del paquete portable del usuario;
  jamás del mismo JSON/visitante/RPC. Integridad no equivale a auditoría: todavía
  falta producir y revisar artefactos reales con ese perfil. No se inventó un
  commit de este árbol sucio ni se creó un pin de producción.
- `shared/v3/accountInspection.ts` verifica chainId/genesis y el checkpoint
  explícito; fija cada `eth_call`/`eth_getCode` con blockHash y requireCanonical
  de EIP-1898. Recomprueba el checkpoint al terminar y no degrada a latest si el
  proveedor rechaza el formato. Verifica código de factory antes de sus getters,
  receta CREATE2/EntryPoint, runtime del proxy y selector no delegado del target.
  Sólo después de comparar implementación y ambas bibliotecas llama inspectAccount
  con los siete valores esperados. Contrasta identidad, target, versión y layout.
- El lector distingue `recognized` de `not_deployed`; ambos dicen explícitamente
  `spend_readiness: not_assessed`. Una revisión desconocida produce error, nunca
  un intento de creación/recuperación. La revisión nueva puede cambiar target y
  bibliotecas sin imponer las antiguas; la receta del proxy/factory se conserva.
  EntryPoint sólo aporta identidad aquí, no disponibilidad. La consulta completa
  sí requiere factory y bibliotecas actuales: es opcional y NO debe convertirse
  en dependencia de la salida directa soberana.
- `server/src/v3/chainInspection.ts` integra el lector con viem y HTTP acotado:
  HTTPS de configuración confiable, sólo cuatro métodos de lectura, sin redirects,
  reintentos, multicall, CCIP, caches ni promesas globales. Cada request tiene
  timeout de 5 s, cuerpo máximo de 128 KiB y la inspección plazo total de 30 s.
  Cancela streams al abortar o exceder el límite y no propaga URL/errores del RPC.
  No añade endpoint público ni sustituye el futuro resolver autenticado de Wallet.
  El flujo reconocido hace 13 llamadas RPC; no se monta en polling de Home.

La suite nueva contiene 21 pruebas TS y 14 de workerd: ABI comparada contra el
artefacto compilado real de factory, integridad/CREATE2, cambio de chain/genesis,
fork/reorg, dependencias/target alterados, rechazo EIP-1898, identidad ambigua,
upgrade, modificación de inputs durante I/O, concurrencia, límites, cancelación
y redacción de diagnósticos. El servidor RPC es simulado: las pruebas no son un
despliegue real ni admisión independiente. La suite Solidity conserva sus pruebas
de upgrades reales locales del incremento anterior.

Se retiraron tres exports innecesarios del fixture y uno interno del encoder
ERC-1271 señalado por Knip; no cambió su algoritmo, ABI ni autorización. El nuevo
descriptor Web tiene 105 inputs y hash
`0db4bb107acd3837b9fb189dbfb257311a9291ae169d3aa677a5b1f5bdc66e12`.
Es identidad del código compartido, no prueba de despliegue. Contratos, layout,
recursos, secretos y configuración remota no cambian.

Validación final, repetida tras el último control CREATE2 y la limpieza de exports:
`pnpm check:v3` exit 0 (**231 TS + 256 contratos V3**, schemas, vectores, guard
de layout/bytecode y dependencia intacta); `pnpm check:v3:web` exit 0 (**170 pruebas**,
lint, tipos y build); `pnpm check:v3:wallet-api` exit 0 (**82 pruebas workerd**,
typegen/tipos y dry-run 61,02 KiB, gzip 10,55 KiB). Pasaron lint dirigido y Knip
sin añadir excepciones. Un primer test runtime falló por esperar 14 llamadas
en vez de las 13 reales; se corrigió el conteo, sin alterar el lector ni omitir
pruebas. No se ejecutó `verify:all`, auditoría externa ni E2E monetario/humano.

Los entornos siguen sin provisionar y no hay perfiles de cuentas habilitados.
No hubo commit/push, deploy, creación/rotación de secrets, DNS, correos,
migraciones remotas ni movimiento de fondos. E0–E4 no están completos.

Referencias verificadas: [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) y
[Workers: estado por petición y promesas](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
Se contrastaron las APIs con viem instalado y los tipos publicados de Workers;
no se actualizaron dependencias ni se añadieron proveedores de wallets.

### Incremento 21 — identidad autenticada, ownership D1 y vista Next

Se retomó la implementación después de una respuesta de evaluación de Next.js
que no cambió código. Se comprobó el árbol real y se completó el borrador local
de `auth/identity.ts` y `0002_wallet_identities.sql`; no se asumió terminada
esa base por el estado de una conversación anterior.

Implementación:

- `server/src/v3/auth/identity.ts`: JWT RS256, claves del endpoint fijo Google,
  issuer/audience exactos, tiempos, subject y proveedores permitidos. Las claves
  públicas resueltas se guardan mediante Cache API con TTL acotado; no se retienen
  usuarios/tokens/promesas globales. GET de claves y lectura JSON tienen límites;
  errores del proveedor se redactan. `password` es también el identificador que
  Firebase usa para Email Link; la configuración remota debe habilitar sólo los
  métodos aprobados. El claim por sí solo no distingue password de magic link.
- `server/v3/migrations/0002_wallet_identities.sql`: seis tablas STRICT,
  claves compuestas y generación 3; identidad de login, propiedad y cuenta
  criptográfica separadas. Sólo se aplica a D1 efímera de pruebas. No hay
  migración/import de usuarios antiguos ni nuevos recursos remotos.
- `server/src/v3/wallets/repository.ts`: batches atómicos sobre primary,
  queries parametrizadas y ownership por proyecto+subject. Crear identidad/Party
  es idempotente bajo concurrencia; no reabre un usuario deshabilitado ni borra
  `auth_not_before`. La lista de instancias no publica una dirección como
  disponible para recibir ni interpreta `active` en D1 como permiso de gasto.
- Entrypoint V3: `GET/POST /app/v1/session`, `GET /app/v1/wallets` y
  `GET /app/v1/wallets/{walletId}/accounts`. Origen/hostname estrictos, cookies
  rechazadas, POST con versión compatible y body `{}`; paginación 1–50,
  no-store, errores genéricos para wallet ajena/inexistente. Crear sesión no
  crea Wallet, Account V3, signer, recovery ni movimiento.
- `wallets/inspection.ts`: resuelve el recurso propio y verifica compromisos,
  derivación y perfil fijado antes de consultar RPC. Perfiles/checkpoints vienen
  de la futura admisión confiable, nunca del visitante. No habilita redes, no
  escribe la observación en D1 y no monta un endpoint de inspección público.
- Next `wallet/core.ts`, `WalletOverview` y el runtime Firebase: GET de wallets
  ligado a la misma identidad durante todo el await; perfil creado sólo ante
  `SESSION_REQUIRED` y una sola vez por recorrido. POST incierto no se repite
  automáticamente. Timeout total de 15 s, JSON máximo 32 KiB, paginación manual,
  ausencia de polling y cancelación al desmontar/cambiar usuario. Se descarta
  una respuesta del usuario anterior incluso si Firebase cambia durante la petición al Worker.

La guía Workers influyó en batches/bindings y caché de datos públicos resueltos;
Firebase en la separación ID token/autoridad monetaria; React en mantener la
consulta en el área autenticada y los reintentos en eventos explícitos. No se
añadieron proveedores de wallet. `esbuild` 0.28.1 se declara como dependencia
de desarrollo del harness (ya estaba en el workspace); instalación offline.

Pruebas añadidas: 26 JWT con RSA efímera real en workerd, 20 D1/ownership/inspección
y 14 de transporte/identidad cliente. Los proveedores Firebase/HTTP y RPC son
sintéticos; no constituyen una sesión Firebase remota o despliegue onchain.
La suite Wallet API pasa con 128 pruebas, typegen/tipos y dry-run de 157,00 KiB
(33,92 KiB gzip). Web pasa con 184 pruebas, lint, tipos y build Next.
`pnpm check:v3` finaliza con exit 0: 231 pruebas TypeScript y 256 Foundry V3,
sin fallos ni omisiones; schemas/vectores, integridad de dependencias, layout y
presupuestos de bytecode intactos. Foundry conserva avisos de metadatos de
revisión de dependencias y lint de fixtures; el verificador de contenido fijado
pasa. No se ejecutó `verify:all` ni auditoría independiente.

Playwright CLI usó el componente real en el harness local
`pnpm --filter @gatopago/web dev:wallet-harness`: paginación sin repetición,
error sin bucle, reintento explícito y cambio A→B mientras A tarda 1,5 s. No
reapareció A. React StrictMode invocó dos consultas sintéticas iniciales en
desarrollo; no hubo polling recurrente. A 390 px, scrollWidth=innerWidth=390.
Captura inspeccionada: `output/playwright/v3-wallet-user-switch-mobile.png`.
El harness queda fuera de las rutas/build Next; su servidor sólo escucha loopback.
No sustituye aceptación iPhone/Android ni pruebas con identidad/cuenta real.

Descriptor Web: 107 inputs, hash
`e11d722049b552941afb3b57129f0880f3ecd6adb23aa4251a7794145aabef02`.
Knip pasa sin excepciones adicionales. Se corrigieron un control regex señalado
por lint, un export sobrante y la declaración de dependencia del harness; no
se ocultaron errores ni eliminaron pruebas. El primer harness no cargaba el
reset CSS global y producía overflow: se corrigió el harness, no la UI pública.

Pendientes explícitos: sincronizar/verificar revocación y usuarios deshabilitados
en Firebase Admin (JWT offline y corte D1 no lo demuestran), completar la admisión
de redes/artefactos y provisioning con pruebas de posesión, integrar seguridad,
ejecución y salida, y comprobar todo en staging aislado y dispositivos físicos.
Los manifests continúan `unprovisioned` y sin perfiles aprobados. No hubo
commit/push, deploy, DNS, credenciales nuevas/rotadas, correo, migración remota
ni movimiento de fondos. E0–E4 y el objetivo global continúan abiertos.

Referencias contrastadas: [Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[revocación](https://firebase.google.com/docs/auth/admin/manage-sessions),
[D1 batch/sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
y [Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

### Incremento 22 — enrolamiento WebAuthn con prueba de posesión

Implementado localmente; no desplegado. El inicio de sesión no registra una llave,
no despliega Account V3 ni activa su política. Este incremento añade el paso
anterior a la autorización inicial del contrato, sin confundir ambos permisos.

- `server/v3/migrations/0003_webauthn_enrollment.sql`: intentos con dos desafíos
  aleatorios y expiración de 300 s, y credenciales públicas vinculadas al usuario.
  Sólo se aplicó en D1 efímera de pruebas. No importa signers V1/V2 ni almacena
  claves privadas, tokens Firebase, atestaciones o firmas completas.
- `POST /app/v1/security/enrollments`: preparación explícita con `request_id`
  idempotente. Requiere sesión, ID token, origin/API exactos y release compatible.
  Retorna opciones ES256, UV/resident key requeridos y exclusiones propias.
  User handle opaco, estable por RP/usuario; no expone email/subject Firebase.
- `POST /app/v1/security/enrollments/{id}/complete`: verifica la respuesta de
  registro **y una assertion nueva** antes de persistir la credencial. Formato
  `none`, P-256, RP/origin/desafíos exactos, presencia/UV y clave extraída del
  COSE de la atestación mediante SimpleWebAuthn ya instalado. No confía en SPKI
  suministrado por el cliente ni solicita metadatos/certificados remotos.
- La prueba usa el codec criptográfico V3 existente: DER/low-S, bytes originales
  y firma P-256 válida. Comprueba contador y estabilidad de backup eligibility;
  acepta contadores cero de credenciales sincronizadas. AAGUID/transportes/flags
  no prueban el gestor, hardware, ubicación ni independencia de un respaldo.
- Batches D1 vuelven a comprobar ownership y revocación local al escribir;
  compare-and-set, resultado e identidad del contenido para reintentos. Una
  clave pública sin posesión no reserva una credencial global. Dos respuestas
  concurrentes distintas no pueden reemplazar al ganador.
- Cuotas: 6 preparaciones/10 min, 24/día y 16 credenciales por usuario. Limpieza
  de intentos de más de 24 h sólo para ese owner al preparar. Una preparación
  repetida no extiende su expiración. Cuerpos máximos 24 KiB y lectura de 5 s.
  Todos los errores están saneados; las respuestas son no-store.
- `apps/web/src/wallet/passkeys.ts`: `create()` explícito, sin await antes del
  prompt; selección normal por el sistema u opción explícita de llave física.
  Comparte guard con `get()`, bloquea reload durante ceremonia, cancela por
  señal/cambio de contexto y tiene timeout incluso si el navegador ignora abort.
  `InvalidStateError` se convierte en `already-registered`; nunca inicia recovery.
  Devuelve material de registro y permite solicitar por separado la prueba.
  El contrato sigue exigiendo su propio `InitializationApproval`/`EnrollmentProof`.

51 pruebas nuevas: 29 workerd/D1 con RSA JWT y P-256/CBOR/DER reales efímeros
de prueba, más 22 del adaptador de navegador. Incluyen concurrencia, replay,
caducidad exacta, claves ajenas, session cutoff, rollback D1, dominio/algoritmo,
cuotas, errores del navegador y guard compartido create/get. No se simulan los
verificadores criptográficos ni D1; sí se simulan Firebase y la API del navegador.
No se hizo un nuevo recorrido físico iPhone/Android ni registro WebAuthn remoto.

Verificación completa Web: 206 tests, lint, tipos y build Next. Wallet API:
157 tests runtime, tipos/bindings y dry-run de 895,27 KiB (175,09 KiB gzip);
el aumento respecto al incremento 21 incluye verificación de registro
SimpleWebAuthn, no SDK nuevo de wallet. Lint dirigido y Knip pasan sin exclusiones
nuevas. Descriptor Web: 107 inputs,
`254bda9ac16b7d70e414947ce953886802d84e308355bc7c2f302044a3d618bd`.

`pnpm check:v3` termina con exit 0: 231 pruebas TypeScript y 256 contratos V3
(18 suites, cero fallos/omisiones), además de schemas, vectores, layout e
integridad fijada de dependencias. Permanecen avisos previos de revisión git
de dependencias/lint de fixtures; el contenido fijado se verifica correctamente.
`docs:architecture:check` valida 29 SVGs y `git diff --check` pasa con avisos
LF→CRLF. No se ejecutó `verify:all` ni auditoría independiente.

Las guías Workers/viem influyeron en límites, ownership atómico y reutilización
del codec V3; Foundry se usa para regresión del protocolo, sin cambios Solidity.
Referencias: [SimpleWebAuthn](https://simplewebauthn.dev/docs/packages/server),
[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[WebAuthn](https://www.w3.org/TR/webauthn-3/).

**Pendiente inmediato:** conectar transporte autenticado y pantalla Next a estos
dos endpoints, comprobar el recorrido con navegador real y enlazar la credencial
enrolada con preparación/firma/verificación de `InitializationApproval`, el
manifest admitido y la operación de creación. No existe todavía un botón nuevo
publicado ni una cuenta lista para recibir/gastar. El enrolamiento está bajo la
frontera de identidad, no habilita perfiles de contrato. Continúan pendientes
Gate A, revocación Firebase Admin, admisión de redes, seguridad/salida, E4 y
aceptación humana. No hubo commit/push, deploy, DNS, secrets, correo, cambios
en contratos, migración remota ni movimiento de fondos.

## Incremento 23 — seguridad Next, transporte autenticado y prueba de la llave

**Fecha:** 8 de septiembre de 2026. Implementación local; no es una publicación.

`apps/web/src/app/(es)/settings/security/page.tsx` monta seguridad sólo después
de resolver la identidad; `AuthScreen` ofrece acceso directo desde `/app`, en
ES/EN, y retorno explícito a `/app` sin depender del historial. La ruta excluye
caché privada/CDN e indexación; el entorno no provisionado falla cerrado.
El componente de seguridad y sus adaptadores criptográficos se cargan bajo
demanda, no en la landing ni por observar una sesión.

`wallet/enrollment.ts` valida el contrato completo de preparación: origen/RP
canónicos, ID esperado, desafíos distintos, expiración, ES256, UV/residencia
obligatorias, exclusiones y ausencia de autoridad monetaria. Usa `wallet/http.ts`,
compartido con la lista de wallets: 15 s incluyendo token/red/cuerpo, 32 KiB,
sin cookies, redirects, polling ni reintento automático de red. El bootstrap
de perfil ocurre una vez sólo ante `SESSION_REQUIRED` definitivo. Se corrigió
también la cancelación de un stream que nunca termina su `cancel()`.

`BrowserAuth.enrollment(uid)` captura el objeto User de Firebase y lo comprueba
antes/después del token y HTTP. Cambiar a otra sesión, incluso con el mismo UID
pero otro objeto User, invalida ese contexto. No hay API key privada en el
navegador ni dependencia monetaria del token Firebase.

`EnrollmentFlow` conserva ID, material público y prueba únicamente en memoria
de la pantalla. No hace peticiones al construirse, ni crea passkeys al montar.

1. Preparación explícita; si su respuesta es incierta, el reintento conserva ID.
2. Crear passkey desde un gesto nuevo, sin `await` de red/import antes de WebAuthn.
3. Probar la misma llave desde otro gesto; la firma se verifica localmente y se
   envía a Wallet Core. No firma `InitializationApproval` ni una transferencia.
4. Éxito únicamente después de confirmación del servidor. Ante resultado incierto,
   el reintento reenvía la misma prueba/ID sin crear otra llave o volver a firmar.
5. Cancelación, desmontaje, caducidad y cambio de usuario invalidan resultados
   tardíos. Cancelar libera el guard de recarga aunque un adaptador no responda;
   no pretende borrar la credencial del gestor ni revertir un registro ya recibido.

La opción habitual deja elegir al navegador/gestor. Una sección secundaria
permite pedir una llave física, sin imponer Apple/Google ni prometer sincronía.
Un duplicado se explica como llave ya registrada, no como pérdida de llave y
no inicia recuperación. El flujo admite otro registro después de completarse.

### Evidencia del incremento

- `pnpm check:v3:web`: 243 tests, lint, tipos y build Next con la nueva ruta.
  Son 37 pruebas más: 21 de transporte, 13 de estados y 3 de sesión capturada.
- `pnpm check:v3:wallet-api`: 157 tests workerd, tipos/bindings y dry-run.
  895,27 KiB / 175,09 KiB gzip; no cambios de lógica o migraciones del Worker.
- `pnpm test:v3:unit`: 231 tests. No se repitió Foundry en este incremento,
  que no cambia Solidity; su resultado del incremento 22 no es evidencia nueva.
- Knip sin exclusiones nuevas; validación de diagramas y whitespace al cierre.
- Build Next servido localmente: `/settings/security` devuelve 200, no-store,
  noindex, no-referrer, X-Frame-Options DENY y CSP; muestra acceso deshabilitado
  con identidad no provisionada, no finge una sesión remota.
- `pnpm --filter @gatopago/web dev:enrollment-harness` sirve el componente real
  y adaptadores; compila el `verifyEnrollment` real para Node. Chromium crea una
  passkey virtual, prueba posesión y recibe confirmación. Se comprobó duplicado,
  cambio A→B y respuesta 503 deliberada después de persistir: reintentar confirma
  la misma prueba sin otra creación/firma. La observación dio 2 registros
  verificados y 1 replay aceptado. Captura móvil revisada en
  `output/playwright/v3-enrollment-23-success-mobile.png`.
- Avisos Chromium: ES256-only deliberado, sin añadir RS256 no soportado por
  Account V3. El 503 del escenario incierto es inyectado por el harness.
- Descriptor Web: 112 inputs,
  `c0eedb0fb99c6d81640581d8faff348dbfe48e28ce2a2f6183e67275c21be890`.

El harness de navegador usa identidad y persistencia en memoria sintéticas;
no prueba Firebase/D1 de extremo a extremo, Safari físico ni claves sincronizadas.
Las pruebas runtime D1 siguen siendo evidencia separada. Las guías React/Firebase
orientaron acciones explícitas, carga bajo demanda y aislamiento de sesión;
Playwright permitió comprobar los gestos de navegador, no reemplazar la aceptación
humana. No se añadió proveedor ni dependencia, se rotó secreto, se emitió correo,
se aplicó migración remota ni se hizo deploy/commit/push o movimiento de fondos.

**Pendiente siguiente:** preparar y autorizar `InitializationApproval` desde la
credencial registrada y el modelo Wallet/Account, con artefactos y manifest
admitidos; después enlazar creación e inspección onchain a Consumer. Continúan
Gate A, recursos reales E1, legales/docs, recuperación/salida, la integración
monetaria y aceptación E4. No se cierra E0–E4 ni se habilita mainnet.

## Incremento local 24 — autorización inicial y registro duradero

Se añade un paso explícito entre enrolar una passkey y crear Account V3. No
se reutiliza la prueba de enrolamiento para autorizar configuración monetaria.

- `shared/v3/initialization.ts`: perfil de creación con schema standalone,
  pin SHA-256 externo, receta CREATE2 calculada desde creationCode del proxy
  más implementación y roles separados. El perfil de inspección existente
  sigue siendo válido para cuentas actualizadas, pero no se acepta como perfil
  de creación. No se admite una red por schema, hash autocertificado o flag.
- El compilador compartido deriva la política bootstrap de una sola passkey,
  su compromiso, accountId, dirección, red, nonce inicial cero, ventana de hasta
  300 segundos y digest EIP-712 `InitializationApproval`. El cliente futuro
  debe reconstruirlo localmente desde un perfil previamente admitido; no firmar
  a ciegas un digest recibido del servidor. El alcance inicial es una sola red.
- La prueba ES256 real se verifica con el mismo codec WebAuthn de Account V3.
  Se codifica `createAccount` para factoryData/initCode del camino
  SenderCreator/EntryPoint; la factory no acepta un broadcast directo del usuario.
  Esto no reemplaza la firma de la UserOperation ni su simulación/receipt.
- `server/src/v3/wallets/initialization.ts`: repositorio interno por petición,
  ownership mediante identidad verificada y credencial enrolada, snapshots
  antes del primer await, revalidación de sesión y actualización condicional.
  Un ID no puede cambiar de llave, salt o perfil en un retry. La primera
  firma aceptada no se sobrescribe con otra y los replays no extienden vigencia.
- `0004_account_initializations.sql`: migración sólo aplicada en D1 local de
  tests. Registra consentimiento, no wallets, balances, despliegues ni fondos.
  Los estados prepared/authorized devuelven explícitamente deployed/receive/
  spend false. Límite por propietario de seis inicios/10 minutos y 24/día,
  sin bloqueo global de cuenta ni de link.

Evidencia ejecutada en este incremento:

- 23 nuevas unitarias: pin y composición, política, calldata, firmas P-256,
  origen/UV/llave incorrectos, límites temporales y cambios de salt/red/factory/
  EntryPoint/verificador. Total `pnpm test:v3:unit`: 254, exit 0.
- 13 nuevas runtime con D1 real en workerd: idempotencia/concurrencia,
  ownership, revocación/cutoff de sesión, corrupción, expiración, aislamiento
  y límites. Credenciales previas e identidades de estas nuevas pruebas son
  fixtures; no constituyen otro E2E Firebase/browser/enrolamiento.
- `pnpm check:v3:wallet-api`: types/bindings, 170 runtime y dry-run, exit 0.
  Bundle de la entrada pública: 895.35 KiB, gzip 175.11 KiB. El flujo interno
  aún no está montado en esa entrada: ese tamaño no prueba su coste final.
- `pnpm check:v3:web`: 243 pruebas, lint, tipos y build Next, exit 0. No se
  modifica la pantalla de seguridad ni se agrega un botón inoperante de creación.
- TypeScript, ESLint dirigido y Knip: exit 0. No se repitió Foundry ni un
  recorrido de navegador: Solidity y UI no cambiaron en este incremento.
- Descriptor Web: 113 inputs,
  `b9b7a81298e6c48fd2e8f995b123c4fca2c5a83806cb30cdcbe2ae39a8cc70eb`.

Las guías Workers/viem orientaron sesiones de DB por petición, autorización
acotada y ABI tipada; Wrangler se usó sólo para tipos y dry-run. No se crearon
secrets, no se rotó ninguno, no hubo despliegues, correos, commit/push,
migraciones remotas ni movimientos de fondos. No se rehabilita V1/V2.

**Siguiente integración requerida:** verificar y admitir artefactos originales,
immutables/código y evidencia de red; conectar preparación/confirmación a
HTTP/Next con esos perfiles; construir la UserOperation de creación autorizada
y reconciliar su receipt antes de habilitar la cuenta. Continúan Gate A,
recursos aislados E1, legales/docs, recovery/salida e integración y aceptación E4.

## Incremento local 25 — composición original y primera UserOperation real local

Se conecta la codificación de creación con los contratos compilados en un Anvil
efímero de loopback. El flujo aún es interno: no se expone en HTTP/Next, no hay
red pública admitida y este resultado no habilita recibir ni gastar en la App.

- `shared/v3/creationInspection.ts` y el adaptador de Wallet Core verifican
  siete runtimes antes de consultar 18 valores de composición original:
  factory, implementación, bibliotecas, EntryPoint, SenderCreator y verificador.
  Las 29 lecturas usan el mismo checkpoint; las lecturas de estado exigen
  EIP-1898 `requireCanonical`. No hay fallback a latest, perfil post-upgrade,
  respuesta anterior ni otra red. Un RPC honesto/finalidad/procedencia no se
  demuestran sólo comparando esos valores.
- `shared/v3/creationOperation.ts` construye la primera UserOperation
  account-funded para el EntryPoint v0.9 fijado. Sólo permite `completeCreation`,
  nonce cero, sin paymaster ni llamada a activos. Verifica posesión inicial y
  una segunda prueba WebAuthn sobre el ExecutionPlan que compromete UserOp,
  gas, cap y preview. No interpreta la prueba inicial como firma de la operación.
  Reprecios y sustituciones requieren nuevo consentimiento. Las ventanas son
  temporales y semicerradas; el bit reservado para validez por bloque se rechaza.
- La cota explícita cubre el cargo de gas de EntryPoint en unidades nativas,
  no una comisión comercial ni una promesa de cubrir recargos de cualquier L2.
  Patrocinio, gas estimado por perfil y admisión ERC-7562 continúan pendientes.
- El test Anvil despliega las bibliotecas y contratos reales sin fork ni
  reutilizar un nodo, credenciales o fondos. Usa cuentas efímeras del proceso
  hijo, excluye variables operativas y cierra únicamente ese proceso. No se
  imprime el stdout privado del nodo. Knip declara `anvil` como herramienta
  externa de Foundry; no se excluyen archivos ni imports para ocultar hallazgos.
- El recorrido real compara el hash local con `EntryPoint.getUserOpHash`,
  simula, envía, exige `AccountDeployed` y `UserOperationEvent(success=true)` del
  emisor correcto, verifica el runtime del proxy contra el artefacto y consulta
  la identidad/implementación mediante la inspección existente. Reconcilia el
  prefund con saldo, depósito restante y cargo observado. Un envío deliberadamente
  repriciado revierte sin crear la cuenta ni consumir su prefund; el replay
  posterior también se rechaza. La política resultante continúa bootstrap.

Evidencia ejecutada:

- `pnpm test:v3:unit`: 283 pruebas, exit 0; incluye 13 nuevas de inspección,
  12 del constructor/autorizador y cuatro sobre contratos reales en Anvil.
- `pnpm check:v3:wallet-api`: 174 runtime, tipos/bindings y dry-run, exit 0.
  Los cuatro casos nuevos de workerd cubren HTTP acotado, cancelación, no reusar
  éxito anterior y construcción/firma P-256 sin I/O. La entrada pública sigue
  en 895.35 KiB / 175.11 KiB gzip; no incluye aún estos servicios internos.
- `pnpm check:v3:web`: 243 pruebas, lint, tipos y build Next, exit 0. Sin
  cambios de UI ni nueva evidencia de navegador/dispositivo físico.
- ESLint dirigido, TypeScript y Knip: exit 0. Los 29 SVG de arquitectura pasan.
  No se modificó Solidity ni se repitió toda la suite Foundry en este incremento.
- `pnpm build:contracts`: exit 0, compilación al día y contenido de 546 archivos
  de dependencias más 35 del EntryPoint verificado. Forge conserva avisos de
  metadatos de revisión de dependencias y lint de fixtures; no se ocultan ni
  se confunden con corrupción del contenido o aprobación para desplegar.
- Descriptor Web: 115 inputs,
  `0a201bb02f3ae6532c13a631784c90935539848942595552bc7c76895e8c1558`.

Las guías de Workers, viem y Foundry orientaron las lecturas acotadas, los tipos
de UserOperation y la prueba de contratos reales locales; Wrangler sólo produjo
tipos y dry-run. Los metadatos de procedencia/aprobación del perfil Anvil son
fixtures: no son un manifest publicable ni una revisión independiente Gate A.
El gas de prueba es deliberadamente generoso, no prueba de admisión de bundler.
No hubo deploy remoto, migraciones remotas, secrets nuevos/rotados, correo,
commit/push ni fondos externos. E0–E4 permanecen abiertas.

**Siguiente integración:** seleccionar perfiles mediante admisión independiente
y checkpoints frescos; conectar consentimiento y operación a HTTP/Next, persistir
su entrega/reconciliación idempotente y luego completar activación, seguridad,
recovery/salida y recorridos E4. El receipt validado en este harness no reemplaza
el servicio durable de reconciliación ni su evidencia de reorg/finalidad.

## Incremento 26 — consentimiento restaurable y primera UserOperation persistente

Estado: candidato local E3, sin endpoint público ni despliegue.

- `assertionRecord.ts` conserva las tres partes de WebAuthn en JSON/hex
  canónico y acotado. No es un verificador: las lecturas restauradas vuelven a
  verificar las firmas contra sus digests y el propietario original. Los
  buffers y términos se copian antes de las lecturas asíncronas.
- `InitializationRepository.readAuthorized` permite reconstruir la operación
  tras recargar sin solicitar de nuevo el consentimiento ya aceptado. La
  lectura de una autorización vencida no amplía ni renueva su autoridad.
- `CreationOperationRepository` usa una operación inmutable por consentimiento:
  gas, cap, UserOpHash y ExecutionPlan. La primera firma no sirve como segunda
  autorización. Otra firma válida o un gas distinto no sustituyen lo guardado.
- La migración V3 local `0005` añade operación y outbox. La firma y su intención
  de entrega se guardan en un único `D1.batch`; el test provoca una falla SQL
  del segundo paso y prueba rollback de la firma y posterior reintento.
  La `0004` local también incluye el cuerpo de la primera assertion. No se
  migró una base existente ni remota y no hay compatibilidad V1/V2.
- Compare-and-set más autorización en SQL evita que dos peticiones acepten
  versiones distintas. Se verifica la revocación de usuario/sesión que ocurre
  después de la última lectura de ownership y antes de escribir. Ningún otro
  usuario/proyecto puede leer las pruebas ni autorizar la operación.
- Un outbox ausente/alterado tras aceptar no se reconstruye a ciegas. Las
  lecturas rechazan hashes, gas, firmas y datos no canónicos o corruptos.
  Los reintentos aceptados tras vencimiento sólo devuelven su estado histórico;
  no vuelven a insertar ni extienden el vencimiento.

Evidencia local dirigida: 23 nuevas pruebas runtime con D1 real de workerd y
firmas P-256 efímeras. El enrolamiento anterior se siembra como fixture; no
prueba usuario/dispositivo físico, red admitida ni consentimiento de producción.
Las 283 unitarias V3, incluidas las cuatro pruebas Anvil, pasaron. ESLint,
TypeScript, Knip y revisión de espacios pasaron. Knip eliminó únicamente un
export interno innecesario; no se borraron archivos ni se ampliaron ignores.

`pnpm check:v3:wallet-api` terminó con exit 0: 197 runtime en siete archivos,
bindings/tipos al día y dry-run de 895.35 KiB / 175.11 KiB gzip. La entrada
pública no importa aún estos servicios internos; ese tamaño no representa el
futuro flujo HTTP completo. No cambió el descriptor Web (115 inputs,
`0a201bb02f3ae6532c13a631784c90935539848942595552bc7c76895e8c1558`). No se repitió
el build Next ni toda la suite Foundry al no haber cambios de frontend/Solidity.

Las guías de Workers y viem orientaron la transacción, aislamiento por petición
y reutilización del compilador de UserOperation. Wrangler sólo valida tipos y
genera dry-run; sus avisos de secrets sin configurar corresponden al candidato
local y el harness usa bindings sintéticos. No se crearon/rotaron secrets.

**Límite:** outbox `pending` no significa envío, aceptación de bundler, receipt,
cuenta desplegada ni permiso de gasto. Los flags de recepción/gasto siguen
deshabilitados. Falta conectar un consumidor con lease, simulación, envío
acotado y reconciliación por evidencia; después HTTP/Next sobre perfiles
admitidos y activación/recovery/salida. No hubo cambios de UI, nueva prueba de
navegador, deploy remoto, inbox, fondos externos, commit ni push. E0–E4 abiertas.

## Incremento 27 — despacho con lease y frontera de envío persistente

El outbox de la primera UserOperation ahora tiene un procesador interno y un
transporte ERC-4337 acotado. Esta implementación no monta endpoints ni activa
colas/cron/redes: primero requiere el perfil admitido y después reconciliación
e integración con el flujo de creación de la app.

- `CreationDeliveryRepository` restaura el consentimiento inicial y la operación
  firmada desde D1. Usa el grant guardado al autorizar, no una identidad
  Firebase inventada ni un JWT en una cola. Expirar el token de login no borra
  un consentimiento aún vigente; deshabilitar al usuario o revocar su sesión
  impide cruzar la frontera de envío. Tampoco se amplía el plazo firmado.
- `0005` del candidato local añade el auth time del grant y el ciclo
  `pending → sending → accepted/uncertain`, además de `expired` para solicitudes
  no enviadas. Lease y compare-and-set evitan envíos concurrentes. Todas las
  escrituras verifican resultado y filas modificadas. No se migró D1 remota.
- Un lease vencido antes de enviar puede recuperarse. Después de persistir
  `sending`, una caída exige observación: ni timeout, error HTTP, hash distinto,
  respuesta truncada ni falta de acknowledgement D1 autorizan retransmitir.
  Un falso negativo conservador es posible si el worker cae entre el marcador
  y el HTTP; lo resuelve el reconciliador, no una suposición de "no enviado".
- `processCreationDelivery` comprueba la composición original al checkpoint
  suministrado por política y consulta chain, EntryPoint y simulación del bundler.
  No añade paymaster, no repricia, no modifica nonce/calldata, no usa state
  overrides ni hace retry transparente del transporte. El checkpoint por sí
  solo no acredita frescura/finalidad ni sustituye admisión independiente.
- RPC usa HTTPS sin redirects, límites de tiempo/cuerpo y envelope JSON-RPC
  estricto. Las respuestas abiertas se cancelan. Las referencias de configuración
  se copian antes del primer await; no hay promesas ni datos de una petición
  compartidos entre contextos de Workers.
- La aceptación exacta del proveedor queda persistida para observación. No
  crea una fila de cuenta activa ni habilita recepción/gasto. El sweep entrega
  sólo IDs de este proyecto, con backoff, intentos y tamaño acotados.

Las pruebas dirigidas usan D1 de workerd, perfiles/RPC sintéticos y firmas
P-256 efímeras reales. Cubren ocho entregas concurrentes, vencimiento y pérdida
del lease, revocación entre lectura y envío, recuperación de crash, corrupción,
respuesta abierta, validación de proveedor y fallas SQL en ambos lados de la
frontera de envío. No son evidencia de un bundler público, ERC-7562 ni firma
humana en iPhone/Android. No se modificó Next ni Solidity en este incremento.

Evidencia final local: `pnpm check:v3:wallet-api` terminó con exit 0, 243
pruebas runtime en nueve archivos (46 nuevas), tipos/bindings vigentes y
dry-run. `pnpm test:v3:unit` pasó sus 283 pruebas en 19 archivos; ESLint y Knip
terminaron sin incidencias tras retirar el export. Los cuatro casos adicionales
de body abierto y falla del marcador se incluyeron en la última corrida completa.
El runtime de tests usa la fecha soportada por workerd instalado, 2026-07-08;
esto no verifica despliegues remotos con fecha 2026-09-08.

El bundle del entrypoint público sigue en 895.35 KiB / 175.11 KiB gzip, porque
todavía no importa el despachador interno. No es el tamaño del flujo integrado
final. El descriptor Web se mantuvo en 115 inputs y
`0a201bb02f3ae6532c13a631784c90935539848942595552bc7c76895e8c1558`;
no se repitió build Next ni toda la suite Foundry, al no cambiar esas superficies.

Las guías Workers/viem orientaron el aislamiento, persistencia, preflight y
transporte exacto. Knip detectó y se retiró un export de tipo interno sin uso;
no se borraron archivos, ampliaron ignores ni añadieron dependencias.

**Pendiente inmediato:** reconciliación independiente de receipt/eventos,
estado de despliegue y bootstrap; integración HTTP/Next y consumidor/scheduler
sobre perfiles admitidos. `uncertain` aún no tiene resolución automática.
No hubo deploy, secretos nuevos/rotados, inbox, fondos externos, commit o push.
No se declara cerrada ninguna entrega E0–E4 por este incremento.

## Incremento 28 — receipt de creación y observación independiente

`shared/v3/creationReceipt.ts` verifica el receipt crudo de ejecución, no la
afirmación `success` del bundler. Contrasta accountId, account/factory/EntryPoint,
ambas autorizaciones, manifiesto inicial, nonce, paymaster cero, gas y orden
de eventos. Distingue una UserOperation revertida dentro de un bundle exitoso.
Rechaza eventos faltantes/duplicados, topics/data no canónicos, logs removidos
y discrepancias entre metadatos del receipt y logs. Un topic cero es válido
para el paymaster sin patrocinio; ese caso se comprobó con contratos en Anvil.

La observación comprueba la composición original del perfil y el runtime del
proxy mediante EIP-1898 en el bloque del receipt, y vuelve a comprobar su hash
canónico al terminar. Preserva el documento original y su pin, incluso cuando
el JSON tiene formato distinto. Una ausencia de receipt no habilita retransmisión.

`reconcileCreationObservation` consulta dos RPC y espera ambos resultados, sin
promesas globales ni retry transparente. Exige igualdad del resumen normalizado;
un error produce `unavailable` y resultados distintos producen `disagreement`.
Las URLs y diagnósticos del proveedor no se devuelven. Cada observación completa
usa 33 lecturas por RPC, además de una consulta al bundler si no existe hash
conocido. Hay límites por petición, cuerpo y ejecución total. La selección de
dos operadores independientes pertenece a la admisión, no a esta heurística
de IDs y hostnames diferentes.

34 nuevas unitarias y 19 pruebas workerd cubren estos invariantes. Las pruebas
Anvil existentes incorporan el mismo verificador sobre receipts reales locales.
No se modificó Solidity ni se usó un proveedor/red externo para esas pruebas.
No se declara finalidad ni política actual de la cuenta: ambos estados quedan
explícitamente `not_assessed`.

## Incremento 29 — reconciliación durable con journal y lease

La nueva migración **local V3** `server/v3/migrations/0006_creation_observation_journal.sql`
añade jobs de observación y un journal separado del outbox de envío. No se aplicó
esta migración a una base remota ni a Payments.

- `CreationObservationJournal` usa leases de 60 segundos, secuencia y token
  exclusivos. El append de evidencia y la actualización de la cabeza ocurren
  en un batch transaccional D1. Se comprueban ambas cantidades de filas: un
  resultado tardío, lease perdido o completion duplicado no escribe ninguno.
- Un fallo al actualizar la cabeza revierte el append. Los registros existentes
  no se actualizan y tienen un trigger que prohíbe UPDATE. No hay API de borrado;
  el checksum detecta deriva de contenido, no protege contra un administrador
  malicioso de la base ni sustituye una prueba de inclusión.
- `processCreationObservation` integra restauración del grant, consulta a los
  observadores y persistencia. El sweep detecta wake-ups perdidos y sólo devuelve
  IDs del proyecto configurado. No observa operaciones que el sistema nunca
  marcó como enviadas. Consultar un envío previo sigue siendo válido después de
  expirar o revocar el login: es lectura, no permiso de reenviar.
- Un resultado nuevo `unavailable`, `not_observed` o `disagreement` reemplaza
  la vista actual sin eliminar el historial. Nunca se sirve un éxito anterior
  como si fuera evidencia actual. Sólo un hash previamente observado puede
  reutilizarse como pista, incluso tras una falla intermedia del RPC; se verifica
  de nuevo y permite continuar si el bundler desaparece.
- La deserialización valida estructura exacta, IDs, cantidades, ventana temporal,
  orden de logs y flags. No acepta URLs/diagnósticos añadidos ni readiness
  fabricada. No se crea `account_instances`, no se modifica el outbox de envío,
  no se activa una red y no se emite una nueva transacción.
- Los errores/ausencias usan backoff hasta 300 segundos; una observación válida
  se programa a 30 segundos. Aún falta integrar la política final de finalidad,
  frescura, presupuesto RPC y terminación del seguimiento antes de activar cron.

26 pruebas nuevas en D1/workerd cubren reinicio, ocho consumidores simultáneos,
ocho completions duplicados, pérdida/vencimiento del lease, revocación, rollback
SQL, RPC discrepantes, ejecución revertida, cambios de bloque, corrupción y
validación estricta. Las fixtures usan firmas P-256 efímeras y RPC interceptados
en dominios `.invalid`; no son operaciones monetarias remotas ni pruebas humanas.

El guard de release detectó correctamente el nuevo archivo compartido
`creationReceipt.ts`: el descriptor anterior de 115 inputs ya no correspondía
al candidato. Se revisó y actualizó por `--describe`, sin saltar el guard:
116 inputs, `web-v3-91a0e82fc26986f26a9dc6986c47e37f52079825197bc128191babe46258c279`.
Se repitieron pruebas y build Next, aunque no cambió la UI. No es una
atestación de despliegue. Las guías Workers/viem orientaron el aislamiento,
consulta sin efectos y límites; Wrangler se usó sólo para tipos/dry-run y Knip
para comprobar referencias, sin añadir excepciones ni dependencias.

Validación final de los incrementos 28–29:

- `pnpm check:v3:wallet-api`: exit 0, tipos/bindings y 288 pruebas runtime en
  11 archivos, seguido de dry-run local. El primer intento se detuvo por el
  descriptor desactualizado; se corrigió y repitió, sin desactivar el guard.
- `pnpm test:v3:unit`: exit 0, 317 pruebas en 20 archivos, incluidas cuatro
  Anvil con contratos reales locales. No se repitió toda la suite Foundry al
  no modificar contratos en estos dos incrementos.
- `pnpm check:v3:web`: exit 0, 243 pruebas, inventario/assets, ESLint, tipos
  y build Next. No se afirma una nueva validación humana ni en dispositivos.
- ESLint de los nuevos servicios/fixtures y Knip: exit 0, sin incidencias.

El bundle del entrypoint público sigue en 895.35 KiB / 175.11 KiB gzip: todavía
no importa los procesos internos de envío/observación. No es el tamaño final
de la integración. Los tests usan workerd con su fecha soportada y bindings
sintéticos; los avisos de secrets no configurados no se resolvieron creando
credenciales ni conectando producción.

**Límite:** falta evaluar finalidad específica por red e inspeccionar la política
actual antes de promover bootstrap/recepción/gasto. El consumidor no está montado
en HTTP/Next, cola o cron ni existe perfil remotamente admitido. No se declara
resuelto el estado económico de `uncertain` solamente por un append. Admisión,
recovery/salida y aceptación integrada E4 continúan pendientes. No hubo deploy,
DNS/secrets, inbox, fondos externos, commit ni push.

## Incremento 30 — finalidad por red y evidencia durable

**Alcance:** candidato local. No hay cuenta activada, proveedor admitido, recurso
remoto creado, despliegue, correo real, cambio de secrets, commit ni push.

`shared/v3/finality.ts` añade un evaluador de checkpoints ligado a una política
con pin SHA-256 de sus bytes exactos. Se valida antes de consultar RPC y se copia
antes del primer await; no acepta una política aportada por el pagador/RPC.
El perfil independiente debe fijar network/genesis, mecanismo, ventana de
vigencia, edad máxima de latest/finalized, tolerancia de reloj y TTL de evidencia.
No existen políticas predeterminadas ni redes admitidas por esta implementación.
Los valores del fixture son sintéticos, no un SLA recomendado para producción.

| Mecanismo explícito | Semántica que debe acreditar la admisión |
|---|---|
| `ethereum_finalized` | Checkpoint de consenso reportado como finalized por el cliente Ethereum |
| `arbitrum_l1_data_finalized` | Datos de la transacción finalizados en la cadena padre; no equivale a assertion confirmada ni salida L2→L1 |
| `op_stack_l1_data_finalized` | Bloque L2 derivado de datos L1 finalizados; no sustituye el proceso de retirada |
| `avalanche_accepted` | Coreth interpreta finalized como accepted; no se confía implícitamente en latest ni en un conteo de bloques |

Fuentes primarias consultadas el 8 de septiembre de 2026:
[Arbitrum: finality](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/finality),
[Base: transaction finality](https://docs.base.org/specifications/transactions/transaction-finality),
[Coreth: block tags](https://github.com/ava-labs/coreth/blob/master/rpc/types.go),
[Coreth: selección de bloques](https://github.com/ava-labs/coreth/blob/master/eth/api_backend.go),
[configuración C-Chain](https://build.avax.network/docs/nodes/chain-configs/primary-network/c-chain).
Las referencias a ramas actuales explican el diseño: la admisión debe fijar
versiones/semántica de los proveedores efectivos y no tratar esas URLs mutables
como pins de artefactos o evidencia de conectividad real.

### Comprobación e integración

- Después del receipt independiente, ambos RPC consultan chainId/genesis y
  finalized; latest se lee después para evitar una falsa inconsistencia por
  avance normal del head. Se validan números, hashes y timestamps.
- Las alturas finalized pueden diferir. Se consulta la menor altura en ambos
  proveedores y se exige el mismo hash/timestamp. No se exige sincronía exacta
  entre proveedores ni se recorre una cantidad no acotada de ancestros.
- Se releen el bloque del receipt, las anclas originales y finalized al terminar.
  Un cambio/regresión no se convierte en éxito. La suposición explícita sigue
  siendo RPC honestos e independientes con semántica admitida; no hay verificación
  light-client de consenso o prueba criptográfica de ancestry en este lector.
- `finalized` y `pending` incluyen checkpoint y vencimiento; los fallos `stale`,
  `unavailable`, `disagreement`, `reorg_detected` no incluyen checkpoint utilizable.
  El TTL máximo estructural es 60 segundos y nunca excede la vigencia de política.
  Un consumidor debe comparar el pin con la política vigente y comprobar
  `now < expires_at` antes de promover estado; el historial no es autoridad actual.
- `processCreationObservation` exige política de finalidad. La función inferior
  de receipt permite omitirla para observar inclusión sin afirmar finalidad;
  no es un fallback de activación ni un camino de compatibilidad con V1/V2.
- El journal valida la estructura, identidad de bloque, estado y tiempo de la
  evidencia dentro del lease. Conserva su append/head atómico y no modifica
  autorización, outbox de envío ni `account_instances`.
- Una consulta indexada recupera el último receipt finalizado. Aunque después
  haya fallas RPC, dos respuestas que cambien su identidad producen
  `reorg_detected`, no una nueva finalidad aceptada silenciosamente. Una ausencia
  de receipt sigue siendo incertidumbre; nunca permiso para retransmitir.

La evaluación agrega como máximo 8 llamadas por operador, 16 en total, a las
33 por operador de verificación de receipt/composición: hasta 83 solicitudes
con la pista inicial del bundler. Se conserva el presupuesto global de 40 s,
lease de 60 s, timeout de 5 s y cuerpo de 128 KiB por RPC de ejecución. Todos los
hermanos iniciados se esperan, incluso si uno falla; no hay estado global,
fallback a safe/latest, polling del Home, retry de envío ni nueva autoridad.
El seguimiento aún no tiene consumidor/cron montado. Su detención al completar
bootstrap y el presupuesto operacional deben integrarse antes de habilitarlo.

Se ajustó directamente `server/v3/migrations/0006_creation_observation_journal.sql`,
que sólo existe como candidato V3 local: acepta la evidencia ligada al estado y
añade el índice de historial finalizado. Las pruebas crean D1 limpia con ese
schema. No es una migración aplicada en remoto; una D1 local descartable creada
con la versión anterior debe recrearse antes de usar este candidato, no asumirse
actualizada porque el nombre `0006` ya figure aplicado. No se tocó D1 V1/V2.

### Evidencia ejecutada

- `pnpm test:v3:unit`: exit 0, 363 tests en 21 archivos; 46 nuevos de finalidad
  cubren mecanismos, pin, vigencia, frescura, reorg, independencia de resultados,
  altura común, datos malformados, cancelación y espera de hermanos.
- `pnpm check:v3:wallet-api`: exit 0; bindings/tipos, 300 tests runtime en
  11 archivos y build dry-run. El journal tiene 38 pruebas; 12 nuevas cubren
  pin obligatorio, pending→finalized, fallas, invariantes históricas y corrupción.
- `pnpm check:v3:web`: exit 0; inventario/assets, 243 pruebas, lint/tipos y Next
  build. No hay nueva pantalla ni aceptación física de PWA/auth por este cambio.
- ESLint dirigido, Knip y comprobación de los 29 diagramas: exit 0. También
  `git diff --check` (avisos de normalización LF/CRLF) y revisión explícita de
  whitespace en los nueve archivos fuente del incremento; Git por sí solo no
  cubre los archivos V3 aún sin seguimiento.
- El descriptor de fuentes pasa a 117 entradas y digest
  `5a1dc9d689357aa49ad1463e5fa0f12603c9c49be7a2d4f5809988922f7fd706`.
  Incluir todo `shared` en ese descriptor obliga a reconstruir Web/Worker;
  esto no acredita un despliegue ni implica una nueva funcionalidad visible.
- El entrypoint público mantiene 895.35 KiB / 175.11 KiB gzip: no importa aún
  estos procesos privados, por lo que no es el bundle final de la integración.
- No se modificó Solidity ni se repitió toda Foundry. Las pruebas V3 incluyen
  los recorridos Anvil existentes; no hay evidencia nueva de RPC/consenso real,
  bundler remoto, iPhone, Android, recuperación o pago de extremo a extremo.

**Siguiente:** admisión real de políticas/proveedores, inspección de la política
de seguridad actual, proyección idempotente de bootstrap y consumo HTTP/Next.
Finalizar una transacción de creación no habilita gasto: hace falta activar el
factor independiente previsto por V3. Recovery/salida y Gate W/B/E4 permanecen
obligatorios. No se cierra E0–E4 con este incremento.

## Incremento 31 — política de seguridad actual y lector portable

El getter público `securitySnapshot()` devuelve 16 palabras (512 bytes) con
flags, versión, manifest/scope, ventanas, nonces y metadatos de la propuesta
pendiente. Es un wire format documentado, no una lectura de offsets privados.
Identidad/generación continúan verificándose mediante la composición/factory;
`securityPolicy()` devuelve los descriptores y thresholds canónicos. Ambas
lecturas deben usar el mismo bloque. No modifican storage, emiten eventos,
registran/actualizan passkeys, activan cuentas ni expiran propuestas.

`shared/v3/securityInspection.ts` valida primero el perfil actual de deployment,
proxy no delegado, implementación y bibliotecas. Después decodifica/re-encodifica
ABI exacto, valida el estado/política y verifica el código de cada verifier
contractual. Conserva nonces uint256 como strings sin pérdida, distingue creación,
bootstrap, política activa y recovery, y mantiene propuestas vencidas hasta una
transición explícita. La revisión uno debe coincidir con el compromiso inicial;
revisiones posteriores requieren además la comparación con el historial firmado
deseado. Observarlas no prueba por sí mismo ese historial ni factores utilizables.

El adaptador Wallet Core exige dos hosts distintos, resultados completos iguales,
deadline total de 30 s y transporte acotado a 5 s/128 KiB por llamada. Distinguir
hosts evita duplicación accidental, no prueba independencia de operadores.
Todos los hermanos se esperan; no se guarda estado request-scoped global. Una
inspección ECDSA usa 16 RPC por proveedor; hasta 16 verificadores contractuales
distintos elevan el máximo a 32 por proveedor. No se hace polling desde Home.

### Evidencia ejecutada

- `pnpm test:v3:contracts`: exit 0, 259 pruebas en 18 suites, sin omisiones;
  incluye fuzz e invariantes completos, snapshot sin escrituras/eventos,
  implementación no inicializada y recovery/freeze incluso después del vencimiento.
- `pnpm test:v3:unit`: exit 0, 408 pruebas en 22 archivos; 45 del lector nuevo
  más el recorrido Anvil con Account/EntryPoint reales y firma WebAuthn local.
- `pnpm check:v3:wallet-api`: exit 0, bindings/tipos, 313 pruebas workerd/D1 y
  dry-run; 13 nuevas cubren independencia de resultados, cancelación y timeout.
- `pnpm check:v3:web`: exit 0; 243 pruebas, inventarios, lint/tipos y Next build.
  No cambió una pantalla ni se probó un dispositivo físico por este incremento.
- Presupuesto medido: Account 19.919 B, biblioteca Security 19.475 B y Upgrade
  10.680 B. Se corrigió el exceso de tamaño del candidato intermedio mediante
  el getter fijo; NO se elevó el límite, redujo cobertura ni añadió otra biblioteca.
- `v3-storage-layout.mjs` confirma el layout anterior, hash
  `0x1db59f278cb6ee7f51095e572dc040bf37f9c1e4e63143a9fe0e0eacac97f3b7`.
  Verificación por contenido de 546 archivos Solidity correcta; los avisos de
  revisión Git de dependencias no se presentan como provenance resuelta.
- ESLint dirigido (incluido lector shared con parser tipado), Knip y
  `forge fmt --check`/lint de los dos archivos Solidity: exit 0.
- Descriptor Web: 118 inputs, digest
  `12b5506ef27567149ace6b7ddf0200bd55131bccaee94f06b03c8d2af8961726`.
  Build Web/Worker comprobado; no es evidencia de despliegue. El entrypoint
  público sigue sin importar los procesos privados de reconciliación.

No cambió D1, los tipos firmados ni la política de autoridad. El ABI/bytecode
nuevo exige artefactos/manifests admitidos antes de publicar. No hubo despliegue,
provisión, DNS, secrets, contratos remotos, correo real ni movimiento de fondos.
Faltan finalidad vigente integrada al resolver, proyección/activación, HTTP/Next,
recovery/salida y evidencia real de E4.

## Incremento 32 — finalidad vigente en el resolver de seguridad

`finalizedSecurityInspection.ts` integra el lector actual con la política de
finalidad fijada por pin. Elige el checkpoint común finalizado reciente de la
observación, no el bloque antiguo de creación. Después de leer la cuenta con
ambos proveedores vuelve a evaluar finalidad; conserva el mínimo de ambos
vencimientos y no prolonga evidencia mediante una segunda consulta.

Rechaza estado no finalizado, red/genesis/pin/mecanismo diferentes, evidencia
caducada, assessment anterior a la vigencia de la política, TTL excesivo y
checkpoint demasiado antiguo o futuro. El resolver `inspectOwnedWalletAccount`
vuelve a comprobar sesión, propietario, archivo de wallet e identidad/pin tras
los RPC. `WalletRepository` tampoco reutiliza identidades cuyo JWT ya venció.

El límite total sigue siendo 30 s, sin caché global. Para dos proveedores, la
inspección más revalidación usa 48 RPC con signers ECDSA y hasta 80 con 16
verificadores distintos; no incluye producir la evidencia de finalidad inicial.
No se invoca desde polling del Home ni se expone como proxy RPC público.

Evidencia ejecutada tras la corrección final del test de ventana de política:

- 51 pruebas dirigidas: 27 de finalidad/seguridad y 24 de ownership.
- Suite runtime completa: 344 pruebas, 13 archivos, exit 0.
- El test de política aún tiene TTL vigente: falla por assessment anterior a
  `valid_from`, no por una expiración accidental del fixture.

No cambian contratos, schemas de firma, D1, UI ni descriptor de release Web.
El chequeo sólo observa; no acredita historial firmado posterior, posesión de
factores, red admitida ni readiness. Proyección, activación, HTTP/Next,
recovery/salida y recorridos reales E4 siguen pendientes. No hubo acciones remotas.

## Incremento 33 — creación finalizada a proyección Consumer

`processCreationProjection.ts` consume el último resultado del journal y
restaura/verifica el grant firmado antes y después de RPC. Exige creación
exitosa/finalizada y política inicial bootstrap exacta en el checkpoint reciente:
manifest, versión uno, scope, política, ventana de creación cerrada, sin propuesta,
freeze ni nonces consumidos. No interpreta una política cambiada como bootstrap;
ese caso necesita reconciliación explícita del historial firmado.

La migración `0007_account_creation_projections.sql` añade un registro histórico
ligado al epoch del receipt y al snapshot de seguridad. Las cuatro entidades
Consumer y ese registro se escriben mediante un único batch D1. Sus condiciones
fijan propietario, consentimiento, head, ausencia de observación en vuelo y
vencimiento de la evidencia (también en SQL). Duplicados convergen, cambios de
head insertan cero filas y un error SQL revierte todas las escrituras. Una red
nueva reutiliza la Wallet/AccountIdentity del mismo propietario; no crea otra
identidad ni demuestra por ello sincronización multichain de seguridad.

El journal deja de incluir creaciones proyectadas en su sweep y rechaza nuevos
claims de observación para ellas. No hace polling de Home, no reenvía una
UserOperation ni mantiene una consulta RPC recurrente para una creación ya
registrada. La reconciliación de actividad/reorgs posterior no se elimina.
La exclusión de duplicados es atómica para las escrituras; projectors concurrentes
pueden realizar lecturas RPC redundantes antes de competir por el commit. El
consumidor debe acotar concurrencia/presupuesto; no se atribuye coalescing al SQL.

`deployment_state=active` sólo representa despliegue: la política sigue bootstrap.
El listado conserva `spend_readiness=not_assessed`, `receive_enabled=false` y no
publica la dirección. Una revocación de login impide leer como ese usuario, pero
no borra la proyección del resultado de un envío previamente consentido.

Evidencia local:

- 20 pruebas nuevas de proyección y 38 del journal: 58 dirigidas aprobadas.
- Regresión final: 364 runtime en 14 archivos y 408 unitarias V3 en 22
  archivos, ambas exit 0. No se volvió a ejecutar Foundry ni el build Web;
  los contratos y fuentes Web no cambiaron en los incrementos 32–33.
- D1 real en workerd, firmas P-256 efímeras reales, RPC/receipts sintéticos.
  No equivalen a un pago ni a una ceremonia en un dispositivo físico.
- Cubren identidad reutilizada entre redes, intento de reasignación, concurrencia,
  rollback/reintento, nonce/ventana distintos, fuente caducada, head reemplazado,
  observación en vuelo, consentimiento modificado, cancelación y fin del sweep.
- TypeScript y ESLint dirigidos aprobados. Bindings vigentes y dry-run del
  entrypoint aprobado: 895,40 KiB / 175,12 KiB gzip. Ese bundle NO incorpora
  todavía los jobs privados; su prueba de ejecución corresponde a workerd.
- Knip, detección de ciclos, 29 SVGs, `git diff --check` y comprobación explícita
  de whitespace/conflictos en nueve fuentes nuevas/modificadas: correctos.
  El aviso de Wrangler sobre secrets ausentes usa configuración local vacía;
  las pruebas inyectan valores sintéticos. Este incremento no configuró ni creó
  credenciales reales ni probó proveedores autenticados remotos.

No cambian contratos, tipos de firma, Web ni su descriptor de 118 inputs. `0007`
sólo se aplicó en bases locales de prueba. No se desplegó, provisionó, versionó
en Git ni modificó DNS, secretos, correo o fondos reales.

Faltan consumidor privado/HTTP/Next, red y proveedores admitidos, activación con
factor independiente, recovery/salida y recorridos E4. No se cierra E0–E4.

## Incremento 34 — inventario de credenciales persistidas y pantalla Next

La pantalla de enrolamiento conservaba sólo el intento en memoria. No existía
un GET que permitiera consultar las credenciales registradas tras recargar.
Se añade la lectura de registros como dependencia del consentimiento de
creación: no sustituye creación, activación o gestión onchain de signers.

Implementación:

- [Contrato de inventario](../../shared/v3/credentialInventory.ts): forma
  estricta, IDs únicos, scope exacto, máximo 16, tiempos coherentes, transports
  conocidos, flags de respaldo consistentes y copia inmutable.
  El repositorio valida las fechas contra el reloj servidor; el cliente sólo
  exige fechas representables. Un teléfono con reloj atrasado no pierde la
  consulta por ello, y una fecha de registro no demuestra vigencia monetaria.
- [Repositorio](../../server/src/v3/enrollment/repository.ts) y
  [ruta](../../server/src/v3/enrollment/route.ts):
  `GET /app/v1/security/credentials`, sesión Firebase del proyecto propio y
  control de revocación/vencimiento antes y después de consultar D1 primaria.
  El resultado 17 señala datos inválidos; no se trunca silenciosamente.
  No acepta selección de usuario/RP por query ni publica claves, credential IDs,
  sign counters, hashes de pruebas o subjects. No escribe ni poda al leer.
  La poda del intento temporal no elimina el registro permanente.
- [Cliente HTTP](../../apps/web/src/wallet/credentials.ts): GET no-store,
  bearer de la sesión capturada, 15 segundos incluyendo token/cuerpo, 32 KiB,
  sin redirects, bootstrap automático o retry. `SESSION_REQUIRED` no es lista
  vacía ni recuperación necesaria.
- [Estado por componente](../../apps/web/src/wallet/credential-inventory-store.ts)
  y [vista Next](../../apps/web/src/wallet/CredentialInventory.tsx): recarga
  inicial, actualización tras enrolamiento confirmado y botón explícito;
  cancelación/descarte al cambiar de sesión, incluso reemplazo con el mismo UID.
  No usa localStorage, temporizador recurrente ni `navigator.credentials`.
  Error de consulta no muestra un cero ni conserva una cuenta anterior.

La vista dice **registradas**, no **activas**. `device_availability=unknown` y
`onchain_authority=not_assessed` son explícitos. Los flags BE/BS describen lo
informado al completar el registro: no prueban disponibilidad actual,
sincronización entre gestores, identidad de proveedor o independencia de un
factor de recuperación. No se añadió un botón de retirada ficticio.

Evidencia local del 8 de septiembre de 2026:

- 19 pruebas runtime adicionales, 383 totales en 14 archivos; D1 real en
  workerd con JWT y P-256 efímeros. Sin proveedores o fondos reales.
- 31 pruebas Web adicionales, 274 totales. Incluyen contrato, errores,
  bounds/deadline, cancelación, respuesta tardía, cambio de identidad y ausencia
  de polling. Regresión de protocolo: 408 unitarias V3 en 22 archivos.
- TypeScript Web/Worker/runtime y ESLint dirigido aprobados. Knip señaló una
  exportación innecesaria de error interno, que se retiró; Knip y ciclos pasan.
- Build Next y Worker **dry-run** aprobados; Worker 899,66 KiB / 175,94 KiB gzip.
  Bindings vigentes; 29 SVGs y procedencia de landing/iconos verificadas.
- Descriptor Web actualizado desde `--describe`: 122 inputs,
  `web-v3-f225fbbacd748c65adfd3530dc26b12e3a3ef2b754995e8c45bc0b3435d87b9b`.
  Es identidad de fuentes, no atestación del despliegue.
- Recorrido real de UI con Playwright/Chromium y autenticador virtual:
  montaje sin mutaciones → crear/probar llave → inventario 0→1 → recargar
  conservando 1 → usuario B sin datos de A → volver a A conservando 1 → fallo
  GET 503 con aviso de incertidumbre → retry correcto → detalles ES/EN.
  Harness con identidad sintética y almacenamiento en memoria; verificador
  criptográfico real. La persistencia D1 se prueba por separado en runtime.
- Captura revisada: `output/playwright/v3-credential-inventory-mobile.png`.
  Viewport 390×844, scrollWidth 390, sin overflow horizontal. El contador de
  registros permaneció en 1; no hubo consultas adicionales durante la muestra
  inactiva de 1,5 segundos. Esto no es un SLO ni aceptación en iPhone/Android.
  Console: aviso Chromium por ES256-only (perfil P-256 intencional) y el 503
  provocado para comprobar el estado de error; sin excepción de la UI observada.

No se cambiaron contratos, migraciones, DNS, secrets ni recursos remotos.
No se desplegó ni se activaron redes, pagos, recovery o accounts mediante este
inventario. E0–E4 conservan el alcance y gates completos.

## Incremento 35 — consentimiento inicial HTTP y cliente de sesión

- [Contrato de transporte](../../shared/v3/initializationWire.ts): campos
  exactos, codificación acotada/canónica y reconstrucción del digest usando el
  documento y scope fijados por el cliente, no un perfil enviado por el servidor.
- [Rutas](../../server/src/v3/wallets/initializationRoute.ts): POST de preparación
  y autorización bajo `/app/v1/account-initializations`; JWT/owner, CORS, JSON
  acotado, cabeceras de compatibilidad de cuenta y perfil de red habilitado.
  No acepta claves públicas, RPC, factory, scope ni checkpoint en el cuerpo.
- El repositorio entrega metadata de firma sólo al propietario, revalida la
  sesión después de D1 y conserva CAS, expiración e idempotencia. El credential
  ID sólo se entrega en esta respuesta privada de consentimiento, no en el
  inventario. No retorna firmas almacenadas, dirección de recepción ni datos Firebase.
- [Cliente Web](../../apps/web/src/wallet/initialization.ts): transporte
  sin cookies/redirect/retry, digest reconstruido y firma verificada localmente;
  la sesión se captura antes de la carga diferida y se comprueba antes/después
  de token y respuesta. Construir el cliente no pide token ni abre WebAuthn.
- La observación fresca es una dependencia privada obligatoria de la composición
  del servidor. **No está conectada a un perfil real.** El entrypoint usa catálogo
  vacío y política de cuenta cerrada. No se añadieron redes ni flags de bypass.

Evidencia de este incremento: 18 nuevas pruebas HTTP con JWT/P-256 reales y D1
local (el observador externo es un stub explícito); 24 de contrato/cliente y
dos de captura de sesión. Totales: **401 runtime V3, 408 unitarias V3 y 300 Web**.
TypeScript Web/Worker/runtime, lint dirigido, Knip/ciclos y build Next pasan.
El descriptor Web cubre 124 entradas y fue actualizado desde `--describe`.
No se ejecutó un nuevo recorrido de navegador/dispositivo ni un Worker dry-run
en este incremento; el runtime sí compiló y ejecutó el entrypoint nuevo.

Pendientes: observador de composición/finalidad conectado con admisión real,
selección de credencial y confirmación en pantalla, consentimiento UserOperation,
consumidor durable, activación, recovery/salida y recorridos E4. La respuesta
`authorized` sólo confirma consentimiento guardado: no crea wallet onchain ni
habilita recibir/gastar. No hubo commits, despliegues, cambios de secrets/DNS,
migraciones ni operaciones monetarias.

## Incremento 36 — selección y consentimiento inicial en Next

El turno conceptual anterior no cambió implementación. Este incremento conecta
el tramo de E2/E3 a la pantalla de Seguridad; no reduce el alcance E0–E4.

- `AccountInitialization` usa las referencias ya cargadas por el inventario;
  no inicia una segunda consulta ni WebAuthn al montar. El código se carga
  diferido y sólo aparece habilitado si existe un pin compilado en la release.
  `creation-release.ts` conserva **staging y production nulos**.
- `InitializationFlow` captura la sesión, fija request ID/salt/referencia y
  reconstruye el digest sin aceptar `response.expected` como autoridad.
  Muestra red inicial, generación, vencimiento y límites de bootstrap. No
  publica dirección de depósito ni anuncia creación o permisos monetarios.
- La confirmación llama a WebAuthn antes de cualquier await de token/red.
  El adaptador compartido se llama ahora `requestPasskeyProof`: enrolamiento,
  consentimiento inicial y UserOperation siguen siendo autorizaciones distintas.
- Preparación y solicitudes tienen plazos; abortar/cambiar sesión desmonta
  trabajo y rechaza respuestas tardías. Un prepare incierto reutiliza ID/salt.
  Tras enviar la prueba, detener espera conserva el mismo intento para replay
  explícito. No declara que detener la UI deshaga un registro remoto.
- Mientras el consentimiento está abierto no se permite registrar otra llave
  ni refrescar el inventario y desmontarlo accidentalmente. Cambiar idioma no
  reinicia la autorización; cambiar identidad elimina su información.
- Los errores HTTP distinguen expiración, conflicto, límite, perfil no
  disponible y resultado incierto. No hay retry automático ni fallback V1/V2.

Evidencia ejecutada:

- Web: **326 pruebas en 12 archivos** (19 nuevas del flujo, siete de códigos
  HTTP). V3: **408 unitarias y 401 runtime**; estos últimos conservan pruebas
  JWT/P-256/D1 locales. Las fixtures puras de despliegue se separaron del
  adaptador Vitest para reutilizarlas en el harness, sin cambiar su contenido.
- TypeScript Web/Worker/runtime, lint dirigido, Knip/ciclos y build Next pasan.
  Descriptor Web: 127 inputs; hash
  `7d0c2d8db93fe95345828688ec4a68d8ff17170e2cd06fd520944cb5809cac74`.
- Harness `node apps/web/test/serve-enrollment.mjs`, Chromium/CTAP2 virtual,
  UI React real, verificación criptográfica real, identidad y Maps sintéticos.
  Registro/posesión → revisión → firma → 503 después de registrar → replay:
  contadores finales `initializationPrepared=1`, `initializationAuthorized=1`,
  `initializationReplayed=1`, `rejected=0`. Se confirmó que la UI no declara
  cuenta desplegada. Cambiar a usuario B elimina consentimiento/lista de A.
- ES/EN a 390×844: `scrollWidth=390`, sin desbordamiento; capturas inspeccionadas
  en `output/playwright/v3-initialization-review-36.png` y
  `output/playwright/v3-initialization-done-en-36.png`. Consola: 503 simulado
  esperado y aviso Chromium sobre selección ES256 sin RS256; no excepción UI.
  Se cerraron el navegador y los servidores de prueba iniciados en este turno.

Límites: no hay perfil/observador de red admitido ni activación real. El replay
de esta pantalla vive en memoria: restaurar el proceso de creación tras cerrar
la pestaña exige conectar la consulta durable de operaciones, no guardar firmas
en localStorage ni crear otra cuenta automáticamente. Faltan entrega
UserOperation, activación, pantallas recovery/salida y aceptación humana E4.
No se repitió Foundry/`verify:all`, no cambió Solidity ni hubo commit, deploy,
secrets/DNS, migraciones remotas o movimientos de fondos.

## Incremento 37 — historial y restauración tras recargar

Estado: implementación local E2/E3; E0–E4 siguen abiertas. El turno conceptual
anterior fue aclaración sin implementación; este incremento completa el tramo
de restauración del consentimiento, no el proceso completo de creación.

- Dos lecturas autenticadas: historial paginado (10 filas, cursor estable por
  fecha/ID) y restauración por ID propio. No crean sesión ni ejecutan RPC,
  transacciones, outbox o autorización. La lista sólo expone metadatos; la
  restauración verifica nuevamente la prueba guardada sin entregarla al cliente.
- Revocación/expiración de identidad se comprueba antes y después de D1. El
  perfil de release se fija independientemente; uno retirado puede aparecer
  en el historial, pero no proporciona inputs de firma si no está disponible.
  Las consultas usan compatibilidad de identidad; POST conserva admisión de
  cuenta y observación fresca. Se prueba OPTIONS también con cursor GET.
- `InitializationHistoryStore` mantiene una página, plazos y sesión local al
  componente. Error no equivale a vacío. No ofrece nueva configuración hasta
  revisar todas las páginas sin solicitudes firmadas o pendientes; esta regla
  UX no es un lock global ni sustituye autorización del backend.
- `InitializationFlow.restore` recompone el digest con pin/scope originales,
  conserva ID/salt y exige gesto para firmar una solicitud pendiente. Una
  autorización ya guardada se presenta sin otra firma ni reenvío. Detectar un
  registro de UserOperation dirige al proceso existente, sin declarar que fue
  enviada, finalizada o activada. Expirar nunca amplía la autoridad original.
- Sesión sustituida, StrictMode, cancelación, respuesta tardía y timeout no
  conservan una pantalla de otro usuario ni permiten un bucle de paginación.
  Las guías Workers/React orientaron lecturas sin estado global y efectos sin
  firmas; Knip se ejecutó sólo como verificación, sin borrar archivos.

Evidencia local: 355 pruebas Web en 13 archivos, 411 pruebas runtime V3
(JWT, P-256 y D1 locales, perfiles y observador sintéticos), 408 unitarias V3.
TypeScript Web/Worker/runtime, lint, Knip/ciclos y build Next pasan. Descriptor
Web: 129 inputs, hash
`cf195deed0710b03ee7c5ee65372a9c9b674c7e9e95279463e7647538ba5262d`.
El harness Chromium usa React y
verificación P-256 reales, con identidad/Maps sintéticos y CTAP2 virtual:
preparar → recargar sin firmar → restaurar → firmar → respuesta 503 simulada
después de guardar → recargar → leer `authorized`, sin nuevo POST ni firma.
El primer recorrido produjo `initializationPrepared=1`,
`initializationAuthorized=1`, `initializationReplayed=0`,
`initializationRestored=2`, `rejected=0`. Cambiar idioma o volver al historial
no reinició la operación; cambiar a B eliminó los datos de A. En 390×844 se
midió `scrollWidth=390` y ambas áreas de storage vacías. El aviso ES256/RS256
del autenticador y el 503 inducido no se cuentan como fallos inesperados.

No hay prueba Firebase remota, cuenta/red admitida, dispositivo físico ni
transacción monetaria. No se ejecutó Foundry/`verify:all`, no cambió Solidity,
no se creó migración ni hubo commit/deploy/secrets/DNS. El consentimiento
restaurado no cierra E3/E4: faltan HTTP/UI de UserOperation, entrega/observación
con proveedores admitidos, activación con factor independiente y recovery/salida.

## Incremento 38 — UserOperation de creación por HTTP y cliente de sesión

La continuación anterior respondió una consulta de arquitectura sin editar:
**sin progreso de implementación**. Se revalidó el worktree y el contrato del
26/35/37 antes de conectar el siguiente paso. Este incremento sí modifica
Wallet Core, wire compartido y el cliente de sesión Next.

- `creationOperationRoute.ts` monta GET/POST sobre
  `/app/v1/account-initializations/:id/creation-operation` y POST `/authorize`.
  El GET es propio, sin RPC ni escrituras, con compatibilidad de identidad y
  perfil histórico fijo. Las mutaciones conservan admisión de release/red,
  origen exacto, JWT Firebase y ownership revalidado. No crean una identidad
  de usuario ni seleccionan otra cuenta al encontrar un error.
- El único input económico de preparación es `maximum_gas_charge`, decimal
  canónico en unidades atómicas nativas. Estimación y observación se inyectan
  desde composición del servidor, no desde HTTP. El límite insuficiente da
  422; estimaciones inválidas, RPC fallido o cap sustituido no producen estado.
  Payload máximo 8192 bytes, lectura acotada y límite de 15 s para proveedores;
  un proveedor que termina después del aborto no continúa con el INSERT.
- La vista devuelve la prueba **inicial** al propietario, exclusivamente para
  reproducir factoryData. Esto es distinto del historial/restauración de
  consentimiento del 37, que no revela assertions. No salen la firma de
  operación, lease, estado interno completo ni identidad Firebase.
- `creationOperationWire.ts` valida estructura, decimales, ID, estados y
  vigencia; recompone ambas capas de hash con perfil, origen, llave y salt del
  consentimiento ya verificado. El cuerpo de respuesta no puede proporcionar
  su propio pin, calldata, dirección de provider o permiso de gasto.
- La segunda firma WebAuthn autoriza sólo la operación exacta. La firma de
  configuración inicial no puede sustituirla. D1 sigue verificando las dos
  pruebas y usando CAS/batch atómico con un único outbox. Un replay de la
  misma firma guardada es consulta, no nueva autorización ni reenvío: no
  requiere RPC y conserva plazo/estado incluso después de vencer.
- El cliente Next se carga mediante `BrowserAuth.creationOperation`; captura
  la sesión y la comprueba antes/después de cada método. Revalida el wire y
  firma antes del POST, clona inputs antes de esperar el token y distingue
  lectura de autorización. No tiene WebAuthn implícito, localStorage,
  navegación, polling, financiación ni reintentos automáticos.

Las guías Workers orientaron bindings D1, estado por petición, payload/plazos
acotados y pruebas en workerd; las de React/Next mantuvieron la carga diferida
y separación de acciones. Knip se usó sólo para verificar dependencias/ciclos,
sin borrar archivos ni modificar su configuración. Se cerraron únicamente el
Chromium `gp-v3-restore37-final` y el helper local 62271 de la iteración anterior;
la comprobación de puerto 4178 dio cero listeners. No es nueva evidencia de UI.

Evidencia ejecutada después de los cambios:

- Web: **385 pruebas / 14 archivos**, tipos y lint; build Next 16.3.4 correcto.
- Worker: **429 runtime / 16 archivos**, con JWT/P-256/D1 reales locales,
  observador/estimador sintéticos. Incluye 18 nuevas pruebas HTTP y las 23
  existentes de operación/outbox. Cubren firma distinta, propiedad, revocación
  durante estimación, aborto, rollback, estado corrupto, replay sin recotizar,
  expiración, CORS, campos extra y límite de coste.
- Unitarias V3: **408 / 22 archivos**. Tipos Worker y test-worker, lint dirigido,
  Knip/ciclos y `git diff --check` pasan; sólo avisos LF→CRLF de Git.
- Descriptor Web: **131 inputs**, hash
  `5366921f2206ff599288807ecb2eca8e8b8cdf1150afe10dcf002deb3d8e1311`.
  Se actualizó tras revisar las fuentes; el guard lo verifica sin fingir un
  bundle remoto ni modificar el catálogo de perfiles admitidos.

No se ejecutó Foundry, `verify:all`, dry-run Wrangler ni un nuevo recorrido
de navegador. No cambió Solidity ni se creó migración. No hubo commit/push,
provisioning, DNS, secrets, inbox, fondos o deploy. Ningún estado devuelto es
prueba de creación/finalización/activación. Falta integrar la segunda pantalla
de consentimiento con este cliente, cotización y financiación reales admitidas,
consumidor privado/seguimiento, renovación explícita conservando identidad,
activación con factor independiente y recovery/salida. E0–E4 permanecen abiertos.

## Trigésimo noveno incremento: confirmar y consultar creación en Next, 8–9 de septiembre de 2026

El turno inmediatamente anterior respondió la consulta sobre fusionar Next:
fue evaluación, no avance de implementación. Este incremento retoma el objetivo
íntegro E0–E4 y conecta la interfaz con el recurso HTTP/cliente del 38.

Cambios implementados:

- `InitializationFlow` conserva sólo el consentimiento público validado después
  de una respuesta autorizada, no la primera assertion. Mantiene la sesión
  capturada también después de completar el consentimiento y la invalida ante
  reemplazo del usuario Firebase, aunque el UID coincida.
- `CreationOperationPanel` y `CreationFlow` consultan la operación propia al
  montarse. El montaje, historial y cambio de idioma no crean operaciones ni
  abren WebAuthn. Un historial que afirma operación existente y luego devuelve
  404 no se convierte en permiso para reemplazarla.
- Preparar, confirmar y consultar son acciones distintas. El controlador
  recompone calldata/hash/digest desde el wire y el consentimiento original,
  sin confiar en la metadata calculada por otro objeto. La segunda ceremonia
  se invoca síncronamente desde el gesto, antes de fetch/token/import/await.
  Se verifica P-256 otra vez antes del POST; la firma inicial no sirve como
  autorización de la operación. No hay storage persistente de pruebas.
- El límite decimal se convierte con BigInt sin floats, redondeo, notación
  exponencial o separadores de miles. Se admite punto o coma decimal. Las
  etiquetas ETH/AVAX de las tres testnets son sólo presentación, no un
  catálogo de despliegues admitidos ni un fallback a otra red. El límite del
  EntryPoint no se presenta como coste total o comisión comercial. Este
  trayecto existente se financia desde la cuenta, sin patrocinio; no se pide
  al usuario financiar una dirección todavía no habilitada. La experiencia
  comercial definitiva sigue pendiente del proveedor/patrocinio admitido.
- Una preparación incierta se consulta por el mismo ID. Si aún no aparece,
  sólo se puede reintentar el mismo límite; la consulta tampoco puede cambiar
  silenciosamente un cap aprobado en la pantalla. Tras una autorización
  incierta, un GET autorizado termina la espera sin otro POST; si sigue
  preparado y vigente, un botón explícito permite reenviar la misma prueba
  conservada en memoria, sin pedir otra firma.
- Cancelación, reloj/plazo, sesiones, StrictMode y desmontaje tienen guardas
  contra respuestas tardías y doble click. Hay límites de espera y bloqueo
  de recarga mientras se está trabajando. Se corrigió una promesa de aborto
  sin handler detectada por Vitest al cambiar de sesión antes de la ceremonia.
- La UI ES/EN pliega los detalles ya confirmados, distingue autorización y
  entrega de creación/activación efectiva, y deja recibir/gastar deshabilitados.
  No añade polling en Home, recuperación automática ni un nuevo transporte de wallet.

Evidencia final:

- **434 pruebas Web / 15 archivos** (49 adicionales), **408 unitarias V3 /
  22 archivos** y **429 runtime / 16 archivos**. Sin errores no manejados en
  la última ejecución. Tipos Web/Worker/test-worker y lint Web pasan.
- Build Next 16.3.4 y descriptor de **134 inputs** verificados:
  `f64a67d10da2421b1e42d7c34b2aefb46bb24af5c31b3a27ca0ce545d7b43430`.
  Knip/ciclos, `git diff --check` y escaneo explícito de nueve fuentes nuevas
  o modificadas sin conflictos/trailing whitespace pasan. Knip no borró nada.
- Chromium `gp-v3-creation39` ejecutó el UI React real con autenticador virtual
  CTAP2/P-256. Identidad, persistencia, estimación y transporte del helper son
  sintéticos; no se usó Firebase real, D1 remoto, RPC ni bundler real.
  El helper fue reiniciado tras los últimos cambios para repetir el recorrido
  sobre las fuentes finales, no sobre un bundle anterior.
- Recorrido final: crear/probar llave → consentimiento inicial → preparación
  guardada seguida de 503 simulado → GET → recargar antes de firmar → restaurar
  misma operación → segunda firma guardada seguida de 503 → GET autorizado →
  usuario B sin operación/llaves de A → volver a A → lectura y cambio ES/EN.
  Contadores finales: una preparación y una autorización inicial, **una sola
  operación preparada, una autorizada, cero replays**, cinco lecturas de
  operación. El primer recorrido también verificó rechazo 422 de un cap bajo,
  sin aumento automático. No se infiere rendimiento RPC ni confirmación onchain.
- Captura completa inspeccionada a 390×844, sin desborde horizontal:
  `output/playwright/v3-creation39-authorized-mobile.png`. La captura parcial
  anterior `v3-creation39-review-mobile.png` quedó recortada y no se usa como
  evidencia de paridad visual. Snapshots de
  historial, estado y sesión están en `.playwright-cli/` (artefactos ignorados).
  Los errores HTTP de consola fueron 404/422 esperados o 503 simulados; no
  excepciones de la aplicación. La advertencia Chromium sobre RS256 no obliga
  a admitir un algoritmo que el perfil P-256 de Account no soporta.

Las guías React/Next mantuvieron acciones en eventos y estado por componente;
Playwright orientó la verificación por navegador, y Knip comprobó dependencias
sin limpieza automática. No se ejecutó Foundry, `verify:all`, despliegue ni
dry-run Wrangler en este incremento. Solidity, D1 schemas y Worker runtime no
cambiaron. No hubo commit/push, DNS, creación/rotación de secretos, correo ni
fondos. Los perfiles reales continúan cerrados: la UI y estas pruebas no
completan E0–E4 ni habilitan pagos.

Se cerró el navegador de prueba `gp-v3-creation39` y se detuvo únicamente el
helper local propio (sesión 86852). Comprobación final: puerto 4178 sin listeners.

## Incremento 40 — cola y scheduler privados de creación

Fecha: 9 de septiembre de 2026. La respuesta de arquitectura Next previa fue
una evaluación, no implementación. Este incremento sí modifica código y estado
de pruebas local; no cambia la autorización remota ni los gates E0–E4.

Se conectaron los tres procesadores ya existentes: entrega de la UserOperation
exacta, observación independiente y proyección bootstrap. `creationJobs` guarda
el seguimiento privado en D1 mediante `0008`; no reutiliza el scheduler V1/V2.
El entrypoint V3 tiene handlers de cola/cron y wake-up best-effort posterior a
autorizar. Un cierre de pestaña no cancela el trabajo autorizado y persistido.

Propiedades verificadas:

- Tres escrituras explícitas y atómicas: autorización, outbox y job. El primer
  ensayo con trigger mostró que D1 contaba su escritura adicional; se sustituyó
  por un tercer statement, conservando `meta.changes` estricto. La prueba de
  fallo del tercer insert verifica que no quedan autorización ni outbox.
- Payload de cola limitado a cuatro campos sin JWT/proofs ni parámetros de red.
  Admisión por proyecto/perfil en D1 y callbacks de servidor, no datos del pagador.
- Tokens y leases de 120/180 s para notificación/ejecución. Un mensaje perdido
  se recupera mediante cron; uno repetido o vencido no duplica el envío ni puede
  liberar el lease de un reemplazo. Un error tardío de enqueue tampoco libera
  un trabajo que el consumidor ya comenzó.
- Presupuesto de ejecución 120 s; callback que ignora el aborto queda acotado
  y no puede enviar cuando devuelve su resultado tardío. Batch de dos mensajes
  en serie y dos consumidores concurrentes; sweep de veinte jobs como máximo.
- Reintentos espaciados persistidos; ocho fallos o 24 h sin resolver evidencia
  requieren revisión. No se declaran éxito/fallo económico ni readiness por timeout.
  La configuración local incluye DLQ y retry de almacenamiento; no hay DLQ remota.
- Crash después del marcador de envío, respuesta ambigua del bundler y pérdida
  de confirmación D1 no vuelven a enviar. Una proyección ya confirmada se recupera
  sin más RPC si se perdió la confirmación del job. Revocar la sesión impide
  nuevos envíos pero conserva reconciliación de los ya enviados.
- Logs de atención con contadores/categorías, sin URLs de proveedor, firmas,
  errores upstream, email o IDs del usuario. No se añade polling al Home.

La suite nueva usa el runtime Workers, D1 real local, mensajes de prueba de
Cloudflare y firmas P-256 efímeras. RPC/bundler/finalidad son sintéticos: no
representan una admisión de artefactos ni una red real. El resolver de admisión
del entrypoint permanece cerrado, al igual que HTTP/Web. No se cambió Solidity,
frontend ni descriptor Web. Los 134 inputs conservan el release
`f64a67d10da2421b1e42d7c34b2aefb46bb24af5c31b3a27ca0ce545d7b43430`.

No hubo commit/push, correo, fondos, despliegue, DNS, creación/rotación de
secrets ni migración remota. La configuración de cola/cron es **local** y no
autoriza provisionarla al ejecutar este incremento. Faltan UI/API de seguimiento,
alertas/redrive operativo y recursos/proveedores admitidos antes de uso remoto.
La guía Workers orientó persistencia y presupuestos; Wrangler generó los tipos
y validó el empaquetado sin desplegar. Knip detectó un tipo exportado sólo para
uso interno; se hizo privado, sin eliminar archivos ni dependencias.

Validación final de este incremento:

- **452 runtime V3 / 17 archivos**, incluyendo **23 pruebas nuevas** del ciclo
  de jobs; última ejecución completa exitosa. **408 unitarias V3 / 22 archivos**.
- TypeScript Worker y test-worker, ESLint dirigido a los siete archivos TS
  nuevos/modificados, Knip y ciclos: sin errores. Tipos Wrangler regenerados y
  `cf-typegen:v3:check` conforme a la configuración local.
- `build:v3:local`: release Web verificado y `wrangler deploy --dry-run`
  final exitoso; 1798.98 KiB de bundle y 347.18 KiB gzip. No fue un deploy.
- `git diff --check` sin errores (avisos LF/CRLF); escaneo explícito de las seis
  fuentes nuevas sin conflictos ni espacios al final. No se depende de que
  Git incluya los archivos todavía untracked para comprobarlos.
- No se repitieron Next/Chromium/Foundry ni `verify:all`: no cambiaron frontend,
  contratos ni shared. La evidencia Web de 434 tests y navegador es del 39,
  no una nueva ejecución ni evidencia de login/operación remota.

La configuración y los handlers pasan localmente con providers sintéticos;
eso no constituye cierre de E0–E4 ni habilitación para crear cuentas reales.

## Incremento 41 — seguimiento de creación visible en Next (9 septiembre 2026)

La consulta propia `GET /app/v1/account-initializations/:id/creation-operation`
incluye ahora `lifecycle`: estado acotado del job, razón de revisión, última
observación y registro histórico de bootstrap. No añade un endpoint público de
jobs ni una mutación. Una única consulta SQL une operación/outbox, head del
journal, procedencia de proyección y propiedad; ambas pruebas P-256 siguen
verificándose y el login se revalida antes de responder. La consulta no adquiere
leases, expira grants, hace RPC, firma, publica a la cola ni escribe en D1.

El parser del journal se comparte con esta lectura en
`creationObservationRecord.ts`; no se crea una segunda definición de evidencia.
El head más reciente manda: ausencia, desacuerdo o indisponibilidad no se
sustituyen con una observación exitosa anterior. Las proyecciones verifican
fuente, hashes, identidad/red/propietario y configuración bootstrap registrada.
Los hashes detectan deriva de almacenamiento; no son una prueba contra un
operador de base de datos comprometido ni reemplazan observación actual.

**Cambio deliberado del contrato local V3:** el recibo de operación reemplaza
`account_deployed: false` por `deployment_assessment: not_assessed`. El campo
anterior era falso incluso después de una proyección completada. El registro
histórico se entrega en `lifecycle.bootstrap`; ni éste ni la aceptación por el
bundler habilitan recibir/gastar. Los comprobantes de consentimiento inicial
son otro recurso; este cambio corresponde a la operación de creación.

Next presenta cola, entrega, seguimiento, revisión y «Cuenta creada: activación
pendiente». Fecha de consulta, fecha de observación y validez de evidencia se
distinguen. Caducar la evidencia no borra un hecho histórico ni renueva su
validez. La consulta manual sustituye el estado visible; no hay polling, firma
en mount ni reenvío automático. Un fallo de lectura no muestra éxito nuevo.
Cambiar sesión borra el estado; retroceder el epoch, cambiar una observación
inmutable o perder un bootstrap previamente visto produce conflicto.

Evidencia ejecutada:

- **465 runtime V3 / 18 archivos**, incluidos **13 nuevos** de lifecycle con D1
  real y RPC sintético. Cubren proyección, expiración, revisión, privacidad,
  propiedad, head ausente y ausencia de escrituras/envíos durante las lecturas.
- **454 Web / 16 archivos** (20 adicionales), **408 unitarias V3 / 22 archivos**,
  tipos Web/Worker/test-worker, lint dirigido y Web, Knip y ciclos correctos.
- Se corrigió un fixture histórico: el credential ID se generaba quitando
  guiones a un UUID y no siempre era base64url canónico. Ahora codifica sus
  bytes; el fallo intermitente no se resolvió relajando el parser.
- Build Next 16.3.4 y Worker **dry-run local**: 1809.18 KiB, 349.51 KiB gzip.
  Descriptor Web de 136 entradas normalizadas:
  `9b89043e9d409b14abe275c9d4f7b519aa62c5646f7275a68e5437bf0dccd3d8`.
- Chromium con autenticador virtual CTAP2/P-256: registrar/probar llave,
  consentimiento inicial y autorización de creación explícitos. Luego GET
  muestra cola; fixtures de respuesta muestran bootstrap y fallo 503, y un
  nuevo GET recupera el mismo registro sin otra firma. ES/EN y cambio A→B
  comprobados. No se usó una cuenta, sesión Firebase ni transacción reales.
- Captura inspeccionada: `output/playwright/v3-lifecycle41-mobile.png`, sección
  completa a viewport de 390×844, contenido horizontal de 390 px. El helper
  conserva identidad/persistencia sintéticas; no demuestra paridad completa
  de producción. Los contadores quedaron en una preparación y una autorización
  de creación, cero replays; cinco lecturas de fixture no aumentaron en reposo.
  La consola sólo añadió el 404 esperado de ausencia, el 503 simulado y el
  aviso Chromium por el perfil ES256 sin RS256. Browser/helper cerrados al terminar.

No se modificaron contratos ni migraciones, no hubo commit/push, despliegue,
provisioning, DNS, secrets, correo o fondos. Perfiles Web/Worker y resolver real
siguen cerrados. **E0–E4 siguen abiertos**: este incremento conecta seguimiento,
no completa activación, recuperación, salida, recepción/envío/balance ni los
gates de revisión independiente y staging.

## Incremento 42 — consentimiento de activación y prueba contra EVM local (9 septiembre 2026)

`shared/v3/bootstrapActivation.ts` compila la promoción de la cuenta bootstrap
sin cambiar su identidad, dirección, factory o scope original de una chain.
Usa `BootstrapActivation`, `EnrollmentProof` y `CommitProposal` ya definidos
en E0 y el ABI del contrato compilado; no modifica Solidity ni añade contratos.
La política activa conserva la passkey inicial como factor de gasto. No permite
usar esta transición como una recuperación que elimina al dueño original.

La propuesta verifica política/manifest/version actuales, creación terminada,
ausencia de propuesta pendiente y nonce admin exacto. Cada descriptor nuevo
o con permisos cambiados necesita una prueba ligada a la propuesta completa;
cambiar roles de la misma passkey también exige otra prueba. Se comprueban
firmas P-256/WebAuthn y ECDSA de 65 bytes, low-S, v 27/28, sin prefijo
`personal_sign`. La política y las pruebas se copian antes de validar firmas
asincrónicas. No se reciben ni almacenan claves privadas.

Después de observar la propuesta aceptada se recompone un `CommitProposal`
distinto: nonce admin incrementado, predecessor, scope y propuesta exactos,
checkpoint posterior y ventana que no supera la propuesta original. La firma
de prepare no sirve para commit. El acknowledgement local de una chain es:

```text
keccak256(abi.encode(
  keccak256("BootstrapAcknowledgementV1(bytes32 proposalHash,uint256 blockNumber,bytes32 blockHash)"),
  proposalHash, blockNumber, blockHash
))
```

Es un compromiso con el checkpoint revisado, no una prueba autónoma de finalidad
ni de atomicidad multichain. Ambas llamadas son al contrato de la cuenta, valor
cero, sin transferencias anidadas. Su resultado conserva
`account_readiness=not_assessed` hasta observar la instalación y revalidar estado.

`assessPolicyContinuity` distingue umbrales alcanzables mediante claves ECDSA
directas de posesión/almacenamiento independiente y soberanía demostrada. Una
passkey más una clave externa puede tener gasto sin dominio, pero no satisfacer
admin/recovery 2-de-2 sin él. Dos claves directas pueden satisfacer esos umbrales;
eso no acredita por sí solo un respaldo offline ni proveedores independientes.
Los contratos admiten ERC-1271, pero este adaptador de consentimiento todavía
lo rechaza explícitamente: falta su validación contractual acotada y transporte
probado. Nunca lo convierte en ECDSA por tener una dirección.

**Límite de confianza:** el compilador es puro y recibe una observación interna;
no valida ownership, finality/RPC, admisión ni una petición HTTP. Su integración
debe obtener estado con `inspectFinalizedWalletSecurity` y revalidar sesión/
propiedad, nunca aceptar `observation`, pins o políticas de autoridad desde el
visitante. No hay nueva ruta HTTP, D1, job de activación ni pantalla Next todavía.

Evidencia ejecutada:

- **445 pruebas V3 / 23 archivos**, incluidas **36 nuevas** del compilador y
  **una nueva integración Anvil** (cinco integraciones Anvil en total).
- Nodo loopback efímero, sin fork ni credenciales operativas. Despliega los
  artefactos compilados y crea la cuenta mediante EntryPoint. La passkey y las
  dos claves ECDSA son efímeras; la validación criptográfica y EVM son reales.
- Prepare deja bootstrap/version 1 y no mueve balance; commit instala el
  manifest esperado/version 2. Un envío directo de 1 wei con ECDSA funciona sin
  WebAuthn, Firebase, GatoPago, bundler o paymaster. Replays de prepare/commit/
  ejecución son rechazados. Una clave no alcanza admin; ambas juntas congelan
  upgrades. Gas del relayer local, no patrocinio real ni aceptación de mainnet.
- El nodo propiedad de la prueba se termina al concluir. No es un drill humano
  de recuperación/exportación: no verifica almacenamiento offline, dispositivos,
  retiro de passkey ni extracción de todos los activos/depósitos de EntryPoint.
- Regresión: **465 runtime / 18 archivos**, **454 Web / 16 archivos**; tipos
  Worker y lint dirigido (incluido shared con reglas de Promises), Knip y ciclos.
  Build de contratos con integridad de dependencias verificada; mantiene los
  avisos conocidos de revisión Git de dependencias y lint de fixtures.
- Descriptor de 137 fuentes normalizadas:
  `3dc31647d777a24e6171e4dd5462d070e12f26d8c41a9afbd5012fc78dcad136`.

No hubo commit/push, cambios de contrato, migraciones, despliegues, DNS, secrets,
correo o fondos externos. Perfiles y resolver reales permanecen vacíos.
**E0–E4 no están cerrados.**

## Incremento 43 — preparación y autorización de activación durables (9 septiembre 2026)

`ActivationRepository` conecta el compilador del 42 con ownership de Wallet Core,
consentimiento inicial restaurado y `inspectOwnedWalletAccount`. La configuración
interna resuelve el checkpoint/política de finalidad; el constructor por defecto
rechaza todas las redes. El visitante no puede suministrar observaciones, pins,
RPC ni un estado que se tome como autoridad. No se añadió una ruta HTTP.

La migración local `0009_account_activations.sql` registra una propuesta inmutable,
la política pública, el checkpoint original y las pruebas completas de autorización.
También conserva por separado la inspección finalizada vigente usada al aceptar
esas pruebas. Los codecs limitan tamaño y formato; al restaurar se recompilan los
digests y se vuelven a verificar P-256/ECDSA, no se confía en `authorized_at`.

- Retomar por ID no renueva validez, consulta RPC ni inicia otra ceremonia.
- CAS y restricciones SQL revalidan propietario, sesión, llave inicial, identidad
  determinística y manifest de despliegue. Una propuesta no reserva globalmente
  la cuenta ni el nonce; el contrato mantiene la decisión atómica de ejecución.
- Una firma nueva exige autoridad/finalidad vigente y el mismo digest/nonce.
  Pruebas inválidas se rechazan antes del RPC. Fallas no usan una observación
  histórica como fallback. Las nuevas preparaciones tienen límite por propietario.
- Una autorización repetida e idéntica devuelve su recibo histórico, incluso
  después de expirar, sin transmitir ni renovar permiso. Se rechaza sustituirla
  con otra prueba. Ningún recibo habilita depósitos o gasto.
- Se extrajo la fixture de proyección existente para reutilizar la creación
  firmada, los adaptadores HTTP/RPC y D1; no se duplicó un camino de producción.

**Evidencia:** 490 pruebas runtime / 19 archivos, incluidas 25 nuevas de activación;
tipos de Worker/runtime, lint dirigido, Knip y ciclos pasan. La suite usa D1 y
criptografía reales locales, con proveedores/finalidad sintéticos; no equivale a
testnet ni dispositivos humanos. Descriptor Web sin cambios, verificado (137
inputs). La finalidad de cierre puede avanzar sin sustituir el bloque inspeccionado;
el codec conserva ese target y rechaza cambiarlo. No cambió Solidity ni el
frontend, no se repitió la suite Anvil/Web aquí.

**Pendiente:** persistir el consentimiento separado de commit, entrega/observación
durable de prepare/commit, HTTP/Next y UX de factores/salida. El nuevo módulo
todavía no está conectado al entrypoint ni a la cola. `authorized` NO significa
`active_policy`. Gate A, staging real E1, recorridos E4 y admisión siguen abiertos.
No hubo despliegue, migración remota, commit/push, DNS, secrets ni fondos reales.

## Incremento 44 — confirmación durable y checkpoint reconocido (9 septiembre 2026)

La migración local `0010_activation_commits.sql` y `ActivationRepository`
conservan un segundo consentimiento por ID, asociado a una activación autorizada
y a la propuesta realmente observada. Cada confirmación tiene su digest,
checkpoint de revisión, ventana inmutable y firma P-256. El primer consentimiento
no sirve como firma de commit. No se añadió entrega, ruta HTTP ni pantalla.

- Preparar exige propietario/sesión válidos, bootstrap de origen verificado,
  propuesta pendiente exacta y observación finalizada vigente de dos RPC.
- Autorizar recompone el mensaje original y verifica la firma antes del RPC.
  Después vuelve a inspeccionar la propuesta y confirma que el bloque revisado
  siga canónico. El head puede avanzar, pero no cambia el acknowledgement firmado.
- El codec conserva inspección actual y comprobación del bloque original. Se
  revalidan ambas vigencias al guardar y al reconstruir el registro histórico.
- CAS y restricciones D1 evitan registros parciales y sustitución de términos;
  el write comprueba sesión, ownership, identidad y consentimiento padre exactos.
  No hay reserva global de cuenta/nonce. El límite es por propietario.
- Las lecturas no firman, renuevan ni envían; replay exacto de una autorización
  devuelve historia, no otra ejecución. Los proveedores/política se copian antes
  de I/O y no pueden sustituirse mutando el resultado original del resolver.
- Se extrajo la fixture de activación anterior sin cambiar el recorrido de
  creación/proyección. Las pruebas usan claves efímeras, D1/workerd y criptografía
  locales; proveedores y finalidad son sintéticos.

**Evidencia final:** 515 pruebas runtime / 20 archivos, incluidas 25 nuevas de
confirmación; tipos Worker/runtime, lint dirigido, Knip, ciclos y diff/archivos
nuevos verificados. Se corrigió una prueba que usaba otro mensaje en vez de otra
passkey. Una ejecución completa previa pasó 513 casos y excedió el timeout de
5s en otro; se dio 15s al nuevo grupo de integración criptográfica bajo contención.
Las ventanas de autoridad/finalidad no cambiaron. Las dos ejecuciones completas
posteriores pasaron (514 y finalmente 515, al añadir el caso de finalidad tardía).
Descriptor Web sin cambios, verificado con 137 inputs. No se repitieron Anvil,
Foundry ni Web: no cambió Solidity ni frontend en este incremento.

### Hallazgo del incremento 44: finalidad y vida de propuesta

Estado histórico del 44, corregido localmente por el incremento 45: el candidato
de `bootstrapActivation.ts` limitaba prepare a 300s;
`AccountV3Security.prepare` guarda `pending.validUntil = change.validUntil`,
y `prepareCommit` exige el pendiente finalizado antes de ese mismo vencimiento.
Si esa observación sólo está disponible después, el usuario no puede completar
la activación. El test nuevo demuestra `ACTIVATION_EXPIRED` sin renovar ni escribir;
**no demuestra que la activación funcione en una red de finalidad lenta**.

Corregir antes de integrar entrega o habilitar redes: distinguir una ventana
breve para aceptar la autorización y una vida de propuesta explícitamente firmada,
acotada y compatible con la política de finalidad. Commit mantiene firma nueva,
nonce propio y ventana breve. Revisar cancelación, expiración y qué autoridades
pueden reanudar/descartar; actualizar tipos/digests, contrato, codecs y migraciones
locales con pruebas cruzadas TS/EVM y reloj/finalidad demorados. No arreglarlo
extendiendo automáticamente un consentimiento ni usando `latest` como finalidad.

**Pendiente:** esa corrección de plazos, entrega/observación de prepare/commit,
HTTP/Next, factores/recovery/salida y todos los gates aún abiertos. El módulo no
está montado en el entrypoint ni en la cola. Redes admitidas siguen vacías,
`receive_enabled=false` y `spend_enabled=false`. No hubo cambios remotos, fondos,
DNS, secrets, deploy, commit ni push. E0–E4 no se consideran terminados.

## Incremento 45 — Consentimiento breve y propuesta con vida firmada independiente

Se corrige el bloqueo por finalidad tardía encontrado en el 44 sin renovar firmas
ni rebajar la evidencia requerida. Cambios locales; ninguna migración remota.

- `BootstrapActivation`, `SecurityChange` y `RecoveryProposal` añaden
  `proposalValidUntil` obligatorio y firmado. Aceptación: intervalo positivo
  `[validAfter, validUntil)` de hasta 300s. Propuesta: plazo absoluto posterior
  a la aceptación, de hasta siete días desde `validAfter`; para recovery se
  suma la demora de la política anterior. Los siete días son un máximo, no una
  duración elegida automáticamente por el backend.
- El contrato guarda la expiración de propuesta en el pendiente. La espera de
  recovery empieza al aceptar onchain y no puede reducirse backdateando firmas.
  Una política antigua de treinta días admite una propuesta de hasta treinta y
  siete días con consentimiento de aceptación de cinco minutos.
- Commit de bootstrap/política conserva otra firma, nonce y ventana de hasta
  300s, limitada por la expiración del pendiente. Veto/cancelación y expiración
  conservan efectos/nonces. `UpgradeManifest` no se cambia en este incremento;
  sus ventanas y las de creación/ejecución/freeze son protocolos separados.
- El compilador puede reconstruir el prepare histórico para comparar el pendiente
  aceptado. Eso no permite reenviar una autorización vencida. El Worker sólo
  prepara el commit si existe evidencia finalizada vigente del pendiente correcto;
  mantiene además el checkpoint reconocido y su comprobación canónica.
- `account_activations.proposal_expires_at` es requerido e inmutable. El plazo
  participa en la comprobación de idempotencia y se copia antes de cualquier I/O.
  Lecturas y replays devuelven historia sin prolongar vigencias ni emitir envíos.
- Se actualizó el candidato local de `0009`, nunca aplicado remotamente. Una DB
  local creada con la versión anterior necesita recreación limpia explícita;
  no hay default ni migración que invente consentimiento para filas antiguas.
  No se borró ninguna base/cuenta durante este incremento. `0010` no cambió.
- Los vectores públicos pasan a schema 4. La derivación de identidad no cambia,
  pero los mensajes/ABI y artefactos compilados sí: no reutilizar una admisión
  antigua. El descriptor Web se regeneró y se verifica contra 137 entradas:
  `web-v3-a57432ca7aa933a5a80ddb9db46172987c053ec080703801fe1b83eb943b6bd6`.
- La verificación de enrolamiento y la persistencia comparten una sola codificación
  del hash con typehash separado por propósito. La biblioteca quedó en 19.779 B,
  Account en 19.921 B y Upgrade en 10.680 B, sin cambiar optimizador ni relajar
  el guard de 20.000 B. Las primeras iteraciones excedieron ese guard y no se
  declararon válidas hasta reducir la duplicación y repetir las pruebas completas.

**Evidencia final del candidato local:**

| Comprobación | Resultado |
|---|---|
| Foundry V3, 18 suites | 266 pasadas, 0 fallidas, 0 omitidas |
| Unitarias/integración V3, 23 archivos | 460 pasadas; incluye 44 del compilador bootstrap y 27 del modelo de autoridades |
| EVM local Anvil, dentro de esas 460 | Seis recorridos; activación inmediata y tras una hora con P-256 real, luego gasto/freeze con factores independientes |
| D1/workerd, 20 archivos | 518 pasadas; finalidad tardía sintética, vencimiento absoluto, CAS, idempotencia y protección contra modificación de plazos |
| Web, 16 archivos | 454 pasadas; typecheck y build Next pasan |
| Vectores, schemas y layout | Coinciden; layout compuesto y comprobaciones de alteración pasan |
| Dependencias Solidity/EntryPoint | 546 archivos de contenido/config y 35 de EntryPoint fijados y verificados |
| Tipos Worker/runtime y lint dirigido | Pasan; el lint dirigido cubre los archivos Worker/pruebas modificados, no declara limpio todo el repositorio |
| Knip y ciclos | Pasan sin autofix ni eliminación de archivos |

En Anvil se aísla cada recorrido con snapshot/revert y se alinea el reloj de
creación con el reloj actual antes de firmar; no se reutiliza el timestamp de
otro caso. Esto corrigió una falla de fixture, sin aumentar las ventanas firmadas.
Los avisos de Forge sobre revisiones Git de dependencias empaquetadas se contrastan
con el gate de contenido independiente; no se modificó su pin para silenciarlos.
La comprobación de layout también imprime avisos de timestamp/casts en fixtures;
no se afirma haber pasado un lint Solidity global sin advertencias.

**Siguiente integración:** transporte HTTP y entrega/observación durable de
prepare y commit, luego UX de factores por gesto explícito y proyección del
resultado observado. No hay activación automática ni se confunde una autorización
persistida con instalación onchain. Perfiles admitidos siguen vacíos y el catálogo
Web permanece nulo en ambos ambientes. No hay pruebas humanas, despliegues,
credenciales nuevas/rotadas, DNS, fondos, commit ni push en esta entrega. No cierra
E0–E4, Gate A/W ni admisión de las tres testnets.

## Incremento 46 — Transporte autenticado de activación y confirmación

Se conectan al entrypoint de reemplazo las seis rutas Consumer de
[`activationRoute.ts`](../../server/src/v3/wallets/activationRoute.ts), con
cuerpos estrictos en [`activationWire.ts`](../../server/src/v3/wallets/activationWire.ts).
Preparación, primera autorización, lectura, preparación de commit, lectura de
commit y segunda autorización usan los recursos durables del 43–45. No importan
el árbol V1/V2 ni requieren preservar cuentas antiguas.

- Origen/API/RP exactos, CORS acotado, release compatible, JWT verificado y
  sesión existente. Cada operación revalida ownership; un commit bajo el padre
  equivocado devuelve 404 aun si el mismo usuario controla ambos recursos.
- Los POST exigen red/manifest/generación admitidos. El digest del documento de
  creación y el del manifest de despliegue se comparan según su función, no se
  intercambian. La composición copia perfiles/política antes de I/O y sólo
  admite el resolver de la red/instancia propia; no acepta RPC del visitante.
- Cuerpos acotados a 16 KiB (preparación) o 96 KiB (pruebas), lectura con límite
  de cinco segundos y señal de operación de quince segundos. Los resolvers
  observan cancelación; uno que tarda en resolver no permite una escritura tardía.
- Entrada canónica, sin propiedades adicionales, índices repetidos, base64url
  ambiguo, nonces, checkpoints, finality o calldata del cliente. Sólo las llamadas
  criptográficas de aceptación mapean una prueba incorrecta a 400; fallos RPC/D1
  no se devuelven como prueba inválida ni revelan detalles del proveedor.
- GET y replay exacto son restauraciones: no renuevan términos, no llaman RPC,
  no despiertan jobs ni difunden operaciones. No exponen firmas persistidas. El
  cliente debe reconstruir el review con su perfil independiente; un `input`
  recibido por HTTP no equivale a admisión ni a evidencia de red vigente.
- Los recibos siguen `activation_assessment=not_assessed`, `receive_enabled=false`
  y `spend_enabled=false`. Autorizar no activa la cuenta.

**Evidencia local final:** 539 pruebas D1/workerd pasan en 21 archivos, incluidas
74 de activación/commit: 21 nuevas HTTP y las 53 existentes. Se usan JWT RS256, P-256 y ECDSA efímeros
reales; red, admisión y finalidad son sintéticas. Incluyen reintentos concurrentes,
aislamiento de usuarios/padres, revocación durante inspección, entrada inválida,
cancelación, red deshabilitada, separación de digests y confirmación fresca tras
vencer la primera ventana, sin cambiar el vencimiento firmado. También se comprueba
posesión de una segunda passkey y cancelación de un cuerpo que queda abierto,
por el timeout real de cinco segundos. Tipos Worker y runtime, lint dirigido,
Knip/ciclos y descriptor Web pasan. El build Wrangler `--dry-run` pasa:
1.870,32 KiB sin comprimir / 361,73 KiB gzip; no subió el Worker. El descriptor
Web conserva los mismos 137 inputs; no hubo una nueva build ni despliegue Next.

La primera ejecución dirigida se descartó: al extraer la fixture faltaba un
import y `vi.fn(mock)` reutilizaba el mismo mock, causando recursión al cambiar
su implementación. Se corrigieron ambas fixtures y se terminó sólo el proceso
local de esa ejecución antes de repetirla; no se redujo cobertura ni se ampliaron
ventanas de autorización para conseguir un resultado verde.

**Siguiente:** cliente tipado/reconstrucción independiente y UX Next de factores,
entrega y observación durable de prepare/commit, seguida de proyección de la
política efectivamente instalada. El catálogo real sigue vacío. No hubo cambios
Solidity, de ABI, migraciones, dependencias, secrets, DNS, despliegues, Git remoto
ni fondos en el 46. No cierra E0–E4 ni prueba una activación remota o humana.

## Incremento 47 — Cliente de activación en Next y conformidad de datos

El cliente [`activation.ts`](../../apps/web/src/wallet/activation.ts) cubre
preparación, consulta y autorización de la propuesta y su commit. Se carga
mediante `BrowserAuth.activation()` bajo demanda; sus seis métodos capturan la
sesión Firebase y rechazan una sustitución del objeto de sesión, aunque conserve
el UID, antes/después de obtener token y recibir respuesta. No llama WebAuthn,
genera claves, almacena firmas, programa polling ni ejecuta al montarse.

[`activationWire.ts`](../../shared/v3/activationWire.ts) valida el contrato de
respuesta y recompila los digests con el perfil aprobado, consentimiento inicial
y política seleccionada. Una respuesta no puede autoaprobar su propio pin ni
sustituir wallet, instancia, RP/origin, salt, verificador, implementación, layout,
política, plazos o padre. Los nonces/checkpoints se decodifican como observaciones,
no como prueba de finalidad. La autoridad onchain/ownership siguen en Wallet Core.

Antes de transmitir se verifica P-256 del propietario y cada factor adicional
ECDSA/WebAuthn. El commit verifica una firma distinta sobre su checkpoint y
ventana propios. Los términos se separan de referencias mutables antes del I/O.
Las consultas históricas no renuevan nada; un recurso ya autorizado sólo permite
verificar un replay, que el Worker coteja byte a byte. Todos los recibos mantienen
`activation_assessment=not_assessed`, `receive_enabled=false`, `spend_enabled=false`.

**Evidencia local:** 514 pruebas Web (57 nuevas de activación y tres nuevas de
sesión), 460 unitarias V3, tipos Web/Worker/runtime, lint Web/dirigido y Knip/ciclos.
La build Next pasa y emite el cliente en un chunk diferido. Dos pruebas adicionales
en workerd contrastan los decoders con preparación/lectura/autorización producidas
por los repositorios D1 reales locales, con P-256/ECDSA efímeros y RPC sintético.
La primera ejecución de estas dos pruebas detectó que la fixture ofrecía el
objeto interno de preparación inicial; se corrigió para leer el DTO público real,
sin flexibilizar el decoder. El chequeo de tipos corrigió después la firma de
esa fixture para aceptar sólo los campos utilizados. La suite completa termina
con 541 pruebas D1/workerd en 22 archivos, sin fallos. Una política de dieciséis
factores WebAuthn pasa el decoder/cliente de propuesta y commit sin ampliar el
límite de respuesta de 32 KiB. Los 29 SVG de arquitectura y `git diff --check`
pasan; este último sólo avisa conversión LF/CRLF.

Descriptor Web: `web-v3-f1687f852bb8e9fa4ffc78eeeaa6ea86c7cf6b1cd05e39931474ac9465fe884d`,
139 inputs normalizados. No es evidencia de despliegue. Las pruebas de runtime
advierten que faltan secretos remotos de auth; usan fixtures y no requieren ni
demuestran autenticación remota.

**Siguiente:** UI de selección/respaldo y gestos explícitos para cada factor,
entrega/observación durable de prepare y commit, y proyección de la política
instalada. E4 requiere además recibir/enviar/useMax/balance/recibo, recuperación,
salida portable y pruebas humanas. Este cliente no sustituye esos recorridos.
No cambian contratos, ABI, migraciones, versiones de dependencias ni recursos
remotos. No hubo creación/rotación de secrets, DNS, despliegues, commit/push ni
movimientos de fondos; los perfiles reales de creación/admisión siguen vacíos.

## Incremento 48 — Detalle de credenciales y revisión previa de factores

Fecha: 9 de septiembre de 2026. Candidato local; sin publicación ni recursos
remotos. La respuesta anterior a la consulta sobre Next fue una evaluación,
no una implementación. Esta continuación sí modifica código y completa pruebas
de una dependencia del recorrido E3/E4; el objetivo completo permanece abierto.

- `shared/v3/credentialDetail.ts` valida el recurso exacto, scope, base64url
  canónico de 1–1024 bytes y clave P-256. Exige disponibilidad/autoridad desconocidas.
- `EnrollmentRepository.credential` sólo consulta la credencial del propietario
  autenticado y revalida su sesión tras D1. La ruta GET por referencia es privada,
  sin parámetros de usuario/RP, escrituras, pruebas exportadas ni challenges nuevos.
  La colección de credenciales conserva su contrato reducido de metadata.
- `BrowserAuth.credentialInventory().detail` se carga diferidamente y captura
  la sesión Firebase exacta, incluso frente a reemplazos con el mismo UID.
- `ActivationPolicyReview` se conecta al resultado de creación proyectada;
  no consulta detalles al montar. El usuario elige y solicita la lectura. La
  selección se copia antes de I/O; límite de 16 factores, plazo de 30 segundos,
  cancelación, errores y cambio de sesión eliminan revisiones anteriores.
- El borrador recompone los verificadores desde el pin de creación, no desde
  la respuesta de D1; comprueba duplicados por ID y clave física. Muestra gasto
  1-de-N, seguridad/recuperación 2-de-N y las demoras del contrato. Incluir la
  llave inicial en nuevos roles requeriría su propia prueba de consentimiento;
  no se reutiliza la firma inicial para concederlos.
- **No es el perfil final de activación:** las passkeys comparten RP. La UI
  explica las pérdidas tolerables y los fallos compartidos, declara que falta
  salida independiente y no dispone de acción de firmar/aplicar este borrador.
  No se relaja el requisito de factores independientes ni se habilita gasto.
  Faltan selección y prueba del mecanismo de salida, confirmaciones, entrega
  y observación de prepare/commit y la proyección activa.

Evidencia local ejecutada:

- Web: **564 pruebas**, 19 archivos, incluido contrato/cliente de detalle,
  selección de política, cancelación, timeout, cambio de sesión y duplicados.
- D1/workerd: **552 pruebas**, 22 archivos; enrolamiento/detalle: **59**.
  La prueba de lectura usa registro criptográfico real con claves efímeras y
  D1 local, comprueba contenido, ownership y ausencia de escrituras. No hay
  peticiones de usuario real ni reproducción en producción.
- V3 unitarias: **460**. TypeScript Web/Worker/runtime, lint de los cambios,
  Knip, ciclos, build Next y verificación de **29 SVG** pasan.
- Chromium local, UI React real bajo StrictMode: cero lecturas/ceremonias al
  montar; revisión 2-de-2 y 2-de-3; cambio de selección borra el borrador;
  error elimina el resultado previo; reintento explícito; reemplazo de sesión
  con el mismo UID borra llaves y revisión. Ninguna ceremonia WebAuthn.
- Vista móvil **390×844**, ancho de documento 390, y desktop **1280×900**;
  variantes ES/EN. Capturas inspeccionadas en
  `output/playwright/v3-policy-review-mobile.png` y
  `output/playwright/v3-policy-review-desktop-en.png`. El harness se reproduce
  con `pnpm --filter @gatopago/web dev:activation-policy-harness` y usa únicamente
  material público/identidad sintéticos; no demuestra Firebase remoto ni iOS real.
- `git diff --check` pasa con avisos LF/CRLF; revisión explícita de whitespace y
  conflictos en 18 archivos de código, incluidos los nuevos aún sin seguimiento.
- Release Web: `web-v3-8a45e602a925e3c47d622706cfe105c21be0c7aa0dc6cd83ef91de4606eda273`,
  **144 entradas** normalizadas. No es una atestación de despliegue.

Las guías Workers/React orientaron el aislamiento por petición/sesión y la
carga diferida sin ceremonias en efectos. Playwright verificó el flujo local;
Knip exigió registrar el harness como comando real, sin ocultarlo con ignores.
No se cambiaron contratos, Payments, Dashboard, DNS ni secrets; no hubo commit,
push, despliegues, migraciones remotas, correos ni fondos. Los perfiles reales
continúan vacíos. E0–E4 no están terminadas.

## Incremento 49 — Guardianes independientes y transporte EIP-712 externo

**Estado:** candidato local de E3/E4, no activación operativa. La respuesta de
arquitectura anterior fue de análisis, no una implementación ni un cierre. Se
retoma el objetivo completo E0–E4; esta entrega no modifica sus gates.

Se incorpora el perfil **avanzado y opcional** de §11.7: una passkey cotidiana
y tres firmantes directos ECDSA candidatos, sin Reown/WalletConnect, claves del
servidor ni generación/importación de secretos del usuario. No obliga a un
usuario nuevo a configurar tres guardianes durante el primer minuto.

| Control | Autoridad propuesta |
|---|---|
| Gasto directo | Sólo passkey inicial, threshold 1 |
| Administración | Passkey inicial + guardián 1; ambos obligatorios |
| Recovery | Dos de tres guardianes, sin necesitar passkey/RP; demora 72h |
| Upgrades | Quorum administrativo y demora 72h |
| Guardián individual | Sin SPEND; no controla ni recupera por sí solo |

`shared/v3/independentRecovery.ts` normaliza direcciones después de validar
EIP-55, rechaza cero/duplicados/autorreferencia y construye un único manifest
ordenado. No infiere EOA, personas, proveedores ni independencia de almacenamiento
por una dirección. El quorum externo sólo puede recuperar, **no administrar ni gastar
inmediatamente**. La salida requiere el recorrido de recovery y tooling probado.
La revisión del contrato confirmó que la administración y recovery son caminos
distintos: sólo el guardián 1 recibe ADMIN además de RECOVERY. De esta forma los
guardianes sin passkey no alcanzan el quorum administrativo. La UI identifica
ese rol extra antes de revisar y el hash cambia si se elige otro administrador.

La revisión Next permite elegir el perfil avanzado, consulta únicamente el
detalle privado de la passkey inicial y muestra todas las direcciones y roles.
No crea ni firma nada al montar/cambiar de modo; descarta resultados al cambiar
selección o sesión. El pegado de un valor largo se rechaza antes de que
`maxLength` pueda truncar una clave privada hasta aparentar una dirección válida.
`activationReady=false`, posesión/autoridad/independencia continúan sin probar.

### Solicitud y respuesta de firma externa

`shared/v3/externalEnrollment.ts`, consumido por el cliente de activación y su
frontera de sesión, expone `externalProofRequest` e `importExternalProof`.
Es un transporte local para el futuro coordinador de ceremonias: **todavía no
hay botón de descargar/firmar/importar una activación completa en la PWA**.

La solicitud JSON pública contiene cuenta/red, propuesta, política completa,
rol, índice/dirección del firmante, vencimiento, digest y `typed_data` EIP-712.
Los enteros grandes se serializan como cadenas decimales. No contiene tokens,
IDs de credenciales WebAuthn ni secretos. No es el kit de recuperación ni una
atestación de release. El firmante externo debe verificar la cuenta/manifiesto
por una fuente independiente y revisar la política; mostrar sólo hashes **no
equivale a hardware clear signing**.

Respuesta estricta (JSON de hasta 1 KiB):

```text
schema_version: 1
purpose: gatopago-v3-enrollment-proof
activation_id: operación preparada exacta
signer_index: posición exacta en la política ordenada
digest: EnrollmentProof reconstruido
signature: 65 bytes hex canónicos, low-S, v=27/28
```

El import recompila la propuesta revisada: no confía en el digest importado,
no hace HTTP, no abre una wallet y no acepta `personal_sign`, fallback ERC-1271,
otra cuenta/política/nonce/plazo, campos extra ni una propuesta ya autorizada.
La frontera cliente verifica cancelación, vencimiento y sesión después de la
comprobación asíncrona. La ruta existente vuelve a validar toda la autorización.
Cada guardián necesita EnrollmentProof y la passkey inicial también porque gana
el rol ADMIN; además sigue siendo obligatoria la autorización del owner.

Las pruebas usan claves efímeras sintéticas; ningún keystore existente del usuario
fue abierto. El plazo de consentimiento no se amplía para facilitar el intercambio
externo: el coordinador futuro debe gestionar su vencimiento y las confirmaciones
explícitas. No hay herramienta de firma hardware ni CLI de salida completa aún.

Fuentes: [EIP-712](https://eips.ethereum.org/EIPS/eip-712),
[viem: signTypedData](https://viem.sh/docs/actions/wallet/signTypedData).
Las guías React/viem orientaron gestos explícitos y la reutilización del protocolo
canónico, sin generar un protocolo criptográfico ni un proveedor de wallets nuevo.

### Evidencia local

- **625 pruebas Web / 21 archivos**, incluidas 21 del perfil independiente,
  37 del transporte externo, composición con autorización completa y aislamiento
  de sesión durante la verificación local. Firmas P-256/secp256k1 reales con
  factores efímeros; sin autenticadores del usuario ni redes reales.
- **460 pruebas unitarias V3 / 23 archivos** pasan en la ejecución final.
- **552 pruebas D1/workerd / 22 archivos** pasan. La primera ejecución tuvo dos
  timeouts de 5s mientras había otras tareas locales; los 29 casos de los dos
  archivos pasaron aislados y luego pasó la suite completa sin aumentar límites
  ni omitir pruebas. Esto es compatible con contención local, no una prueba de
  ausencia de problemas de rendimiento. Los avisos de secrets remotos ausentes
  son del cargador: las pruebas usan bindings sintéticos explícitos.
- TypeScript Web/Worker/runtime, ESLint Web, Knip, ciclos, build Next y 29 SVG
  verificados. No se repitió Foundry: no se cambiaron contratos.
- Chromium local con el componente real y harness sintético: 0 lecturas y 0
  ceremonias al montar; 1 lectura por revisión de guardianes; duplicados fallan
  antes de I/O; cambio de modo descarta el borrador; sesión reemplazada lo oculta;
  pegado de valor largo bloqueado sin truncación. Móvil 390px sin overflow y
  escritorio 1280px ES/EN, sin errores de consola. Capturas finales inspeccionadas:
  `output/playwright/v3-guardians-mobile.png` y
  `output/playwright/v3-guardians-desktop-en.png`. No demuestra iPhone ni
  autenticación o firma externas reales.
- `git diff --check` pasa con avisos LF/CRLF. Se verificaron explícitamente
  whitespace/conflictos en 17 archivos de código/configuración/pruebas,
  incluyendo los nuevos aún sin seguimiento.
- Release Web verificada por build y descriptor:
  `web-v3-ddf126c8ccdaabbfaee5a4fb7efca06e893661695057471be706a1433e46e52f`,
  **146 entradas** normalizadas. `viem@2.55.19` se declara como dependencia de
  desarrollo Web para sus pruebas criptográficas directas; no añade un SDK de
  conexión a la app. El primer install offline no encontró el tarball ya fijado
  de EntryPoint; `--prefer-offline` completó la instalación, sin actualizar versiones.

No se han desplegado servicios, cambiado DNS/secrets, enviado correos, movido
fondos, publicado commits ni habilitado un perfil real. E0–E4 siguen abiertas.

## Incremento 50 — confirmacion explicita de activacion en Next

**Estado: candidato local, no desplegado.** Avanza E3/E4 sin declarar completa
la activación ni habilitar redes o dinero. El turno previo aclaró la decisión
Next sin modificar implementación; este incremento añade código conectado y
evidencia nueva, no sólo otro plan.

### Flujo incorporado

- `apps/web/src/wallet/activation-flow.ts`: controlador ligado al componente,
  sesión capturada y pin independiente. Reconstruye el perfil de tres guardianes;
  no acepta un booleano `activationReady` como autoridad. Constructor sin
  llamadas, tokens, IDs, storage ni ceremonias.
- `ActivationOperationPanel.tsx`: montado desde la revisión independiente,
  después del bootstrap leído por `CreationOperationPanel`. No se monta para
  presentar el borrador de varias passkeys como salida independiente.
- Preparación explícita con ID propio, política y fecha de propuesta congeladas
  (24h por defecto; distinta de la ventana breve de firmas). Una respuesta
  incierta exige consultar el mismo recurso antes de repetir la preparación.
- Confirmación del titular y aceptación del nuevo rol ADMIN de la passkey son
  dos gestos separados, con digests distintos. No hay await/token/import/HTTP
  antes de invocar el adaptador WebAuthn desde el botón.
- Cada guardián recibe la solicitud pública EIP-712 y su respuesta se verifica
  con el transporte estricto del incremento 49. No se conecta proveedor de
  wallets ni se pide una clave privada. La interfaz mantiene el orden humano
  1/2/3 sin alterar los índices criptográficos canónicos.
- El envío de los cinco consentimientos exige otra acción explícita. Los bytes
  se fijan antes del primer POST; ante incertidumbre sólo se permite GET y
  reintento explícito de esos mismos bytes dentro de condiciones válidas.
  No se vuelve a firmar o renovar la propuesta silenciosamente.
- La espera local está acotada (30s I/O/verificación, 90s ceremonia; el adaptador
  WebAuthn conserva además su propio límite). Abort/unmount/cambio de sesión
  descartan respuestas tardías, incluso si el transporte ignora cancelación.
  Cambiar de idioma no reemplaza ni reenvía la operación.
- Se distinguen prueba inválida, cancelación/timeout local y POST de resultado
  incierto. El reloj no convierte un POST posiblemente aceptado en un fracaso
  definitivo. `aria-busy` sólo refleja trabajo activo; fijar la selección no
  deja un estado perpetuo de “agregando”.

### Continuidad de la solicitud, no de los fondos

`activation-continuation.ts` exporta únicamente un JSON público acotado a 1KiB:
versión/propósito, activation ID, initialization ID, wallet IDs, pin del perfil,
hash de política y vencimiento de propuesta. No contiene firmas, tokens,
credential IDs, claves privadas, URLs arbitrarias ni comandos ejecutables.

Tras cerrar la página, el usuario debe revisar los mismos guardianes y pegar
ese localizador para consultar el recurso propio autenticado. El import no
selecciona un perfil/política desde datos externos ni renueva su fecha. No es
un kit de recuperación ni permite restaurar fondos. Falta un historial privado
de activaciones para reemplazar este mecanismo avanzado por una UX más directa.

Las firmas sólo viven en memoria del controlador hasta enviar/restaurar el
resultado, expirar sin envío, cambiar sesión o desmontar. No aparecen en sus
snapshots ni en local/sessionStorage, URLs o logs. El formulario de respuesta
usa un campo transitorio que se vacía al iniciar la verificación.

### Evidencia local del incremento

- 656 pruebas Web en 22 archivos (31 nuevas del controlador), con P-256 y
  EIP-712 reales sobre claves efímeras sintéticas. Incluyen propietario/rol
  distintos, tres guardianes, pruebas incompletas/incorrectas, doble click,
  respuestas perdidas, retry byte-idéntico, expiración, timeout, unmount,
  reemplazo de sesión, localizador ajeno/malformado y regresión de estado.
- 460 unitarias V3 en 23 archivos; tipos Web, lint, Knip, ciclos y build Next
  pasan. Descriptor Web actualizado a 149 inputs normalizados; su hash no es
  evidencia de un despliegue.
- 552 pruebas D1/workerd en 22 archivos pasan en 59,93s; 29 diagramas PlantUML
  verificados. Los avisos de secretos no configurados corresponden al entorno
  local sintético: no se crearon credenciales para silenciarlos.
- `pnpm --filter @gatopago/web dev:activation-harness` usa la pantalla real
  con respuestas sintéticas y adaptador de ceremonia cancelada sólo en el
  bundle de prueba. No simula una firma exitosa como prueba de iPhone real.
- Chromium: cero preparaciones/ceremonias al montar y al revisar; preparación
  sólo por botón; respuesta perdida seguida de GET sin nuevo POST; error
  de prueba inválida explícitamente local; cancelación sin declarar llave
  ausente ni recovery iniciado; selección bloqueada con `aria-busy=false`;
  cambio ES/EN sin nueva operación; estado autorizado sin botones de firma
  ni habilitación de gasto; reemplazo de sesión descarta la vista.
- Capturas finales inspeccionadas: `output/playwright/v3-activation-mobile.png`
  (390×844, scrollWidth 390) y `v3-activation-desktop-en.png` (1280×900,
  scrollWidth 1280). Sin errores/advertencias de consola. Los harnesses locales
  se terminaron intencionalmente tras la inspección, no por fallos de pruebas.

### Lo que no cierra

No se modificaron contratos, migraciones ni lógica económica del Worker. No
hubo commit/push/deploy/DNS/secrets ni operaciones de usuarios reales. Los
perfiles admitidos reales siguen vacíos. Guardar la autorización **no aplica**
el cambio: siguen pendientes entrega durable de prepare/commit, observación
de la política activa, ejecución real con sus factores y drill sin GatoPago.
Tampoco se cierra staging real, recuperación/salida completas, recibir/enviar/
MAX/balance/recibos de E4 o la aceptación humana multidispositivo.

## Incremento 51 — outbox atomica para los dos consentimientos de activacion

La autorización de `prepare` y la autorización independiente de `commit` ahora
crean su trabajo durable en la **misma transacción** que guarda la firma. La
migración local `0011_activation_delivery.sql` añade `authorized_auth_time` y
`account_activation_outbox`; un trigger fallido revierte también la autorización.
En D1, una transición nueva reporta dos cambios (consentimiento y outbox), y
un CAS perdido reporta cero. Se exige ese resultado y se vuelve a leer/verificar
el recurso. No se habilitan automáticamente consentimientos testnet históricos.

### Implementación y límites de autoridad

- `activationAuthorization.ts` comparte la reconstrucción criptográfica entre
  HTTP propio y trabajos privados. Revalida política, checkpoints, pruebas
  P-256/ECDSA, calldata y vigencia **histórica**; nunca renueva una firma ni
  convierte ese snapshot en evidencia de estado actual.
- `ActivationDeliveryRepository` reconstruye el trabajo sin inventar una sesión
  Firebase ni poner JWTs/firmas en mensajes de cola. El catálogo y RP vienen de
  configuración privada copiada, no de datos del solicitante.
- Verifica identidad, dirección, red, manifest, propiedad, prueba inicial y
  sesión revocada. Vencimiento del JWT no cancela un grant vigente ya firmado;
  revocación/cutoff/archivo de wallet sí impiden un **nuevo** envío.
- Lease de hasta 45 segundos, CAS antes del límite de envío, backoff acotado y
  máximo de 32 intentos previos al envío. Un lease interrumpido antes de ese
  límite puede recuperarse; un marcador `sending` abandonado pasa a `uncertain`,
  nunca otra vez a `pending`.
- Un acuse de proveedor guarda sólo un hash orientativo. No prueba receipt,
  finalidad, instalación de la política ni habilita recibir/gastar. Después de
  enviar, la consulta privada para reconciliación sobrevive a expiración y
  revocación, pero no concede otro envío.
- El barrido es acotado y por proyecto. No hay bloqueo global de cuenta/nonce;
  cada consentimiento mantiene su ID y el contrato arbitra la ejecución.
- No hay aún sender/firmante operativo, consumidor de activación ni observador
  final conectados. Este incremento entrega persistencia y coordinación de
  entrega, **no la ejecución onchain completa** ni una nueva promesa de UX.

La guía de Workers llevó a usar una transacción D1 para el outbox, leases/CAS y
estado por invocación, no trabajo pendiente sólo en memoria o `waitUntil`.
Referencias: [D1 batch/transacciones](https://developers.cloudflare.com/d1/worker-api/d1-database/)
y [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

### Evidencia local

- **582 pruebas runtime en 23 archivos**, incluidas **30 nuevas** de entrega.
  D1/workerd real local, RPC sintético y firmas efímeras reales: atomicidad y
  rollback de ambos consentimientos, autorización concurrente, competencia
  entre seis procesos, leases obsoletos, interrupción antes/después de envío,
  expiración, sesión revocada, perfiles/RP, prueba persistida inválida y backoff.
- Se conservaron las pruebas de HTTP/decodificación y criptografía anteriores;
  sus fixtures de corrupción incluyen el campo de auth time nuevo para seguir
  probando el rechazo de firmas inválidas, no sólo un fallo de schema.
- **460 unitarias V3**, tipos de servidor/runtime, lint dirigido, Knip/ciclos
  y **29 diagramas** verificados. El frontend no cambió ni se volvió a presentar
  la prueba de navegador del incremento 50 como evidencia de ejecución onchain.
- No se modificaron contratos, frontend, dependencias, configuración de bindings
  ni el descriptor Web. La migración se aplicó únicamente en D1 local de tests.

### Trabajo que continúa abierto

Integrar una transacción patrocinada con nonce/presupuesto propios del operador,
validar sus bytes contra el grant y persistir su hash local antes del broadcast;
conectar el consumidor privado y observación independiente de propuesta/commit;
mostrar el seguimiento propio en Next y completar el commit explícito. No
cobrar gas al usuario ni reutilizar el grant de creación como autorización de
gasto. Después continúan recuperación/salida y recibir/enviar/MAX/balance/
recibos, además de staging y los drills reales. E0–E4 no se declaran cerrados.
No hubo deploy, cambios en Payments, DNS, secrets, correos reales ni mainnet.

## Incremento 52 — transaccion patrocinada exacta antes del broadcast

Implementación local del 9 de septiembre de 2026. E0–E4 siguen abiertos. No
hay nuevos perfiles admitidos, secretos, bindings, contratos ni despliegues.

### Comportamiento implementado

- `activationTransaction.ts` construye una transacción EIP-1559 de valor cero
  para la llamada prepare o commit ya autorizada. Fija red, cuenta destino,
  calldata, nonce y gas/fees; valida la firma recuperando al patrocinador real,
  serialización canónica, low-S y coincidencia de todo el payload unsigned.
  Rechaza creación de contrato, otros tipos, access lists no vacías, cambios
  de importe/destino/red/calldata y respuestas malformadas o excesivas.
- `0012_activation_transactions.sql` reserva el envelope unsigned antes de
  pedir la firma a un adaptador sign-only. El índice único
  `(network_id, operator_address, nonce)` arbitra entre consumidores y usuarios
  en la misma D1. No depende de una Promise o contador en memoria del Worker.
- `ActivationDeliveryRepository` sólo entrega esa reserva al lease vigente,
  bajo el grant original y el presupuesto privado actual. La reserva no se
  reprecifica ni cambia de signer en un reintento. Una respuesta incierta del
  firmante permite retomar el mismo envelope, no inventar otra operación.
- Los bytes firmados y su hash **calculado localmente** se persisten en el
  mismo batch D1 que pasa el outbox a `sending`. Un trigger impide marcar
  envío sin los bytes/hash guardados. Si D1 falla, ambos writes revierten;
  si se pierde su acuse después de commit, el siguiente worker conserva el
  hash para observar y no hace un nuevo broadcast automático.
- `activationBroadcast.ts` añade el transporte privado: dos RPC de operadores
  y hostnames distintos comprueban chain, nonce pending, operador EOA, balance
  y simulación del calldata exacto. Sólo el primer RPC recibe un único
  `eth_sendRawTransaction`, después del commit D1. No hay fallback de envío,
  aumento de gas ni reintento automático ante respuesta perdida.
- El acuse sólo se acepta si coincide con el hash local. Un resultado incierto
  mantiene bytes y hash, incluso después de expiración o revocación. Nada de
  ello cambia la política de la cuenta ni habilita gasto/recepción en la UI.
- I/O acotado: 5 segundos por petición, 30 segundos/lease para el transporte,
  respuestas de hasta 16 KiB y sin logs de raw transactions, errores del signer
  o URLs privadas. Las peticiones paralelas se esperan hasta terminar; no se
  comparten promesas entre invocaciones.

### Límites que no se deben ocultar

Este es el transporte final interno, no un consumidor conectado a producción.
Faltan el runner/cola de activación, adaptador sign-only admitido, inspección
fresca de estado/finalidad antes del envío y observador independiente después.
La configuración del scheduler debe provenir del servidor, nunca de HTTP,
Next ni mensajes de cola. No se cargó la llave del usuario ni una llave real
del operador. Los tests firman con claves efímeras y simulan todos los RPC.

`maxExecutionFee` limita `gas * maxFeePerGas`, **no promete cubrir cargos extra
de todos los L2**. La admisión de cada red debe incluir presupuesto y estimador
de sus cargos adicionales. Este grant no autoriza cobrar al usuario ni reutiliza
el de creación. Los sponsors deben ser operadores exclusivos del coordinador;
el índice de esta D1 no coordina otra base, proceso externo o producto que use
la misma llave.

No se recicla un nonce reservado automáticamente al expirar un consentimiento.
Una firma pudo haberse emitido aunque el acuse se perdiera. El procedimiento
de resolver reservas/nonce gaps necesita evidencia y coordinación con el
firmante; borrarlas o avanzar nonces ciegamente no es un mecanismo de recuperación.
La admisión operativa y ese procedimiento siguen siendo requisitos pendientes.

### Verificación

Las 30 pruebas anteriores de delivery pasan con transacciones firmadas reales
de prueba; no se conserva una ruta `beginSend` que omita los bytes del sponsor.
Las 55 nuevas pruebas cubren firmas y payloads, reservas concurrentes, pérdida
de respuestas, rollback D1, concurrencia de senders, revocación entre simulación
y envío, presupuestos y fallas de ambos RPC. La suite completa pasa: **637
runtime en 24 archivos** (53,91 s) y **460 unitarias/integración V3 en 23
archivos** (8,40 s). TypeScript, ESLint dirigido, Knip y ciclos pasan.
No se presenta como prueba de red real ni auditoría externa. No cambiaron
contratos ni frontend; no se repitieron Foundry ni navegación Web en este
incremento. Los gates humanos/remotos no se reemplazan por estos tests.

### Siguiente integración

Conectar runner privado de prepare/commit, inspección vigente y firmante
sign-only al transporte existente; observar la propuesta/commit con evidencia
independiente y proyectar estado sin confundir `accepted` con activación.
Después conectar seguimiento y confirmación explícita en Next y continuar
recuperación/salida, recibir/enviar/MAX/balance/recibos y los gates de staging
y dispositivos reales de E0–E4. No volver a construir outbox ni raw sender.

## Incremento 53 — coordinador privado de activacion y firma exacta

Implementación local del 9 de septiembre de 2026. Conecta el outbox y el
transporte de los incrementos 51–52; no crea otro motor paralelo. E0–E4 siguen
abiertos y los catálogos de red reales siguen vacíos.

### Comportamiento implementado

- `createActivationDeliveryProcessor` recibe únicamente configuración privada
  con perfiles fijados, política de finalidad, dos operadores RPC, presupuesto
  del sponsor y firmante sign-only. La entrada del trabajo es un operation ID,
  no un JWT fabricado, dirección arbitraria, endpoint, firma o ruta de pago.
- Reconstruye las autorizaciones históricas de D1 y adquiere un lease. Luego
  inspecciona implementación y seguridad onchain con ambos proveedores en un
  checkpoint finalizado reciente. Consentimiento histórico y autoridad actual
  son comprobaciones distintas.
- Para `prepare`, conserva exactamente el digest autorizado y su nonce; para
  `commit`, verifica que la propuesta pendiente sigue vigente y que el bloque
  revisado por el usuario continúa siendo canónico/finalizado. Un head nuevo
  no sustituye el acknowledgement ni pide otra firma en nombre del usuario.
- La estimación independiente toma el mayor gas de los dos RPC más un 20%,
  dentro de límites privados. No recorta un gas insuficiente para aparentar
  caber en el presupuesto. Las tarifas máximas son límites del operador,
  no una cotización de comisiones al usuario ni cobertura de cargos extra L2.
- Reserva nonce y envelope antes de solicitar firma. Si se perdió la respuesta
  del firmante, sólo permite el mismo envelope; no selecciona otro nonce ni
  cambia las tarifas. Revalida lease/revocación antes de pedir la firma.
- El adaptador local captura sólo la capacidad `signTransaction` de una cuenta
  inyectada. No carga keystores, secrets ni claves de usuario, y no tiene método
  de envío. Sus pruebas usan claves efímeras. Un firmante remoto futuro deberá
  respetar cancelación e idempotencia por operación/hash unsigned.
- Después de firmar y simular vuelve a inspeccionar estado y finalidad. El
  transporte exige este control explícito, sin callback permisivo por defecto.
  D1 comprueba además la caducidad de la evidencia al marcar el envío. Un fallo
  ambiguo de ese marcador no se convierte en un retry seguro.
- `accepted` continúa significando sólo acuse RPC. No instala una política en
  D1, no habilita gasto y no prueba una activación finalizada.

### Evidencia local

La suite integrada de 26 archivos pasa con **676 pruebas runtime**, incluidas
30 del coordinador y 7 de deadlines, y **460 pruebas unitarias/integración V3**
en 23 archivos. La comprobación adicional de expiración usa el reloj de SQLite
incluso si el reloj JS del caller está atrasado. TypeScript de servidor/runtime,
ESLint dirigido, Knip, ciclos y los 29 SVG PlantUML pasan. Las pruebas conservan
D1 real de workerd y firmas reales con claves
efímeras; los RPC/admisión son sintéticos. No se repitieron navegación Web ni
Foundry porque este incremento no modifica frontend ni contratos. Esto no
prueba activación en una red real ni cierre de ningún gate humano/remoto.

### Recursos de timeout

La suite integrada expuso acumulación de timers creados con
`AbortSignal.timeout` en inspecciones ya terminadas: workerd llegó al límite
de 10.000 timers activos. Las llamadas RPC de inspección y activación ahora
usan deadlines que liberan timer/listener en `finally`, también ante error o
cancelación. No se elimina el timeout ni se reduce la matriz para evitar el
fallo. Los límites superiores de operación siguen vigentes; el helper no
pretende poder interrumpir un proveedor que ignore deliberadamente su signal.

### Alcance pendiente

Conectar este coordinador al consumidor/scheduler durable de activación y
añadir observación independiente de prepare/commit, journal y proyección de
la política efectiva. Después integrar ese estado con las confirmaciones en
Next y completar recuperación/salida, recibir/enviar/MAX/balance/recibos.
Faltan admisión y pruebas de perfiles, sponsors, proveedores y dispositivos
reales; no se ejecutaron despliegues, migraciones remotas ni cambios de secrets.
El perfil avanzado local de guardianes sigue sin ser una política real admitida.

## Incremento 54 — observación independiente de activación

**Estado: candidato local validado, no desplegado.**

El observador reconstruye la transacción firmada desde el registro durable y
contrasta receipt, emisor, destino, calldata, firma, coste de ejecución y eventos
exactos de prepare/commit. Consulta dos proveedores admitidos, comprueba la
composición del contrato en el bloque de inclusión y evalúa finalidad. No firma,
no reenvía y no necesita el secreto del patrocinador para observar un envío previo.

La migración local `0013_activation_observations.sql` incorpora un journal
append-only con leases y avance atómico de la observación vigente. Una lectura
fallida no reutiliza un éxito anterior como estado actual. La evidencia histórica
finalizada se conserva para detectar cambios posteriores del receipt.

El resultado mantiene explícitamente `account_readiness: not_assessed`: confirmar
una transacción histórica no demuestra que la política actual permita operar.
Falta conectar el runner durable de activación y comprobar/proyectar esa política
efectiva antes de habilitar la cuenta en Next. No volver a construir el observador
ni su journal; integrar los módulos existentes.

La suite añade 56 casos sobre evidencia, concurrencia, leases, rollback,
revocación, caducidad y reorganizaciones. El fixture de commit utiliza un timestamp
posterior al consentimiento real de la prueba. Se limita la concurrencia entre
archivos a cuatro workers sin quitar pruebas ni aumentar sus timeouts; la
concurrencia adversarial dentro de cada prueba se conserva. La suite completa
terminó con exit 0: **732 pruebas runtime en 27 archivos**, en 88,91 segundos.
TypeScript de servidor y runtime, ESLint dirigido y Knip también terminaron
con exit 0. Son pruebas locales con D1 de workerd y proveedores sintéticos;
no demuestran activación remota ni disponibilidad de una cuenta real.

No se aplicó la migración remotamente ni se habilitaron perfiles, secrets,
contratos, Workers, frontends o pagos reales.

## Incremento 55 — consumidor durable de activación

**Estado: candidato local validado. No desplegado.**

El Worker conecta cron y la cola existente con los jobs de activación. No se crea
otro Worker ni otra cola. El dispatcher separa mensajes de creación y activación;
sus operaciones de ack/retry por grupo no afectan los mensajes del otro grupo.

La migración `0014_activation_jobs.sql` crea el job mediante un trigger de la
outbox: consentimiento, outbox y job se escriben en una misma transacción. La
validación de cambios D1 pasa a contar exactamente esas tres filas. Una falla al
insertar el job revierte la autorización. Los leases y reintentos están acotados,
con comprobación de vencimiento mediante el reloj SQLite y ámbito por proyecto y
perfil en descubrimiento, reserva, claim, finish y fail.

El procesador reutiliza el sender del 53 y el observador del 54. Los envíos
inciertos nunca vuelven a pendientes. Un envío previo puede observarse sin
firmante/patrocinador actual y aun después de revocar la sesión. Los resultados
son `ready`, `observed`, `expired` o `review`. `observed` sólo significa receipt
finalizado de prepare/commit: NO activa gasto ni reemplaza una inspección actual
de la política. Los errores persistentes pasan a revisión después de ocho fallas;
la ausencia de receipt durante 24 horas también requiere revisión operativa.

Las 50 pruebas dirigidas y la suite completa de **752 pruebas runtime en 28
archivos** pasaron. TypeScript de servidor/runtime, ESLint dirigido, Knip, ciclos
y 29 diagramas también pasaron. El mock de cola usa la respuesta tipada actual
`QueueSendResponse`; no se cambió el contrato del binding para acomodar el test.
Las pruebas cubren ambos
tipos de envío, convergencia concurrente, respuesta perdida de encolado, leases
vencidos, aislamiento, rollback, evidencia caducada y ausencia de reenvío.

**Siguiente integración:** comprobar/proyectar la política efectiva tras commit,
exponer el seguimiento propio a Next y completar los recorridos de App. La
admisión remota continúa cerrada; no se aplicaron migraciones ni despliegues.

## Incremento 56 — política instalada tras el commit

**Estado: candidato local validado. Sin despliegue.**

El procesador de activación no termina un commit sólo por su receipt: requiere
finalidad reciente e inspección independiente de la política actual. Contrasta
versión 2, manifest autorizado, hash de política, ámbito de redes, ausencia de
propuesta pendiente y nonce administrativo posterior al commit. El checkpoint de
la política no puede preceder al receipt; su bloque de inclusión se revalida
después de leer el estado actual.

La migración local `0015_activation_projections.sql` conserva una proyección
inmutable ligada a la transacción, perfil, manifest y observación original. El
insert revalida ownership/identidad, hash y bytes de transacción, head del journal
y vencimiento mediante SQLite. Los consumidores concurrentes convergen; una
observación reemplazada o una falla de persistencia no deja una proyección parcial.

Este registro es **histórico**, no un permiso permanente de gasto: una repetición
puede devolver `already_projected` sin renovar evidencia ni ejecutar RPC. Los
endpoints actuales siguen sin habilitar recepción/gasto mediante este registro.
El futuro seguimiento Consumer debe diferenciar política confirmada históricamente,
estado vigente y posesión de un factor. Si no hay observador de política admitido,
el commit sigue pendiente; nunca se marca listo por un flag local.

La suite completa terminó con **771 pruebas runtime en 29 archivos**, incluidas
19 nuevas de proyección. Pasaron TypeScript servidor/runtime, ESLint dirigido,
Knip, ciclos y 29 diagramas. Se cubren checkpoint regresado y cambio de proveedores,
entre otros casos de política, concurrencia, caducidad y persistencia. No se modificaron los
contratos, no se enviaron transacciones remotas ni se aplicó la migración fuera
de las bases locales de prueba.

**Siguiente paso:** seguimiento propio de activación en HTTP/Next, conservando
las respuestas de consentimiento como autorizaciones y no como confirmaciones
económicas. Después cerrar seguridad/recuperación/salida y el ciclo monetario E4.

## Incremento 57 — confirmación final de activación en Next

**Estado: candidato local validado. Sin despliegue.**

La pantalla avanzada ya puede continuar desde el primer consentimiento autorizado
al commit separado. Se reutilizan los endpoints existentes; no se creó otro motor
de ejecución. La entrega al segundo paso reconstruye y verifica el padre autorizado
y no expone sus firmas. El usuario prepara, revisa cuenta/red/digest/plazo, realiza
una nueva ceremonia por gesto y envía el consentimiento final explícitamente.

El coordinador conserva el identificador ante respuestas inciertas y permite
restaurarlo junto al localizador de la propuesta. Un GET precede a cualquier
reintento de la misma firma; no renueva plazos, no genera otra operación para
resolver incertidumbre y no firma al montar la pantalla. El reloj no convierte un
envío incierto en fallido. La limpieza descarta pruebas y resultados tardíos,
incluye espera acotada y permite el ensayo de efectos de React Strict Mode.

Se corrigió además el texto que afirmaba que las autorizaciones nunca producen
transacciones: el procesador puede entregarlas en segundo plano. La pantalla
explica que consentimiento registrado no significa política activa ni habilita
recibir/gastar. El seguimiento de la observación/proyección del incremento 56
todavía debe exponerse a HTTP/Next; el botón de consulta actual sólo lee el recurso
de consentimiento, no demuestra su confirmación en red.

Verificación: **667 pruebas Web en 23 archivos**, incluidas diez del coordinador
de commit y una de la entrega entre pasos; build Next con TypeScript, ESLint,
Knip y ciclos pasaron. El descriptor Web fue recalculado desde 151 entradas.
No se ejecutaron ceremonias en dispositivos físicos, transacciones remotas ni
una prueba visual de este nuevo panel; no se repitió la suite Worker/Foundry
porque este incremento no cambió esos componentes.

**Próximo:** validar el panel en navegador, conectar el seguimiento propio de
activación en HTTP/Next y continuar el ciclo monetario E4. Los perfiles reales
siguen cerrados. No se versionó, publicó ni desplegó este candidato.

## Incremento 58 — seguimiento propio de activación HTTP/Next

**Estado: candidato local validado. Sin despliegue.**

Se añadieron GET autenticados de sólo lectura para
`/app/v1/account-activations/:id/status` y
`/app/v1/account-activations/:id/commits/:commitId/status`.
La lectura verifica propietario, sesión y relación padre/hijo antes de reconstruir
la autorización privada, y vuelve a comprobar el acceso antes de responder.
No llama al resolver RPC, no adquiere leases, no despierta trabajos y no escribe.

El estado público separa consentimiento, entrega, job, última observación y
confirmación histórica de política. Los hashes/bytes de evidencia se validan
contra la autorización y transacción originales. La proyección comprueba su
fuente histórica y el estado de política instalado; no sustituye al último head
del observador ni concede permiso de gasto. Una lectura posterior a la caducidad
conserva las fechas originales, no las renueva. No se publican firmas, calldata,
transacciones serializadas, leases ni URLs de proveedores.

Next consulta ese recurso por gesto explícito en ambos pasos. El cliente valida
IDs, propuesta y manifest esperado. No se añadió polling de Home. Cambiar de
sesión descarta respuestas tardías; una consulta fallida borra el resultado
anterior, y detener un GET no convierte un consentimiento aceptado en un envío
incierto. El panel presenta observación reciente y confirmación histórica por
separado, con fechas de validez y sin CTA monetario.

Pasaron **786 pruebas runtime Worker en 30 archivos**, **676 pruebas Web en
24 archivos**, build Next, TypeScript de servidor/runtime/Web, ESLint, Knip,
ciclos y 29 diagramas. Las pruebas de render HTML cubren incertidumbre reciente
frente a confirmación histórica y textos ES/EN; no equivalen a evidencia visual
del panel en navegador ni ceremonia con dispositivos físicos. Los catálogos y
firmantes reales siguen sin admitir; no se provisionó, versionó ni desplegó nada.

## Incremento 59 — validación de interfaz y errores de seguimiento

Implementación local del 9 de septiembre de 2026; no desplegada.

- El panel final distingue cancelación de ceremonia de falta de llave. Un error
  de consulta conserva el consentimiento aceptado, borra la vista anterior y
  permite consultar otra vez sin firmar ni enviar otra autorización.
- Se elimina la consulta duplicada del consentimiento cuando ya está autorizado.
  El mensaje inicial de confirmación pendiente no acompaña contradictoriamente
  al historial de política instalada; ese historial no acredita seguridad actual.
- Harness reproducible: `pnpm --filter @gatopago/web dev:activation-commit-harness`.
  Usa el componente React real y parsers reales con identidad y estados sintéticos.
  La ceremonia se cancela deliberadamente; no demuestra WebAuthn físico ni envío.
- Chromium local: cancelación, consulta fallida, parada de consulta, sesión
  reemplazada y restauración por identificador tras remontar el panel. La
  restauración de consentimiento aceptado después de su plazo de firma mantuvo
  una sola ceremonia cancelada y cero envíos. También se comprobó la vista de
  revisión en inglés. Sin errores ni warnings de consola.
- Capturas en `output/playwright/v3-commit59-mobile-confirmed.png` y
  `output/playwright/v3-commit59-desktop-review.png`. Vista móvil simulada de
  390 × 844 y escritorio 1440 × 1000; no son pruebas en iPhone/Android físicos.
- Web: 677 pruebas aprobadas, lint y build con TypeScript aprobados. Knip,
  ciclos, 29 SVG y `git diff --check` aprobados (avisos LF/CRLF). No se repitió
  la suite Worker ni Foundry por estos cambios de interfaz. El descriptor Web
  se recalculó desde sus 153 entradas, sin constituir evidencia de despliegue.

La aceptación humana, proveedores/redes admitidos y el ciclo recibir/enviar
MAX/balance/recibos, recuperación y salida siguen pendientes. E0–E4 no se cierran.

## Incremento 60 — precisión de importes y financiación de transferencias

Candidato local; no endpoint de envío ni lectura onchain de saldo habilitados.

- `shared/v3/amount.ts` convierte importes decimales y atómicos sin números
  flotantes, redondeo o pérdida de dust. Soporta precisión admitida entre 0 y
  255; rechaza exponentes, agrupación, signos, espacios y precisión sobrante.
  Los decimales deben provenir de metadata admitida, no de respuestas del token.
  La pantalla existente de límite de gas de creación reutiliza esta conversión.
- `resolveTransferFunding` calcula exact/MAX para activos fungibles sobre un
  presupuesto explícito de wallet/activo. Comprueba comisión en el mismo activo,
  gas en saldo nativo separado y consistencia del saldo para transferencias
  nativas. Un envío exacto no se reduce silenciosamente; MAX reserva los costes
  acotados. El patrocinio sólo se representa con coste cero después de validarlo.
- El helper no acredita saldo, ownership, reservas, finalidad, cotización ni
  autorización. El integrador debe obtener/verificar esa evidencia antes de
  utilizarlo; no se confunde este avance con una transferencia operativa.
- Pasaron 44 pruebas dirigidas de importes/transferencias y 677 pruebas Web.
  Build Next con TypeScript, lint Web y de las pruebas dirigidas, TypeScript
  Server, Knip y ciclos aprobados; diff sin errores (avisos LF/CRLF). Una primera
  invocación ESLint para archivos fuera del proyecto no encontró configuración;
  se repitió para las pruebas dentro de Server con configuración explícita.
  No se repitieron Foundry ni runtime Workers en esta entrega.
- Descriptor Web actualizado desde 154 entradas. Sin despliegues, perfiles reales,
  migraciones remotas, cambios de secretos, commits ni operaciones monetarias.

Sigue faltando conectar lectura de saldo/finalidad, revisión/autorización y
ejecución de transferencia, refresco de balance y recibo. E0–E4 permanecen abiertas.

## Incremento 61 — observación acotada de saldos por bloque

Candidato interno local, sin endpoint público ni conexión con la pantalla de saldo.

- `balanceObservation.ts` lee activo nativo y ERC-20 a un hash de bloque explícito
  mediante EIP-1898 `requireCanonical`. Dos proveedores configurados deben
  concordar en chain ID, genesis, inclusión del bloque y cantidades. Revalida el
  bloque después de leer; no sustituye un fallo por cero ni elige el peer exitoso.
- Hasta 16 activos fungibles únicos de la misma red, una sola identidad nativa,
  cantidades uint256 exactas y respuesta ABI de 32 bytes. No consulta metadata
  de tokens ni trata símbolos como identidad. Los activos/proveedores/checkpoint
  deben provenir de admisión interna; este helper no la implementa ni demuestra.
- Límite global de 30 segundos y por RPC de 5 segundos, lectura JSON acotada,
  redirecciones prohibidas y gas de `balanceOf` acotado. Sin retries, polling,
  firmas, cache de promises ni estado mutable compartido entre solicitudes.
- Devuelve observación de saldo, no saldo disponible: `finality` y
  `spend_readiness` siguen `not_assessed`. El siguiente integrador debe verificar
  ownership, perfil/política de finalidad, reservas y sesión vigente antes de
  usarla en Consumer; no debe exponer un proxy de direcciones arbitrarias.
- Pasaron 14 pruebas en Node y las mismas 14 en workerd, con respuestas
  sintéticas. Cubren cero válido, precisión, desacuerdo, red/genesis/bloque
  incorrectos, resultado token vacío/inválido, cambio de bloque, cancelación,
  timeout, cuerpo excesivo y aislamiento de input. No prueban RPC reales.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos y diff aprobados.
  Workerd mantiene el aviso de secretos remotos ausentes; sus fixtures son
  sintéticas. No se repitió la suite completa Worker/Web/Foundry.
- Sin cambios de contrato, frontend, descriptor Web, recursos remotos, secrets,
  despliegues, Git remoto ni fondos. E0–E4 permanecen abiertas.

Las guías Workers/viem orientaron límites y separación read-only. Referencias:
[EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) y
[Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Incremento 62 — saldo propio, finalidad vigente y lectura HTTP

Candidato local, no desplegado; sin perfiles reales admitidos.

- `inspectOwnedWalletBalances` enlaza la lectura del 61 con `ownedAccount`:
  propiedad/sesión primero, selección única de manifest, red y dirección
  determinística, checkpoint común finalizado reciente, relectura de finalidad
  tras RPC y nueva comprobación de cuenta/sesión al final. La caducidad conserva
  el mínimo de ambas evidencias y nunca se renueva por tardar en consultar.
- La ruta `GET /app/v1/wallets/:walletId/accounts/:accountId/balances` está montada
  en el Worker candidato con identidad Firebase, CORS restringido y no-store.
  Rechaza overrides de dirección, RPC, bloque y cualquier query; no acepta POST.
  El argumento interno de perfiles queda vacío por defecto. Un recurso ajeno
  devuelve 404; perfil no admitido devuelve 503 sin cantidades inventadas.
- Devuelve saldo observado finalizado, NO saldo disponible: reservas, operaciones
  pendientes, semántica del token, seguridad de cuenta y coste siguen siendo
  condiciones separadas. No autoriza recibir/gastar ni sustituye el ledger.
- Pruebas de integración en Node y workerd verifican propiedad, revocación,
  cambio de proyección, caducidad, pin incorrecto, dirección inconsistente y
  aislamiento de configuración. Las pruebas HTTP usan JWT sintético firmado y
  D1 local, con proveedores simulados; no prueban Firebase/RPC de producción.
  También se revoca/archiva la cuenta durante RPC y se verifica que HTTP no
  devuelve el saldo obtenido. Las pruebas no aplican cambios en D1 remoto.
- Validación final: suite Worker completa con **817 pruebas en 32 archivos**
  aprobadas (112,55 s); 13 pruebas dirigidas Node aprobadas. TypeScript Server y
  runtime, lint dirigido, Knip, ciclos y diff aprobados. Descriptor Web vigente
  verificado, sin cambios al frontend. No se repitieron Web ni Foundry. Los avisos
  de secretos remotos ausentes permanecen; el runtime usa bindings sintéticos.

Pendiente: cliente/pantalla Next con caducidad y cambios de sesión/cuenta, lectura
de cuentas por red, recepción verificada y el flujo monetario completo. No hay
deploy, migración remota, commit/push, cambio de secrets, fondos ni mainnet.

## Incremento 63 — saldo Consumer en Next y ciclo de vida de la observación

Candidato local, no desplegado. Conecta la lectura HTTP propia del 62 con el
frontend; no habilita redes reales ni convierte el saldo observado en permiso
para recibir o gastar.

- `balanceClient` lista las cuentas propias y consulta el saldo seleccionado
  por GET privado, sin overrides de dirección/RPC. Valida identidad de wallet,
  cuenta, red, activos, cantidades exactas, checkpoint y evidencia de finalidad.
  Rechaza cantidades caducadas o futuras y campos adicionales inesperados.
- El perfil interno de balances declara símbolo y decimales por activo. No se
  consulta metadata arbitraria al token ni se usa el símbolo como identidad.
  El endpoint entrega esa metadata con asignación explícita de campos.
- `WalletBalances` se integra en las wallets activas de `WalletOverview`.
  Consulta únicamente tras una acción del usuario; no hace polling ni dispara
  WebAuthn. Permite escoger cuenta/red, paginar y refrescar. Conserva todos los
  decimales y permite envolver importes largos en pantallas pequeñas.
- `BalanceStore` retira el importe antes del refresco, al expirar, al cambiar
  sesión/cuenta y cuando el reloj retrocede por debajo de la observación.
  Cancela lecturas anteriores y descarta respuestas tardías. Un fallo se muestra
  como indisponibilidad, nunca como cero. La captura de sesión detecta también
  reemplazos con el mismo UID. La limpieza soporta React Strict Mode.
- Se agregó un harness local reproducible (`dev:balances-harness`) con datos
  sintéticos y controles de fallo/caducidad/sesión. La comprobación anterior en
  Chromium a 390 px mostró precisión completa, mensajes ES/EN y retirada de
  cantidades al fallar o caducar, sin nuevas consultas automáticas. No es una
  prueba de iPhone físico, Firebase real, RPC remoto ni fondos.
- Validación final de este incremento: **696 pruebas Web en 25 archivos** y
  **41 pruebas Worker dirigidas en 2 archivos**, aprobadas. Build Next, lint Web,
  TypeScript Server/runtime, Knip y ciclos aprobados. `git diff --check` sin
  errores, con avisos de normalización LF/CRLF. Las pruebas Worker usan bindings
  sintéticos; permanecen los avisos de secretos reales ausentes.
- Descriptor Web verificado con 157 entradas y digest
  `150b25e4bbdde7fb3c5fd13915b8f2e5c3138fe10a08d7801ba1bf59324ea229`.
  No se repitió la suite completa de Worker ni Foundry en este incremento;
  las 817 pruebas Worker corresponden al 62.

Las guías React orientaron el uso de eventos explícitos en vez de efectos para
consultar. Pendiente: recepción verificada, revisión/autorización/ejecución de
envío y MAX, balance posterior y recibo; seguridad/recuperación/salida y pruebas
humanas integradas. Los perfiles reales siguen vacíos. Sin commit/push, deploy,
migraciones remotas, cambios de secrets, fondos ni mainnet. E0–E4 abiertas.

## Incremento 64 — compilación de transferencia a llamadas Account V3

Candidato interno local. `shared/v3/transferCalls.ts` conecta la solicitud
`exact|max` y `resolveTransferFunding` con el encoder `execute` existente de
Account V3. No crea otro ejecutor, no expone endpoint y no envía transacciones.

- Identifica el activo nativo por su ID completo configurado por red; no acepta
  cualquier `slip44` como equivalente. Para ERC-20 codifica `transfer` al contrato
  del activo. Cantidades uint256 exactas, sin conversiones a Number ni approvals.
- MAX reserva gas nativo una sola vez. La comisión explícita se traduce en una
  segunda llamada del mismo activo; cero exige ausencia de destinatario de fee.
  Un envío exacto conserva su importe y verifica el débito total por separado.
- Rechaza direcciones inválidas/cero, autoenvío, usar la propia cuenta como token,
  enviar al contrato del token, destinatarios de fee inconsistentes y alias de
  activos/red. Reutiliza el encoder de Account para la versión de seguridad y
  genera `calls_hash` sobre las llamadas resultantes.
- Es compilación, NO cotización/autorización ni comprobación de saldo: el
  integrador debe aportar presupuesto verificado, ownership, seguridad vigente,
  reservas, metadatos admitidos y simulación. Un CALL exitoso a ERC-20 no demuestra
  entrega: retornos, eventos y settlement requieren verificación independiente,
  especialmente con tokens que devuelven false, cobran fees o cambian saldo.
- Pasaron 15 pruebas Node y las mismas 15 en workerd con inputs sintéticos,
  decodificación del calldata Account/ERC-20, MAX nativo/token, fees, uint256 e
  inconsistencias. TypeScript Server/runtime, lint dirigido, Knip, ciclos,
  build Next y diff aprobados. No se repitieron Foundry ni suites completas.
- Descriptor Web verificado: 158 entradas, digest
  `d046dd3be2a524fd34d74bc30ce410a2361361885885cbbd73f4af82c9db211c`.
  La guía viem orientó la codificación tipada. No se agregaron dependencias,
  proveedores de wallets, contratos nuevos ni conexiones remotas.

Pendiente integrar este compilador con preparación/revisión, simulación de la
cuenta, consentimiento, entrega durable y recibo, sin reutilizar un saldo de
pantalla como presupuesto autorizado. E0–E4 permanecen abiertas. Sin despliegue,
commit/push, migraciones remotas, secrets, fondos ni mainnet.

## Incremento 65 — operación unsigned y compromiso de revisión del envío

`shared/v3/transferOperation.ts` conecta el compilador del 64 con UserOperation
v0.9 y el `ExecutionPlan` existente. Es una preparación interna, sin firma ni
broadcast; requiere cuenta V3 desplegada/activada y perfil EntryPoint admitido
por el integrador. No demuestra ninguna de esas condiciones por sí sola.

- Construye calldata `execute` y UserOperation sin factory/paymaster. Este camino
  es explícitamente financiado por la cuenta; patrocinio futuro necesita su
  propio contexto verificado, no alterar estos campos después del consentimiento.
- Limita nonce a la key 0 soportada por el contrato, valida gas uint120 y tarifa
  de prioridad, y rechaza cargo máximo EntryPoint superior al gas reservado en
  el presupuesto. Ese límite no pretende estimar automáticamente recargos L2.
- Exige checkpoint acotado y vigente, con ventana de firma dentro de su
  caducidad. Vincula hash de revisión a wallet, release, manifest, bloque,
  observación, intención exact/MAX, tipo declarado de destino, activo nativo,
  saldos de presupuesto y límites/fees. La firma de ExecutionPlan vincula además
  cuenta, chain, destinatarios/llamadas, securityVersion, nonce, UserOp y ventana.
- Devuelve objetos aislados/inmutables. Se debe reconstruir usando los mismos
  términos y validAfter originales antes de firmar, verificando vigencia con el
  reloj actual; pasar un nuevo instante de preparación crea otro consentimiento.
- Pasaron 24 pruebas Node y las mismas 24 en workerd: decodificación de execute,
  UserOp hash independiente, cambios de 14 campos/contextos que alteran digest,
  rechazo de caducidad/gas/nonce/pins inválidos e aislamiento de input. No son
  simulaciones EVM, firmas WebAuthn ni pruebas con proveedores reales.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos, build Next y diff
  aprobados. Descriptor Web: 159 entradas, digest
  `3dd79b9a3d21918988aeba027bedab37ae90b125260ff85082af4d28c8c3297a`.
  No se repitieron suites completas, Foundry ni pruebas humanas en este incremento.

La guía viem orientó ABI/UserOperation y separación de simulación/envío. Queda
integrar ownership, finalidad/política activa, reservas reales y simulación con
este candidato; después recurso durable, revisión UI, autorización, entrega y
recibo. Los hashes son compromisos, no enforcement onchain de saldos ni prueba
de transferencia ERC-20. No hay endpoint nuevo, deploy, secretos, migraciones,
commit/push, fondos ni mainnet. El objetivo E0–E4 permanece abierto.

## Incremento 66 — verificación del consentimiento de gasto

`transferAuthorization.ts` recompila el candidato del 65 con el instante de
preparación original y valida la aceptación con un reloj actual independiente.
La revisión ahora incluye además `policy_hash`; el candidato vincula la política
exacta que se presenta, sin afirmar que ya está instalada onchain.

- Exige digest revisado coincidente y política estructuralmente válida, activa,
  cuyo hash sea el del contexto. Comprueba threshold de gasto, índices únicos y
  roles SPEND; los factores asistidos no pueden contar para gastar.
- Reutiliza el verificador WebAuthn existente con challenge/RP/origin/clave de
  política. Verifica ECDSA directo de 65 bytes, low-S y recuperación de signer;
  no usa personal_sign ni interpreta ERC-1271 como una clave EOA. ERC-1271 queda
  pendiente de su transporte/inspección bounded, no simulado como válido.
- Desacopla request/context/política/proof bytes antes de awaits. Verifica tiempo
  antes y después de las firmas, ordena votos por índice y genera el envelope
  `ExecutionPlan + Signature[]` en UserOperation.signature, nunca en callData.
  Devuelve la operación y versión packed; no abre WebAuthn ni transmite bytes.
- Pasaron 37 pruebas Node y las mismas 37 en workerd (25 de preparación y 12 de
  consentimiento). Prueban quorum mixto con firmas efímeras locales P-256/ECDSA,
  inmutabilidad del UserOp hash al añadir signature, rechazo de cambio de request,
  política/scope, duplicados, faltantes, índices y caducidad durante verificación.
  No prueban autenticadores humanos ni ejecución monetaria/contratos reales.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos, build Next y diff
  aprobados. Descriptor Web: 160 entradas, digest
  `17e85e2f68ccaeb8e29c9e757485ddd6bfb843b6ff33e8e31760cac04f8ee82b`.
  No se repitieron suites completas ni Foundry. Runtime usa fixtures sintéticas.

El integrador sigue obligado a relacionar la política/version con la cuenta,
checkpoint y finalidad admitidos, ownership/sesión, nonce, reservas y simulación
antes de entregar. Esta función no es un endpoint público de autorización ni
reemplaza los controles del contrato. Pendientes esos enlaces, recurso durable,
UI/gesto real, observación y recibo. Sin cambios remotos, deploy, secrets,
commit/push, fondos ni mainnet. E0–E4 siguen abiertas.

## Incremento 67 — consentimiento ligado a inspección de seguridad/finalidad

`transferSecurity.ts` enlaza el resultado de los lectores existentes de seguridad
y finalidad con la operación preparada. `authorizeTransferOperation` ahora exige
esa evidencia y la comprueba antes y después de verificar firmas; ya no acepta
únicamente una política sin observación asociada.

- Manifest fijado por digest, red/genesis y EntryPoint coherentes, cuenta/ID,
  implementation/layout y securityVersion coincidentes. Política activa con
  hash coincidente; creación terminada y checkpoint idéntico al de la operación.
- La política de finalidad se carga por pin y se contrasta con evidencia
  finalized del mismo bloque, su mecanismo, ventanas y edad máxima. La firma
  no puede durar más que la evidencia de seguridad y no renueva su caducidad.
- Esto valida consistencia y vigencia de inputs de lectores de confianza, NO
  crea confianza en datos enviados por un visitante. La ruta futura debe invocar
  los lectores autenticados, no aceptar un body que afirme tener esa evidencia.
  Ownership, nonce EntryPoint (distinto del nonce directo), reservas/saldo,
  simulación y admisión de proveedores continúan siendo controles separados.
- Pasaron 45 pruebas Node y las mismas 45 en workerd (25 preparación, 20
  consentimiento). Incluyen rechazos de cuenta/red/bloque/version distintos,
  bootstrap, finalidad/genesis y caducidad de seguridad. Inputs de red sintéticos
  con firmas efímeras reales; no representan RPC ni cuentas desplegadas.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos, build Next y diff
  aprobados. Descriptor: 161 entradas, digest
  `1d815ca55366bd17c24be087427fa5f18522291e55d004be4bc5b67c5e77a4ab`.
  No se repitieron suites completas ni Foundry; no hay nuevo endpoint o Worker.

Pendiente el coordinador que reúna estas observaciones con saldo/reservas/nonce,
la persistencia e integración Consumer y evidencia monetaria/humana E4. Sin
deploy, recursos remotos, secretos, migraciones, commit/push, fondos ni mainnet.
El objetivo íntegro E0–E4 permanece activo e incompleto.

## Incremento 68 — consentimiento respaldado por saldo y reservas explícitas

`transferBalance.ts` se invoca desde `authorizeTransferOperation` antes y después
de verificar firmas. Exige un snapshot interno de saldo y reservas, separado de
la vista Consumer y de los parámetros económicos solicitados por el usuario.

- Cuenta/dirección, wallet, red, checkpoint y momento observado deben coincidir
  con la preparación. Contrasta evidencia finalized del mismo bloque/genesis y
  política que seguridad; la operación no puede superar la caducidad de ninguno.
- Exige cantidades canónicas y únicas, y presencia explícita del activo enviado
  y del activo nativo para gas. Reservas agregadas únicas por cada activo relevante,
  incluyendo cero explícito cuando corresponda; no se deducen de un campo ausente.
- El presupuesto debe ser exactamente saldo observado menos reservas, sin
  underflow. Para nativo se usa una sola identidad; para ERC-20 son dos balances.
  No reserva gas por segunda vez: ese cálculo sigue en `resolveTransferFunding`.
- Pasaron 32 pruebas de consentimiento Node y las mismas 32 en workerd, con
  firmas efímeras y observaciones sintéticas: nativo/ERC-20, holds, ausencia de
  gas/reservas, duplicados, cantidades insuficientes y cambio de wallet/bloque.
  TypeScript Server/runtime, lint dirigido, Knip, ciclos, build Next y diff
  aprobados. No se repitieron suites completas ni Foundry.
- Descriptor Web: 162 entradas, digest
  `4f070dc65af50675552700eaf7c52b53897fd906007d70e941564228685650af`.

No se crean holds ni se resuelve concurrencia con este check: el coordinador
debe leer/reservar atómicamente, admitir la procedencia de esos inputs y volver
a validar antes de entrega. Gastos externos, nonce EntryPoint, simulación,
persistencia, UI y recibo siguen pendientes. Los snapshots no pueden aceptarse
de un visitante como prueba de fondos. Sin deploy, recursos/secrets/migraciones
remotos, commit/push, fondos ni mainnet. E0–E4 siguen abiertos.

## Incremento 69 — nonce EntryPoint observado y vinculado al consentimiento

`observeTransferNonce` reutiliza `createInspectionClient` y su transporte bounded
para leer `EntryPoint.getNonce(account, 0)` en el hash EIP-1898 elegido. Nunca usa
el nonce directo de Account ni `eth_getTransactionCount` como sustituto.

- Dos operadores/hosts configurados; chain ID, genesis y bloque contrastados,
  código EntryPoint comparado con pin, retorno ABI exacto de 32 bytes, key cero
  dentro de uint64. Relectura del bloque al cerrar y concordancia de nonce.
- Deadline total 30 s y por RPC 5 s mediante infraestructura existente, sin
  retries ni estado/promises globales. No requiere nuevos bindings ni secretos.
- `authorizeTransferOperation` exige esa observación: cuenta, EntryPoint, red,
  bloque, nonce y frescura deben coincidir con la operación en ambos controles
  temporales. Un body público no puede ser la fuente de esta evidencia.
- Pasaron 11 pruebas Node del lector y 47 dirigidas workerd (11 lector, 36
  consentimiento). Cubren código/genesis/red/bloque/nonce incorrectos, peers en
  desacuerdo, fallo RPC, cancelación previa y operadores duplicados. No prueban
  RPC reales. TypeScript Server/runtime, lint dirigido, Knip, ciclos, build Next
  y diff aprobados. No se repitieron suites completas ni Foundry.
- Descriptor Web: 162 entradas, digest
  `646d0301d01fc4f377121cd0e2ad66913cfb5af0ff25868becb99dbdc281287c`.

Las guías Workers/viem orientaron el transporte por solicitud; se contrastaron
tipos Workers 5.20260908.1 y [best practices oficiales](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
El nonce observado NO es una reserva ni ve operaciones pendientes fuera de ese
bloque. Faltan coordinación atómica/claims, simulación, entrega/recibo y UI.
Sin endpoint nuevo, recursos/deploy/secrets/migraciones remotos, commit/push,
fondos ni mainnet. El objetivo completo E0–E4 sigue abierto.

## Incremento 70 — reserva privada de nonce antes de entrega

`TransferNonceReservationRepository` y la migración local `0016` incorporan
una reserva D1 por red/cuenta/EntryPoint/nonce. La autorización proviene del
verificador privado existente; no se acepta un body público como prueba.

- Reintentos del mismo consentimiento recuperan el mismo ID. Dos consentimientos
  distintos no obtienen simultáneamente el mismo nonce. Una reserva vencida,
  nunca despachada, puede expirar conservando su registro histórico.
- Expiración/inserción/lectura forman un batch transaccional. Un fallo de escritura
  revierte también la expiración. Se comprueban ownership, pin, sesión y plazo;
  se revalidan ownership y tiempo al terminar. La respuesta conserva
  `send_enabled: false`: no hay reserva de fondos, outbox ni autorización de entrega.
- Fixture de transferencia compartido por pruebas Node y workerd, con factores
  criptográficos efímeros y firmas comprobadas. Pasaron 13 casos nuevos con D1
  real local y 36 de autorización (49 dirigidos); también 36 de autorización Node.
- La primera suite completa mostró 916 aprobadas y una prueba anterior de
  activación fallida. Comparaba el vencimiento de B contra el deadline de A,
  preparados por separado. Se corrigió para comprobar B antes y en su propio
  límite, sin modificar código de autorización ni ampliar plazos. La reejecución
  completa pasó: **917 pruebas en 37 archivos**, exit 0, 120 segundos.
  Los avisos de secrets ausentes pertenecen al arranque local; no se configuraron
  credenciales remotas ni se demostraron login o transacciones públicas.
- TypeScript Server y runtime, lint dirigido, Knip, ciclos y descriptor Web
  comprobados. El descriptor sigue en 162 entradas con digest
  `646d0301d01fc4f377121cd0e2ad66913cfb5af0ff25868becb99dbdc281287c`.
  La guía Workers orientó el uso de sesiones D1 por solicitud y pruebas workerd;
  tipos oficiales 5.20260908.1 contrastados para batch/sesiones y
  [best practices oficiales](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
  No se repitieron Foundry ni el build Next en este incremento sin cambios Web/contratos.

Falta persistir el payload autorizado y las reservas de fondos de forma
coordinada, simulación, transición durable previa a entrega y comprobante de
transferencia, además de UI. La reserva aislada no debe usarse para transmitir.
Sin endpoint público nuevo, despliegues, secretos, migraciones remotas,
commit/push, fondos ni mainnet. E0–E4 permanecen abiertos.

## Incremento 71 — operación firmada durable y restauración privada

La reserva guarda ahora la operación exacta en la misma fila/transacción D1:
sender, nonce, calldata, cinco términos de gas y sobre de firmas, junto con
checksum, manifest fijado y auth time original. Se amplió `0016`, todavía no
desplegada ni promovida, sin compatibilidad con esquemas experimentales anteriores.

- `transferOperationRecord` usa JSON canónico con cantidades decimales enteras;
  limita tamaño, campos y perfil. Rechaza factory/paymaster/delegación no soportados
  antes de serializar. Reconstruye el hash UserOperation y el digest EIP-712,
  verifica calldata/CALLs/security version y el plan contenido en la firma.
- Los checksums detectan corrupción, no prueban autoridad ante escritura maliciosa
  en D1. Este lector no reemplaza verificar quorum, política vigente, fondos,
  finalidad y consentimiento antes de entrega. No es un sender ni una API pública.
- Reintentos preservan el primer sobre incluso cuando otro quorum válido firma
  exactamente el mismo consentimiento. Una lectura propia devuelve esos bytes
  sin renovar plazos; puede mostrar historial expirado, siempre sin send grant.
- Ownership se revalida con sesiones que comienzan en primary antes y después
  del I/O. La identidad del repositorio queda copiada/congelada por solicitud.
- Pasaron 20 pruebas D1 y 19 del codec en workerd (39 dirigidas), más los mismos
  19 casos del codec en Node. Cubren restauración nativa/ERC-20, cambio de quorum,
  aislamiento de lectura, expiración sin escritura, corrupción y bindings cruzados.
  Suite completa aprobada: **943 pruebas en 38 archivos**, exit 0, 106,5 segundos.
  TypeScript Server/runtime, lint dirigido, Knip, ciclos, descriptor Web y
  `git diff --check` también pasaron (avisos LF/CRLF preexistentes).
  No se repitieron Foundry ni build Next; no se tocaron contratos/frontend.

El descriptor Web no cambia: no se editaron frontend, shared ni contratos.
Faltan persistencia del contexto económico revisado, reserva de fondos coordinada,
simulación, entrega y comprobante de transferencia, además de pantallas Consumer.
No se hicieron despliegues, migraciones remotas, cambios de secrets, commit/push,
movimientos de fondos ni mainnet. E0–E4 siguen abiertos.

## Incremento 72 — reservas de fondos coordinadas con nonce y operación

La autorización produce un snapshot acotado por activo: saldo observado, reservas
previas y débito máximo. Se deriva después de las comprobaciones de saldo y
consentimiento, no de un body público. D1 lo guarda con la operación y el nonce
en la misma inserción; la migración `0016` sigue siendo un candidato no desplegado.

- Se suman holds vigentes con BigInt, nunca mediante SUM/REAL de SQLite. La
  comparación contra la reserva revisada exige recalcular si ha cambiado.
- La inserción compara el conjunto ordenado de IDs/checksums vigente dentro de
  su transacción. Aunque dos solicitudes lean el mismo snapshot y usen nonces
  diferentes, sólo una puede insertar sobre ese snapshot. No hay una ventana
  entre insertar nonce y descontar fondos: ambos pertenecen a la misma fila.
- Máximo 32 reservas vigentes por wallet account. Lecturas acotadas, ownership
  antes/después, ceros explícitos y aislamiento de redes/cuentas. El trigger
  impide cambiar importes/checksum de una reserva existente.
- Native/MAX incluyen el tope de gas una sola vez. ERC-20 reserva token y gas
  nativo por separado. Expirar una reserva nunca enviada libera su cómputo sin
  borrar historia. Antes de introducir estados de despacho se debe conservar
  nonce/fondos de operaciones inciertas hasta reconciliarlas, incluso vencidas.
- Pasaron 62 pruebas dirigidas workerd (26 D1, 36 autorización) y 63 Node
  (autorización, operación y snapshot de fondos). Casos nuevos: concurrencia con
  nonces distintos, presupuesto obsoleto, recalcular con hold vigente, MAX,
  token/gas separados, inmutabilidad y enteros uint256. La suite completa pasó:
  **957 pruebas en 39 archivos**, exit 0, 114,8 segundos.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos y build Next pasaron.
  Descriptor Web: 162 entradas, digest
  `e8409feb2ecf91874238fbac66c7fd41d7dc819028ced73615f287b2e87ceb18`.

Estos holds coordinan sólo operaciones de este servicio: no bloquean fondos
autocustodiados onchain ni sustituyen simulación/finalidad. La lectura del
snapshot persistido no reverifica por sí sola quorum y política. Faltan el
contexto completo de revisión, simulación, autoridad durable de entrega,
comprobante/reconciliación y la UI de envío. E0–E4 siguen abiertos. Sin cambios
remotos, secretos, deploy, commit/push, fondos reales ni mainnet.

## Incremento 73 — contexto revisado y quorum histórico verificable

`verifyTransferQuorum` extrae la verificación criptográfica existente para
reutilizarla sin fingir autoridad onchain. `authorizeTransferOperation` conserva
ahora el contexto original de revisión, política, scope, pruebas y los instantes
de preparación/verificación junto a su resultado. No contiene claves privadas ni JWT.

- `transferReviewRecord` serializa cantidades BigInt explícitas y pruebas
  WebAuthn mediante el codec acotado existente. Parseo canónico y tamaño limitado;
  cantidades exactas/MAX, destinatario, fees, gas, checkpoint y plazos permanecen
  vinculados al digest revisado.
- La lectura reconstruye la operación original, verifica la política y el quorum
  WebAuthn/ECDSA, y compara bytes con la operación persistida. No usa la fecha
  actual para renovar la aprobación histórica. Deben comprobarse por separado
  la procedencia de la política, admisión y estado vigente antes de entregar.
- La revisión se almacena atómicamente con nonce, operación y holds en el
  candidato local `0016`, aún no desplegado. Lecturas propias y reintentos
  reverifican el primer consentimiento, conservando las primeras firmas.
  También contrastan las reservas contra el presupuesto reconstruido.
- Pasaron 49 casos Node (13 revisión, 36 autorización) y 40 dirigidos workerd
  (13 revisión, 27 D1). Cambiar destinatario, presupuesto, nonce, threshold,
  scope, firma o plazo se rechaza incluso recalculando el checksum. Incluye
  corrupción seguida de lectura/reintento sobre D1 real local.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos y build Next pasaron.
  Suite completa aprobada: **971 pruebas en 40 archivos**, exit 0, 109,55 segundos.
  No se repitió Foundry ni se cambiaron contratos. Descriptor Web: 162 entradas, digest
  `4cc17857bbdf17e0b6b382873a5915e8cf890cad22c557e1898aa6d7aaf76698`.

Verificar la firma contra la política registrada no prueba que esa política
continúe instalada, ni que el checkpoint siga siendo válido: falta la inspección
independiente previa a entrega, simulación, sender durable, reconciliación y UI.
El snapshot no conserva por sí solo una attestation independiente de todos los
RPC usados para cotizar. No se habilita gasto desde un estado D1.
Sin deploy/migración remota, secrets, commit/push, fondos ni mainnet.
E0–E4 permanecen abiertos.

### Incremento 74: estado vigente antes de entregar una transferencia

- `transferDeliveryState.ts` contrasta la revisión firmada restaurada con
  seguridad, finalidad, nonce y balances de un checkpoint posterior. Conserva
  exactamente los bytes, hash e importe aprobados (también MAX); no recompila
  una operación usando el nuevo saldo. Exige evidencia posterior a la aprobación
  y reconocimiento vigente del bloque original.
- `deliveryFundsSnapshot` consulta la reserva propia y el total reservado con
  D1, revalida propiedad y limita la instantánea a cinco segundos. No adquiere
  una autorización de entrega ni cambia estado. El futuro paso atómico de entrega
  debe contrastar su fingerprint; esta lectura no elimina carreras por sí sola.
- Se rechazan nonce consumido, cambio de versión de seguridad, fondos menores
  que las reservas, bloque original distinto, activos duplicados/ausentes y
  tiempos inválidos o vencidos. Los datos son internos de observadores admitidos,
  no evidencia aportada libremente por un cliente HTTP.
- Validación dirigida: 65 pruebas Node (autorización, revisión y estado) y 44 pruebas en Workers (16 de estado y
  28 de reservas D1), TypeScript de Server/runtime, lint dirigido, Knip, ciclos,
  descriptor Web y build Next aprobados. Pruebas con datos sintéticos y D1
  efímera, no operaciones remotas. Suite completa de Workers aprobada: **988
  pruebas en 41 archivos**, exit 0, 127,99 segundos. No se repitieron Foundry
  ni recorridos humanos/remotos en este incremento.
- Falta integrar observadores admitidos, simulación, transición durable de
  entrega, envío/observación y UI/comprobante. E0–E4 siguen abiertas; no se hicieron
  despliegues, migraciones remotas, commit/push ni cambios de secretos o fondos.

### Incremento 75: coordinador privado de observación de entrega

- `observeOwnedTransferDelivery` restaura una reserva propia y su revisión
  criptográfica; selecciona el perfil por digest y rechaza perfiles ambiguos,
  activos ajenos, EntryPoint sin pin y proveedores no independientes.
- Recupera el header original y lo contrasta con dos proveedores mediante el
  lector de finalidad existente. Seguridad, balances y nonce se consultan en
  paralelo sobre el mismo checkpoint común; todas las promesas se recogen y
  comparten un deadline de 30 segundos. Cada comprobación de propiedad abre una
  sesión primaria nueva. Se vuelve a comprobar el bloque original y se toma la
  instantánea D1 de reservas al final.
- El resultado mantiene la operación firmada y entrega fingerprint/tiempos al
  futuro coordinador de envío. No adquiere lease, simula, transmite ni expone
  un endpoint público. No admite perfiles reales automáticamente.
- Pruebas dirigidas: 34 pruebas de reservas/coordinación con D1 efímera; los
  lectores de seguridad/finalidad/balances/nonce se simulan en los nuevos casos
  de composición. Cubren resultado válido, perfil ausente, fallo de balance,
  nonce usado, cuenta archivada durante la lectura y cancelación previa.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos y descriptor Web
  verificados. Suite completa: **994 pruebas en 41 archivos**, exit 0,
  141,07 segundos. Repetición dirigida final: 50 pruebas aprobadas. No se
  repitieron build Next, Foundry ni recorridos humanos en este incremento.
  No se desplegó ni se
  modificaron recursos remotos, secretos, fondos o mainnet.
- Siguiente trabajo: simulación y transición durable de entrega que compare
  atómicamente las reservas; envío/receipt/UI siguen pendientes. E0–E4 abiertas.

### Incremento 76: simulación exacta y preflight compuesto de transferencia

- `simulateTransferOperation` usa un transporte privado acotado (15 segundos
  totales, cinco por petición y 16 KiB de respuesta), sin retries, state overrides,
  firma ni método de envío. Comprueba chainId, soporte de EntryPoint y que los
  tres límites estimados no superen los firmados. Rechaza patrocinio inesperado,
  gas cero/malformado, envelopes ambiguos, expiración y retroceso del reloj.
- Conserva los bytes firmados y devuelve una observación de hasta cinco segundos
  con checksum de la operación completa (incluida la firma). No reemplaza la
  comprobación de estado, una simulación local independiente o la inclusión real.
- `preflightOwnedTransfer` restaura la reserva propia antes de contactar servicios;
  compone simulación y observación en paralelo y espera ambas. Exige mismo recurso,
  consentimiento, hash, bytes firmados y vigencia conjunta al terminar. No escribe
  una transición ni concede un lease o envío; conserva `send_enabled=false`.
- Evidencia dirigida: 14 pruebas Node de simulación, 53 pruebas Workers de
  simulación/reservas/coordinación, TypeScript Server y runtime, lint, Knip,
  ciclos y descriptor Web aprobados. Los RPC son simulados y D1 es efímera;
  no se ejecutaron un bundler remoto, Foundry, suite completa ni build Next en
  este incremento. No confundir esta evidencia con una transferencia E2E.
- Próximo: transición durable con comparación atómica del fingerprint y estado
  incierto de envío, transporte, observación/comprobante e integración Consumer.
  E0–E4 siguen abiertas. Sin despliegues, commit/push, recursos remotos, secretos,
  fondos o mainnet.

### Incremento 77: claim durable y conservación del envío incierto

- La migración **local no publicada** `0016` incorpora `delivery_pending`, hash
  del token de claim y momento de transición. No se aplicó ninguna migración
  remota. El índice exclusivo de nonce abarca tanto reservas como entregas
  pendientes; el cálculo de fondos conserva estas últimas incluso tras expirar
  la operación firmada. La expiración automática sigue afectando sólo a `held`.
- `beginDelivery` restaura la revisión y sus bytes, exige preflight/simulación
  vigentes y realiza una única actualización condicional con propiedad actual,
  digest de operación y fingerprint del conjunto de reservas. Requiere exactamente
  una fila modificada. Dos candidatos concurrentes no reciben dos claims.
- El token aleatorio sólo se devuelve al ganador; D1 guarda su hash. Tras la
  transición, perder la respuesta o fallar la revalidación no libera la reserva.
  No hay takeover automático ni se considera que la firma vencida pruebe ausencia
  de inclusión. Falta reconciliación terminal y recuperación operativa de claims
  inciertos; no exponer todavía este camino como envío de usuario.
- Evidencia dirigida: 45 pruebas de reservas, preflight y coordinación con D1
  efímera; concurrencia, snapshot cambiado, preflight vencido, operación distinta,
  identidad ajena y conservación de fondos/nonce después de expiración.
  TypeScript Server/runtime, lint, Knip, ciclos y descriptor Web aprobados.
  Suite completa: **1019 pruebas en 42 archivos**, exit 0, 121,20 segundos.
  La repetición dirigida con el caso ampliado de expiración/nonce también pasó
  (45 pruebas). No se repitieron Foundry, build Next ni recorridos remotos.
- Sigue pendiente conectar el claim al transporte/observación y comprobante, con
  reconciliación que libere fondos sólo con evidencia. Sin deploys, commit/push,
  secretos, fondos ni mainnet. E0–E4 permanecen abiertas.

### Incremento 78: despacho de un solo uso y transporte acotado

- `0016`, todavía migración local no publicada, guarda la expiración del
  preflight y el marcador `delivery_dispatched_at`. `consumeDelivery` verifica
  token, identidad, propiedad, vigencia y ausencia de consumo previo; marca D1
  antes del I/O externo y exige una sola fila modificada. No reutiliza el token
  ante respuesta perdida ni confunde vigencia de firma con vigencia de preflight.
- `deliverOwnedTransfer` conecta restauración, preflight, claim y consumo con
  una única petición `eth_sendUserOperation` acotada a cinco segundos. Envía
  exactamente la operación persistida, no firma/reprecio/state overrides.
  Una respuesta de hash coincidente significa `accepted` y `unconfirmed`, nunca
  settlement. Fallos tras el consumo producen `uncertain`, conservando reservas.
- Pruebas dirigidas: 52 pruebas D1/coordinación. Casos nuevos: token incorrecto,
  consumo concurrente con un ganador, expiración de preflight, persistencia antes
  de RPC, aceptación, timeout, hash distinto, error RPC y cancelación. Un segundo
  intento del coordinador no vuelve a contactar al bundler. Preflight y respuesta
  del bundler son sintéticos; no se contactaron redes reales.
- TypeScript Server/runtime, lint dirigido, Knip, ciclos y descriptor Web
  aprobados. Suite completa: **1026 pruebas en 42 archivos**, exit 0,
  108,96 segundos. No se repitieron Foundry, build Next ni pruebas humanas/remotas.
- Pendiente observador de inclusión, reconciliación terminal y tratamiento
  operativo de claims inciertos/huérfanos, integración HTTP/Consumer y comprobante.
  No hay ruta pública ni perfil real habilitado para este sender. E0–E4 abiertas;
  sin despliegues, migraciones remotas, commit/push, secretos, fondos ni mainnet.

### Incremento 79: evidencia estricta del receipt de transferencia

- `verifyTransferReceipt` contrasta el receipt de ejecución con la revisión
  firmada: transacción/bloque/índices canónicos, EntryPoint, UserOperation hash,
  sender, nonce, ausencia de paymaster y coste dentro del máximo aprobado.
  Una transacción de bundle exitosa puede contener una ejecución revertida;
  el verificador conserva esa distinción y el gas consumido.
- Delimita los logs del pago mediante `BeforeExecution` y el anterior
  `UserOperationEvent`, sin atribuirle eventos de otro pago con igual callsHash.
  Comprueba `CallsExecuted`, versión de seguridad y modo. Para ERC20 exige los
  eventos exactos de transferencia al destinatario y de comisión, si existe,
  incluso cuando ambos destinatarios coinciden. No acepta trailing ABI bytes.
- El resultado sigue con `finality=not_assessed` y `settlement=not_assessed`.
  Falta inspeccionar código/pins y canonicalidad con dos RPC y política de
  finalidad. Eventos de un token no admitido no prueban semántica honesta del
  activo. Ausencia de evento de transferencia no se convierte en pago completado.
- Evidencia: 22 pruebas de receipts en Workers; 56 pruebas Node de receipts
  de creación/transferencia; TypeScript Server/runtime, lint, Knip, ciclos y
  descriptor Web aprobados. Receipts sintéticos, no pagos reales. No se repitió
  suite completa, Foundry, build Next ni recorrido humano en este incremento.
- Pendiente observación onchain, journal/reconciliación terminal, comprobante
  y Consumer. E0–E4 abiertas; sin despliegues, migraciones remotas, commit/push,
  secretos, fondos ni mainnet.

### Incremento 80: observación del receipt con revisión de código y bloque

- `observeTransferReceipt` recupera el receipt desde un cliente RPC acotado,
  lo verifica y reutiliza `inspectAccountDeployment` para contrastar la
  composición de la cuenta al hash de bloque. Verifica además el codehash
  admitido del EntryPoint mediante EIP-1898 y lee el header antes/después para
  rechazar cambios de hash, altura o timestamp. La inclusión debe pertenecer
  a la ventana firmada; observar después de que expire sigue siendo posible.
- Deriva identidad y dirección desde los commitments iniciales antes de RPC;
  rechaza pin/red/cuenta incompatibles. Un receipt ausente devuelve `null`.
  Los fallos no exponen detalles de proveedor ni permiten reenviar o liberar
  fondos. Es una lectura de **un proveedor**, no la reconciliación final.
- Evidencia: 30 pruebas Node y 30 Workers del verificador/observador, TypeScript
  Server/runtime, lint, Knip, ciclos y descriptor Web aprobados. En los ocho
  casos nuevos se simula la inspección de composición; se comprueba que recibe
  el checkpoint del receipt. Su implementación real tiene pruebas separadas.
  No se repitieron suite completa, Foundry, build Next ni pruebas remotas.
- Pendiente componer dos observadores independientes con finalidad, journal y
  transición terminal; integrar comprobante y Consumer. E0–E4 abiertas. Sin
  despliegues, migraciones remotas, commit/push, secretos, fondos ni mainnet.

## Próximo trabajo concreto

Los incrementos 15–42 añadieron ejecución, interoperabilidad, UUPS, inspección,
ownership, acceso Consumer, enrolamiento con posesión/pantalla Next y consentimiento
inicial persistente y una primera UserOperation WebAuthn sobre contratos reales
locales, más autorización durable, outbox atómico, despacho interno con lease
y observación independiente de receipts con journal durable y finalidad por
política acotada, más lectura portable de la seguridad actual ligada a finalidad
vigente y revalidación de ownership. El 33 incorpora proyección bootstrap
atómica e idempotente, con parada del seguimiento de creación; no activa gasto.
El 34 conecta la consulta persistente de credenciales a Seguridad en Next, sin
confundir el registro con disponibilidad o autoridad onchain.
El 35 monta las rutas del consentimiento inicial y el cliente de sesión. El 36
conecta selección/consentimiento en Next y replay explícito. El 37 restaura el
consentimiento tras cerrar la pestaña mediante GET autenticado. La operación de
creación tiene HTTP/cliente de sesión desde el 38. El 39 conecta la pantalla
de segunda confirmación y consulta explícita, con recuperación de respuestas
inciertas por el mismo recurso. El 40 conecta cola/cron a entrega, observación y
proyección mediante jobs durables con límites. El 41 conecta el seguimiento propio
con Next sin activar dinero ni convertir evidencia histórica en autorización.
El 42 compila y verifica prepare/enrollment/commit de activación con evidencia
real sobre contratos locales. El 43 conecta preparación/autorización con un
recurso D1 propio e inspección vigente. El 44 conserva también el commit separado
y su checkpoint reconocido. El 45 separa la ventana de aceptación de la vida
firmada de propuesta, con límites y evidencia local de confirmación demorada.
El 46 conecta el transporte HTTP de los dos consentimientos y el 47 añade el
cliente Next con reconstrucción independiente. El 48 añade detalle propio y
revisión de selección/quorum, sin confundir passkeys con salida independiente.
El 49 añade el perfil avanzado de tres guardianes y pruebas externas EIP-712
en el cliente; la revisión de direcciones aún no es configuración activa.
El 50 conecta esas pruebas y dos consentimientos explícitos de la llave inicial
a la autorización del recurso, con restauración por localizador público propio.
El 51 registra el trabajo de prepare/commit de forma atómica con la autorización
y aporta reconstrucción/leases privados. El 52 agrega reserva de envelope/nonce,
firma validada y raw sender con hash local persistido antes del broadcast. El
53 conecta el coordinador privado con inspección fresca antes y después de la
firma sign-only y la estimación/reserva de sponsor. El 54 añade observador y
journal de activación. El 55 conecta el consumidor durable y el 56 contrasta y
registra la política instalada. El 57 conecta el commit explícito en Next y el 58
expone el seguimiento propio de ambos pasos en HTTP/Next. El 59 valida el panel
final en Chromium con datos sintéticos y corrige sus mensajes y acciones. Falta
admitir firmante/presupuesto reales y pruebas humanas; no volver a construir ese outbox,
transporte, coordinador ni observador.
Faltan entrega/observación y confirmaciones reales de los factores independientes;
no es todavía un flujo de usuario completo.
El catálogo real sigue vacío y no hay
observador, estimador ni patrocinio real conectado.
No existe todavía admisión de una política/red real.
No transforman esos resultados en cierre de Account,
autenticación remota, E4 o ERC-7562.

1. Revisar/aprobar el modelo y las diez autorizaciones; cerrar evidencia de
   acknowledgements multichain y verificadores criptográficos. La revisión del
   mismo implementador no satisface el threat review independiente de Gate A.
2. La creación/one-time init y seguridad del proxy ya tienen evidencia local.
   La composición UUPS tiene margen local bajo 20k por componente. Completar
   la admisión independiente de artefactos/manifests y prueba del layout
   compuesto/migración antes de promoción. La consistencia de ambas bibliotecas
   y la consulta post-upgrade ya tienen candidato local; no equivalen a admisión.
   Extender el presupuesto de creación y
   validación a WebAuthn con el verificador real, ERC-1271 y políticas mayores;
   medir cada perfil manteniendo ventanas, autoridad y las reglas ERC-7562. El EntryPoint real
   ya tiene prueba local; el bundler real y sus reglas completas siguen pendientes.
   El lector y adaptador ya se integran con el resolver autenticado; no hay
   endpoint público de inspección ni pin admitido. Completar provisioning
   autorizado desde el nuevo modelo de propiedad y el paquete de salida con
   artefactos/manifests verificados; cerrar layout compuesto y despliegues.
   No implementar ni promover Account definitivo saltándose Gate A.
3. Completar el manifest de habilitación de red (el perfil de inspección ya tiene
   schema/fixture), generación verificable desde artefactos con links/immutables,
   evidencia independiente de red y portable package;
   preflight que no pueda habilitar redes desde una bandera sin codehash/proof.
   La evaluación local de finalidad/frescura por política ya está integrada al
   journal; requiere admisión de proveedores y pruebas de red efectiva. La
   lectura actual ya está ligada a finalidad vigente; la proyección bootstrap
   compara el manifest firmado y termina el sweep de creación. El inventario
   de credenciales ya permite leer las referencias propias tras recargar;
   su selección ya se conecta con el consentimiento inicial verificado. El transporte
   inicial HTTP/cliente/pantalla y su restauración por GET existen, igual que
   la segunda confirmación de UserOperation. Conectar observación fresca,
   estimación/patrocinio admitidos. El consumidor privado acotado ya tiene
   candidato y evidencia sintética; HTTP/Next ya muestran estado propio de
   seguimiento. Completar alertas/revisión/redrive operativo y la prueba del consumidor con
   recursos aislados, sin polling del Home. Completar la activación mediante otro consentimiento y
   factor independiente, además del historial firmado para estados ya cambiados.
   Reutilizar el compilador del incremento 42, los recursos/cliente propios del 43–47
   y la lectura/revisión del 48–49 y su transporte externo, más el coordinador
   Next del 50, sin promover un borrador a perfil final. La vida de propuesta ya
   está separada de aceptación y las pruebas se conectan por gesto: completar
   el seguimiento Consumer de la proyección del 56 sobre el consumidor del 55, outbox del 51,
   el sender patrocinado del 52, coordinador del 53 y observador/journal del 54,
   con firmante y reservas operativamente admitidos,
   historial privado y pruebas con
   factores reales. El segundo
   consentimiento ya es durable, pero sólo la observación posterior puede
   confirmar activación. Completar
   transporte ERC-1271 y su validación antes de ofrecerlo; no introducir Reown.
4. Completar el mapa de rutas y portar legales/docs desde las fuentes inventariadas;
   los textos legales antiguos describen recovery de 48h y requieren revisión
   explícita antes de publicarse como condiciones de V3. Completar auth remota/PWA,
   CSP y políticas de caché sin importar el cliente V1/V2. Provisionar staging
   exige la autorización remota correspondiente; no se reemplaza con producción.
5. Continuar E2/E3 según dependencias y finalmente E4. Los cambios locales no
   requieren conservar cuentas antiguas; los gates siguen siendo obligatorios.

## Incremento 81 — observación propia con dos proveedores y finalidad

- `transferObservation.ts` restaura la operación privada en `delivery_pending`,
  obtiene los compromisos desde la cuenta propia y selecciona un único manifest
  admitido. El hash de transacción sólo es una pista: ambos lectores verifican
  receipt, eventos, cuenta y código mediante el observador del incremento 80.
- Las consultas comparten un plazo local de 40 segundos y se esperan ambas.
  Ausencia, discrepancia y errores producen estados distintos, no confirmación.
  Si coinciden, se consulta finalidad con la política y génesis fijadas.
- Se vuelven a leer propietario y reserva después de RPC con sesiones primarias;
  revocación, cambios o evidencia vencida no pueden exponer una confirmación.
  La comparación interna maneja explícitamente bigint; el primer pase de pruebas
  encontró ese defecto y el segundo pase lo corrigió.
- Evidencia local: 90 pruebas dirigidas en Workers (60 de reservas/composición
  D1 y 30 de receipt). Los ocho escenarios nuevos usan D1 real efímera y mocks
  de observación/finalidad; no son prueba de RPC remoto, admisión de proveedores
  ni finalización económica real. Incluyen lectura posterior a expiración,
  revocación, falta de receipt, desacuerdo, error, finalidad vencida y estado held.
- No hay journal terminal, liberación de reservas, reenvío, ruta HTTP nueva,
  perfiles habilitados ni despliegue. Falta conectar persistencia/reconciliación,
  seguimiento Consumer y aceptación real para completar E4.

## Incremento 82 — localizar transacción desde UserOperation

- La observación propia puede iniciarse sin un hash de transacción. Consulta
  `eth_getUserOperationReceipt` una sola vez con el hash de la operación guardada,
  usando el bundler del perfil interno; no recibe URLs de un endpoint público.
- El transporte tiene plazo de cinco segundos, respuesta limitada a 256 KiB,
  HTTPS sin redirecciones y validación de envelope, userOpHash y hash no nulo.
  Ignora success, gas, logs y cantidades del bundler. El único resultado útil
  es una pista para los dos lectores de ejecución del incremento 81.
- Un hash conocido evita depender del bundler. Una respuesta nula no acredita
  ausencia onchain; error, respuesta excesiva o inválida conservan incertidumbre.
  En todos los casos se revalida propiedad después de observar y se mantienen
  las reservas. No hay reenvío ni proyección de saldo en este lector.
- Once escenarios adicionales usan fetch simulado y D1 efímera: pista válida
  sin receipt independiente, ausencia, operación ajena, hash cero, envelope
  incorrecto, error HTTP, límite de tamaño, error de transporte, revocación,
  hash conocido y configuración ausente. No son evidencia de un bundler remoto.
- Verificación final: suite completa de Workers V3 **1075 pruebas en 43 archivos**,
  exit 0, 130.69 segundos. TypeScript Server/runtime, ESLint dirigido, Knip,
  ciclos y descriptor Web pasaron. `git diff --check` sin errores, con avisos
  existentes LF/CRLF. El descriptor Web no cambió y no acredita despliegue.
- Sigue pendiente el journal terminal de transferencias, reconciliación,
  transporte/seguimiento Consumer y aceptación de testnet. No hubo despliegues,
  recursos nuevos, cambios de secrets, commits ni activación de mainnet.

## Incremento 83 — journal inmutable de finalidad de transferencias

- Migración local candidata `0017_transfer_finality_journal.sql`: una evidencia
  final por operación, con receipt y evaluación completos, checksums y fecha.
  El trigger impide UPDATE; no modifica estados de reservas ni saldos.
- `recordOwnedTransferFinality` llama al observador privado, no acepta un receipt
  enviado por HTTP. Contrasta operación, consentimiento, manifest, red, target,
  política fijada y frescura antes de insertar. La inserción verifica propiedad
  actual en SQL y vuelve a comprobar acceso después; nunca concede envío.
- Repetir la misma evidencia es idempotente, también concurrentemente. Una
  evidencia final diferente produce `conflict` y conserva la anterior. Una
  lectura incierta produce `not_recorded`, sin fallback a éxito histórico.
- Evidencia: **108 pruebas dirigidas en Workers** (78 de reservas/journal y 30
  de receipts), TypeScript Server/runtime, ESLint dirigido, Knip, ciclos y
  descriptor Web aprobados. Siete escenarios nuevos ejercitan D1 efímera con
  observación simulada: persistencia, concurrencia, conflicto, indisponibilidad,
  expiración, revocación y operación incorrecta. No acreditan finalidad remota.
- La migración no se aplicó remotamente. Falta la transición de reconciliación
  y saldo que libere reservas de manera coherente, jobs independientes de sesión,
  lectura histórica autenticada y seguimiento Consumer. E4 no está cerrado.

## Incremento 84 — conflictos de finalidad persistentes

- Revisión del journal detectó que `conflict` sólo existía en la respuesta de
  una petición: una lectura posterior idéntica al primer receipt podía volver
  a responder `recorded`. Todavía no liberaba fondos, pero era una condición
  incorrecta para la reconciliación pendiente.
- La migración candidata 0017 incorpora `transfer_finality_conflicts`, limitada
  a una fila por operación y protegida contra UPDATE. Guarda la primera evidencia
  contradictoria con checksums; conserva tanto la primera finalización como el
  conflicto. No admite resolución o borrado automático.
- La escritura del journal, captura de conflicto y lectura se realizan en un
  batch D1. Se comprueban propiedad, estado y manifest en SQL para ambas
  escrituras, y acceso nuevamente al finalizar. Una vez registrado el conflicto,
  futuras observaciones finales siguen devolviendo `conflict`, aunque vuelvan
  a coincidir con la evidencia original. Las reservas siguen intactas.
- Evidencia local: **109 pruebas dirigidas** (79 de reservas/journal y 30 de
  receipts), TypeScript Server/runtime, ESLint dirigido, Knip, ciclos y descriptor
  Web aprobados. Se amplió el caso de conflicto y se añadió concurrencia; se
  demuestra conservación de la primera contradicción e inmutabilidad SQL.
- Sin migración remota, despliegue ni habilitación de pagos. Sigue pendiente
  conectar reconciliación de saldo, lectura histórica y seguimiento Consumer.

## Incremento 85 — estado histórico propio y transporte HTTP de lectura

- `readOwnedTransferStatus` restaura la operación propia y contrasta checksums,
  vínculo con operación/consentimiento/manifest y evaluación histórica de finalidad.
  Revalida acceso después de D1. No interpreta evidencia vieja como autorización
  actual, ni consulta RPC, firma, entrega o modifica reservas al leer.
- GET `/app/v1/wallets/:wallet/accounts/:account/transfers/:operation` reutiliza
  autenticación Consumer, origins exactos y respuestas no-store. Rechaza query
  overrides y POST; IDs inválidos dan 400 y operación inexistente da 404.
- El DTO sólo expone localizadores propios, red, userOpHash, estado y confirmación
  histórica mínima (transaction hash, resultado de ejecución y fecha), con
  `settlement: not_assessed`, `send_enabled: false` y reserva explícita. No expone
  firmas, claim tokens, revisión privada, compromisos o URLs de proveedores.
- Conflicto durable se muestra como `review_required`; evidencia final sin
  conflicto como `confirmation_recorded`, no como pago económicamente liquidado.
- Evidencia: **115 pruebas dirigidas** en Workers (87 reservas/status y 28 wallet),
  con ocho casos HTTP nuevos y assertions del estado histórico/conflictivo.
  D1 es efímera real; los nuevos casos HTTP simulan el verificador de identidad,
  cuya criptografía se prueba por separado. No hay evidencia remota ni UI nueva.
- Falta conectar cliente/pantalla Next, estados terminales y reservas con saldo
  reconciliado, jobs y aceptación humana. No se desplegó este endpoint.

## Incremento 86 — cliente Next de seguimiento de transferencias

- `transfers.ts` conecta el GET propio mediante el transporte Consumer existente:
  respuesta acotada, plazo, no-store, sin cookies, redirecciones ni reintentos.
  Copia y valida el localizador antes de esperar token/red para evitar mezclar
  selecciones. El parser exige campos exactos, operación/cuenta/red esperadas,
  estados coherentes, hashes válidos y confirmación histórica mínima.
- `BrowserAuth.transfers(uid)` captura la sesión y carga el cliente de forma
  lazy; comprueba identidad antes/después de importar y consultar. No consulta
  al montar Home, no hace polling y no solicita passkeys. Falta el panel visual.
- El contrato de visualización rechaza `settled`/`paid`, permisos de envío,
  campos extra y fondos liberados incompatibles con el estado. Historia antigua
  válida se muestra como historia, no como cotización vigente.
- Evidencia: **717 pruebas Web en 26 archivos**, incluidos 21 casos nuevos de
  estados, contexto cruzado, forma inválida, historia y selección cambiada mientras
  se obtiene token. El build optimizado Next pasa. No prueba sesión ni pago remoto.
- Descriptor Web actualizado a `web-v3-a5ab3d152978b8b7608e3a4401af2fb7d354c40aead03afb4c20f7efae9a5260`,
  163 inputs normalizados. Es identidad de código local, no deploy.
- Siguen pendientes pantalla, flujo de envío completo, reconciliación/liberación
  de reservas, jobs y aceptación real. No hubo despliegue ni mainnet.

## Incremento 87 — panel Consumer de consulta manual

- `TransferProgress` se integra bajo la cuenta seleccionada de `WalletBalances`,
  con key por UID/wallet/account. Permite consultar una referencia de operación
  explícitamente; no empieza consultas al montar Home ni dispara WebAuthn.
  La referencia manual es provisional: el flujo de creación de envío debe
  proporcionarla automáticamente cuando se conecte de extremo a extremo.
- `TransferStore` borra datos al refrescar/cambiar referencia, cancela la consulta
  anterior y descarta respuestas tardías tras clear, dispose o cambio de sesión.
  Evita solicitudes duplicadas mientras una está en curso; no programa polling.
- UI ES/EN separa reservado, pendiente, expirado, confirmación histórica y revisión.
  Explica reservas pendientes, reversión con posible gas y conflictos; no ofrece
  reenviar ni afirma saldo disponible o settlement. Los hashes están en detalles.
- Evidencia: **723 pruebas Web** en 26 archivos; seis nuevas de ciclo de vida
  del store. Build Next optimizado, tipos, lint, Knip y ciclos aprobados.
  No se realizó todavía aceptación visual/interactiva en navegador de este panel.
- Descriptor `web-v3-dc029a0b76c3545125f5dcc6fd48bb8a5b4139647d7d581324fc32e1e7cb6ea6`,
  165 inputs. No despliegue. Falta validación visual, envío integrado, jobs,
  reconciliación/liberación de reservas y aceptación real para cerrar E4.

## Incremento 88 — interacción real del panel en Chromium local

- Harness repetible: `pnpm --filter @gatopago/web dev:transfers-harness`, sólo
  127.0.0.1:4183, componente React real en StrictMode y runtime sintético sin
  Firebase, RPC, firmas o fondos. Escenarios pendiente, confirmado, conflicto,
  error, respuesta demorada y cambio de sesión.
- Playwright CLI verificó cero consultas iniciales, una por acción, pendiente,
  conflicto y limpieza al fallar. Durante respuesta lenta, cambiar sesión dejó
  controles deshabilitados y descartó el resultado tardío. Cambiar ES/EN no
  agregó consulta. Consola sin errores durante los recorridos comprobados.
- Revisión visual a 390x844 sin desbordamiento horizontal. Se corrigió botón
  nativo pequeño usando `auth-secondary`; altura final medida 55.375 px.
  Captura local inspeccionada: `output/playwright/v3-transfer-mobile-final.png`.
  Los procesos de navegador/harness se cerraron al terminar.
- 723 pruebas Web, lint y tipos pasaron. Knip detectó inicialmente el harness
  sin entrada; se añadió comando package y volvió a pasar. Ciclos aprobados.
- Descriptor final `web-v3-901bf1454d1be827166e3a158ef9556f49eaf7004897793566c1626c6bebde80`,
  165 inputs. No despliegue. Esto no prueba Safari/iPhone real, autenticación
  remota, envío monetario ni cierre de E4; la reconciliación sigue pendiente.

## Incremento 89 — saldo observado después de la inclusión

- `observeTransferReconciliationBalance` conecta journal de finalidad y lector
  propio de saldos. Exige confirmación sin conflicto, balance de la cuenta/red
  correctas y los activos de la reserva; el bloque de saldo no puede preceder
  al receipt ni diferir en hash a la misma altura.
- Relee finalidad del receipt original después de los RPC de saldo, comprueba
  frescura y vuelve a consultar propietario, reserva y conflicto durable. Devuelve
  evidencia temporal con checksum del receipt, no una autorización de liberación.
- No resta el importe a una caché: el saldo real puede incluir movimientos ajenos
  al envío observado. Mantiene `release_enabled: false` hasta conectar el commit
  atómico y la protección contra cotizaciones anteriores al saldo reconciliado.
- Evidencia: **106 pruebas dirigidas en Workers** (93 reservas/reconciliación y
  13 saldos propios), tipos Server/runtime, lint, Knip, ciclos y descriptor Web.
  Seis casos nuevos de composición con D1 efímera y lectores simulados: saldo
  vigente, bloque antiguo, cuenta ajena, activos faltantes, expiración y reorg.
  No equivalen a prueba de proveedores reales ni a una reserva ya liberada.
- Sin despliegue. Siguiente dependencia: persistencia atómica del checkpoint de
  reconciliación y rechazo de balances/cotizaciones anteriores antes de liberar
  reservas, seguida de transporte de envío/jobs y aceptación E4.

## Incremento 90 — bloquear cotizaciones anteriores a reconciliación

- Migración candidata 0018 añade `wallet_balance_floors`: bloque mínimo por cuenta,
  hash y fecha. Trigger impide retroceder altura/fecha o cambiar hash a igual altura.
  No contiene montos ni reemplaza la verdad onchain.
- Reserva, claim y consumo del token de entrega incluyen la comparación en su
  propia escritura SQL. Si el checkpoint de la cotización precede al mínimo,
  o difiere de hash a la misma altura, no se crea/reserva/despacha esa operación.
  Un avance entre preflight y despacho deja el estado incierto retenido, sin I/O.
- Alturas canónicas se comparan por longitud y orden lexical, no mediante REAL
  ni casts de 64 bits. La creación del floor todavía corresponde al futuro commit
  atómico de reconciliación; este incremento no libera reservas ni lo escribe
  desde rutas HTTP.
- Evidencia: **114 pruebas dirigidas Workers** (101 reservas/reconciliación y
  13 saldos propios), tipos Server/runtime, lint, Knip y ciclos. Ocho casos nuevos
  D1: floor anterior/igual/posterior, hash diferente, altura 2^80, avance antes de
  claim/despacho y trigger monotónico. Recursos efímeros; sin migración remota.
- Pendiente conectar el commit de evidencia+floor+liberación, transición terminal
  y seguimiento de saldo. El goal E0–E4 sigue abierto; no hubo deploy ni mainnet.

## Incremento 91 — commit atómico de reconciliación y estado Consumer

- `reconcileOwnedTransfer` obtiene evidencia mediante el observador interno, no
  acepta un receipt o proof publicado por el cliente. Revalida cuenta, operación,
  consentimiento, sesión y vigencia antes de escribir; SQL vuelve a comprobar
  ownership, manifest y estado actual.
- Migración candidata 0019 guarda evidencia con checksum. Su trigger inserta el
  mínimo de bloque de saldo y pasa la reserva a `reconciled` dentro de la misma
  transacción. Una regresión de bloque o discrepancia de hash aborta los tres
  cambios. El journal debe coincidir y no puede tener conflicto registrado.
- La transición exige evidencia y el estado reconciliado no puede reabrirse.
  La reserva deja de computar en fondos retenidos; el mismo consentimiento no se
  puede reservar de nuevo. Repetir el coordinador después del commit se rechaza;
  la lectura de estado permite conocer el resultado sin reenviar fondos.
- API y cliente Next reconocen `reconciled`, contrastan el vínculo del registro
  y muestran reserva liberada, conservando el resultado original de ejecución.
  Liberar una reserva no convierte una reversión en pago exitoso ni constituye
  una nueva autorización de gasto. El saldo visible debe refrescarse aparte.
- Evidencia dirigida: 104 pruebas de reservas/journal/estado en D1 efímera,
  incluyendo commit, saldo retenido cero, imposibilidad de reabrir/reutilizar y
  rollback de evidencia+reserva ante un floor más reciente o hash distinto.
  RPC de estos casos es simulado; no prueba proveedores ni pagos remotos.
- 725 pruebas Web y build Next aprobados; tipos Server/runtime, lint dirigido,
  lint Web, Knip, ciclos y descriptor pasan. La suite Web descubrió un fixture
  A/B que podía producir el mismo ID aleatoriamente; ahora garantiza IDs distintos.
- Suite completa del runtime V3 Workers: **1.108 pruebas en 43 archivos**, exit 0,
  119,09 segundos. Incluye las 104 dirigidas anteriores; no son pruebas adicionales.
- Descriptor local `web-v3-d33df40e46edde050b7f47c1966ac5b8a959cd2589abb2d894d44247b712982a`,
  165 inputs. Pendientes: jobs de transferencias independientes de sesión, flujo
  HTTP/UI de envío completo, aceptación visual del estado nuevo y E2E humano.
  No hubo migraciones remotas, despliegue, commit, push ni mainnet.

## Incremento 92 — obligación durable de observar transferencias

- Migración candidata 0020 crea `transfer_jobs`. El paso held → delivery_pending
  inserta el job en la misma transacción; si la inserción falla, la entrega no
  queda reclamada. `beginDelivery` comprueba el ID mediante RETURNING porque el
  contador de cambios también incluye los triggers, no sólo la fila de reserva.
- El commit de reconciliación cierra el job y borra su lease en esa misma
  transacción. Un consumer tardío no puede volverlo a dejar pendiente.
- `TransferJobRepository` implementa descubrimiento acotado, lease de scheduler,
  claim de consumer, demora, revisión y backoff hasta ocho fallos. Los tiempos de
  lease y retry se comparan con el reloj de SQLite, no con el reloj JS del worker.
  Ninguno de esos métodos envía una UserOperation ni libera una reserva.
- Scope por proyecto y manifests admitidos. No necesita un JWT vigente para
  programar observación de un envío anterior; una cuenta de login deshabilitada
  no elimina esa obligación. Configuración vacía no descubre ni reclama jobs.
  Los mensajes contienen únicamente versión, tipo, operation ID y token de lease;
  rechazan firmas, JWTs y URLs de proveedores como campos adicionales.
- Evidencia local: **113 pruebas dirigidas Workers**, incluyendo nueve nuevas
  de rollback, concurrencia, lease vencido, scope, login deshabilitado, demora,
  revisión, agotamiento y payload. Reconciliación también verifica cierre del job.
- Pendiente conectar el procesador de observación independiente de sesión y los
  handlers de la cola/scheduler. El registro durable no equivale todavía a un
  worker que lo procese automáticamente. No se crearon colas ni recursos remotos,
  ni se aplicaron migraciones remotas o despliegues. E0–E4 siguen abiertos.

## Incremento 93 — observación bajo lease, sin simular identidad de usuario

- El observador RPC ahora comparte una única implementación entre el acceso
  Consumer autenticado y el acceso interno del job. Conserva dos proveedores,
  comparación de receipts, inspección de contratos, finalidad y hint acotado del
  bundler. Ninguno de los dos caminos transmite operaciones o libera reservas.
- `TransferJobRepository.observationSource` exige lease running vigente en D1,
  proyecto y manifest admitidos. Restaura y verifica criptográficamente la revisión
  histórica y la compara con operación, cuenta, red, nonce y digest persistidos.
  Relee desde primary después de la verificación y después de las consultas RPC.
- `observeTransferJob` no fabrica un VerifiedIdentity ni usa un JWT de una cola.
  Puede observar después de vencido el consentimiento o deshabilitado el login;
  eso no reautoriza el gasto. El acceso Consumer mantiene sus controles de sesión
  y propietario; cambio de contexto o pérdida del lease descarta el resultado.
- Evidencia local: **150 pruebas dirigidas** (120 reservas/jobs/observación y 30
  receipts). Siete casos nuevos: receipt, ausencia, login deshabilitado,
  consentimiento vencido, pérdida de lease durante I/O, token incorrecto y registro
  alterado. D1 real efímera y lectores/RPC simulados; no prueba operación remota.
- Tipos Server/runtime y lint dirigidos aprobados. Pendiente persistir journal y
  reconciliación desde este contexto de job, y conectar procesador/cola/scheduler.
  El objetivo E0–E4 sigue abierto. Sin deploy, recursos remotos o mainnet.

## Incremento 94 — journal de finalidad desde el job

- `recordTransferJobFinality` obtiene la observación mediante el lector interno
  con lease; no admite un receipt enviado por HTTP ni requiere una sesión Firebase
  vigente. SQL verifica el lease running, proyecto, hashes de revisión/operación,
  manifest y compromisos de identidad en las propias escrituras.
- `prepareTransferFinalityEvidence` centraliza los checks de vínculo, política,
  finalidad, vigencia y límites de tamaño para los writers Consumer y job. El
  Consumer mantiene además su control de expiración de sesión.
- Journal y primera contradicción se escriben en un batch D1; repetir la misma
  observación no duplica filas. La primera evidencia no se reemplaza y un conflicto
  permanece aunque después vuelva a observarse el receipt original. El reader
  vuelve a validar el lease y el contexto después de la escritura.
- Evidencia local: **156 pruebas dirigidas** (126 reservas/jobs/journal y 30
  receipts), tipos Server/runtime, ESLint dirigido, Knip, ciclos y descriptor Web.
  Seis escenarios nuevos: registro, login deshabilitado, conflicto persistente,
  concurrencia, evidencia vencida y pérdida del lease durante la observación.
  Los RPC de composición son simulados; D1 es efímera real.
- Este incremento registra evidencia, pero no libera fondos desde un job.
  Falta saldo/reconciliación bajo lease y conectar el runner a la cola/scheduler.
  No hubo migración remota, despliegue, commit, push o mainnet; E0–E4 abiertos.

## Incremento 95 — reconciliación bajo lease y conexión a la cola existente

- `reconcileTransferJob` une journal, saldo propio observado y revalidación de
  finalidad del receipt. Contrasta cuenta/red/activos, altura y hash, vigencia y
  contexto del lease. SQL exige ese lease al insertar la evidencia; los triggers
  actualizan floor, liberan la reserva y cierran el job atómicamente.
- El lector de balances recibe un contrato interno mínimo de resolución de
  cuenta. Consumer continúa resolviendo con sesión/ownership; el job resuelve con
  lease/proyecto/manifest, sin fabricar identidad Firebase. Las cuentas o activos
  de entrada no se obtienen de parámetros libres del mensaje.
- La liberación conserva el resultado de ejecución: una reversión puede consumir
  gas y debe reconciliarse, pero no se convierte en pago exitoso. Los casos de
  floor más reciente, cuenta ajena, evidencia vencida, conflicto o lease perdido
  mantienen la reserva y no crean evidencia de reconciliación.
- `transferJobHandlers` conecta wake/consume al scheduler y dispatcher existentes.
  Reutiliza la cola de Wallet Core, cuyo batch máximo actual es dos. No hay otro
  Worker ni cola nueva. Los subgrupos creación/activación/transferencia no pueden
  confirmar o reintentar mensajes ajenos mediante ackAll/retryAll.
- Si no hay receipt/finalidad confirmada, programa otra consulta en 30 segundos.
  Un envío sin resolver durante un día pasa a revisión; fallos usan backoff acotado.
  Nunca reenvía la operación ni libera fondos por timeout. Mensajes duplicados
  pierden el claim y no disparan nuevos RPC.
- Evidencia dirigida: **169 pruebas Workers** (138 reservas/jobs/reconciliación,
  13 balances y 18 activation jobs), tipos Server/runtime, ESLint, Knip, ciclos y
  descriptor Web. Incluye cierre con login deshabilitado, ejecución revertida,
  rollback y recorridos de wake/cola con D1 efímera y RPC simulados.
- Suite completa V3 Workers: **1.142 pruebas en 43 archivos**, exit 0 en 133,14
  segundos. Incluye las dirigidas; no equivale a un smoke remoto ni a verify:all.
- La resolución de configuración permanece explícitamente deshabilitada hasta
  admitir manifests/proveedores reales. Conectar handlers en el código no es un
  despliegue. Pendientes: admisión, flujo completo de envío HTTP/Next, evidencias
  onchain reales, aceptación humana y restantes gates E0–E4. Sin cambios remotos.

## Incremento 96 — preparación privada de la propuesta de envío

- `prepareOwnedTransfer` conecta ownership en primary D1 con lectores de seguridad,
  balances y nonce en el mismo checkpoint. Las reservas se leen antes y después
  de la observación; cambios de acceso, contexto o importes descartan la propuesta.
- Los presupuestos disponibles se calculan con enteros exactos como saldo observado
  menos reservas. La propuesta soporta importes exactos y MAX de nativo/ERC20,
  conservando el presupuesto de gas y la comisión explícita del activo de envío.
- Scope, manifests, proveedores, finalidad y términos de coste son entradas
  privadas admitidas, nunca pruebas aportadas por HTTP. Los términos se vinculan
  a solicitud, wallet account y deployment; caducan en un máximo de 60 segundos.
  La validez final no supera la de sesión, términos ni observaciones.
- El resultado incluye contexto y evidencia para la autorización criptográfica
  existente. No persiste una revisión, reserva nonce/fondos, solicita passkeys,
  simula ni transmite. Los términos internos tampoco equivalen a una estimación
  real: falta conectar la política de costes/proveedores y el preflight firmado.
- Evidencia local: **168 pruebas dirigidas** (155 preparación/reservas/jobs y
  13 balances). Los 17 casos nuevos cubren exact/MAX, nativo/token, reservas,
  identidad/nonce/saldo inconsistentes, RPC fallido, términos vencidos o ajenos,
  perfil no admitido, revocación, cambios durante lectura y snapshot de inputs.
  Se comprueba además autorización con firmas reales del fixture y ausencia de
  nuevas reservas. D1 efímera real; lectores RPC simulados en la composición.
- Tipos Server/runtime, lint dirigido, Knip, ciclos y descriptor Web aprobados.
  No se repitió la suite completa ni se alteró el frontend. Pendientes: persistir
  la revisión, exponer preparación/confirmación autenticadas y conectarlas a Next,
  admisión real y recorridos E0–E4. Sin commit, push, despliegue o cambios remotos.

## Incremento 97 — revisión sin firma durable y ligada al propietario

- `transfer_preparations` (migración local 0021) conserva la propuesta sin firma,
  su digest, pin de deployment, contexto económico, política, scope y caducidad.
  Un trigger impide modificarla. Prepararla no crea reservas de fondos ni nonce.
- `TransferPreparationRepository` valida la evidencia interna antes de guardar;
  escribe con ownership/proyecto/pin en SQL, limita a 16 revisiones vigentes por
  wallet account y elimina sólo sus revisiones vencidas. Reintentos del mismo
  digest reutilizan la revisión original, incluso cuando se alcanzó el límite.
- Restaurar exige sesión, cuenta, pin actualmente admitido y scope exactos.
  Revalida también la época de autenticación original: un login nuevo no revive
  una propuesta anterior revocada. Una segunda lectura en primary detecta esa
  revocación durante la restauración, aunque la sesión nueva siga siendo válida.
- El codec comparte reconstrucción canónica de contexto con el journal firmado,
  pero separa explícitamente `readTransferDraft` de `readTransferReview`. Una
  revisión sin pruebas no pasa como consentimiento histórico, y un registro
  firmado no se acepta como draft. Se preserva la verificación criptográfica.
- Pruebas: 13 escenarios nuevos de persistencia con D1 efímera; 14 pruebas del
  codec firmado/draft. Suite completa V3 Workers: **1.172 pruebas / 43 archivos**,
  exit 0 en 137,34 segundos. Tipos Server/runtime, lint dirigido, Knip, ciclos y
  descriptor Web aprobados. Sin RPC real ni operación monetaria remota.
- La restauración no devuelve autoridad de envío. Falta conectar confirmación a
  esta revisión con evidencia independiente vigente, firmas y reserva atómica,
  además de las rutas HTTP y Next. No se guardan tokens Firebase ni claves
  privadas. No hubo migración remota, commit, push, deploy o activación de redes.

## Incremento 98 — confirmación de la revisión guardada y reserva ligada a ella

- `confirmOwnedTransfer` restaura la revisión propia y exige el digest revisado
  y el quorum criptográfico antes de consultar RPC. No recibe contexto económico,
  balances, política o nonce del navegador. Scope y perfiles siguen siendo privados.
- Relee seguridad, saldo y nonce en el bloque exacto de la revisión, y comprueba
  su finalidad antes y después. No cambia destino/importe/MAX/costes ni extiende
  la ventana firmada. La observación de saldo admite una lectura posterior del
  mismo bloque con su timestamp verdadero, nunca uno retrodatado ni futuro.
- Después de verificar evidencia y firmas, relee ownership y revisión. La reserva
  incorpora el ID/checksum de la revisión: SQL exige que aún exista, corresponda
  al mismo consentimiento y no esté vencida ni revocada. El checksum del draft
  se reconstruye también a partir del consentimiento criptográficamente verificado.
- Confirmar de nuevo el mismo consentimiento devuelve su estado existente sin
  nuevos RPC, reservas ni envío. Antes se vuelven a comprobar firmas, propietario,
  revisión y alcance. El preflight de estado actual y simulación firmada siguen
  siendo obligatorios antes de transmitir; esta función sólo confirma/reserva.
- Evidencia local: **182 pruebas Workers dirigidas** y **54 de autorización/codec**.
  Casos nuevos: nativo/token, repetición, digest/firma inválidos, nonce/saldo/política
  distintos, fallos RPC/finalidad, vencimiento, revocación, reservas concurrentes
  y revisión eliminada. D1 efímera y firmas reales sintéticas, lectores RPC simulados.
- **725 pruebas Web** y build Next aprobados. Tipos Server/runtime, lint dirigido,
  Knip y ciclos aprobados. Descriptor Web actualizado al hash
  `1a5db3b0ca0620819d9d15cf01e9222c96d7b5f18fa8c007efed8e1f77db7821`
  por el cambio de validación compartida; no es un despliegue ni una admisión.
- Pendiente exponer preparación/confirmación/entrega mediante rutas autenticadas,
  la UI de envío Next, costes/proveedores admitidos y evidencia onchain/humana.
  No se repitió la suite Workers completa en este incremento. Sin cambios remotos,
  commit, push, migraciones remotas, redes habilitadas o mainnet; E0–E4 abiertos.

## Incremento 99 — transporte HTTP Consumer para transferencias

- El entrypoint V3 incluye `transferRoute`, separado del árbol V1/V2 y de Payments.
  Bajo `/app/v1/wallets/:wallet/accounts/:account` expone:

  | Método | Ruta relativa | Función |
  |---|---|---|
  | POST | `/transfer-preparations` | Resolver costes/finalidad internos, preparar y guardar la revisión |
  | GET | `/transfer-preparations/:id` | Restaurar la revisión propia, sin RPC ni renovación |
  | POST | `/transfer-preparations/:id/confirm` | Verificar pruebas del digest guardado y reservar |
  | POST | `/transfers/:id/deliver` | Preflight, claim durable y único intento de transmisión |

- Origen/API/RP, método/CORS, versión del cliente, Firebase/ownership y red/manifest
  admitidos se comprueban en el servidor. Preparación debe coincidir con wallet,
  red y release de la petición. Confirmación/entrega no pueden reutilizar contexto
  de otra release; entrega también contrasta el scope de la firma guardada.
- `transferWire` acepta sólo digest y pruebas públicas acotadas para confirmar,
  o sólo digest para entrega. Rechaza campos extra, índices repetidos, transportes
  desconocidos y bytes no canónicos. Ninguna respuesta devuelve proveedores,
  claves, JWT ni las firmas guardadas. Las respuestas son no-store.
- El catálogo puede admitir varios activos por red; cada operación selecciona
  exclusivamente su activo más el nativo para gas, conservando el mismo pin.
  Los límites/proveedores/finalidad siguen siendo configuración privada, no body.
- Evidencia dirigida: **202 pruebas Workers** y **12 de wire**. Veinte escenarios
  nuevos HTTP: métodos/origen/CORS, queries, versión, propietario, límites de body,
  campos extra, red/perfil/activo, lectura, despacho y digest/release cruzados.
  En esta capa se simulan identidad/coordinadores y se usa D1 efímera real; las
  pruebas de los coordinadores y firmas se registran por separado. No es E2E remoto.
- Descriptor Web actualizado a
  `fe3fa7679ee2a34372c4832aafec600719fc7b66ecf51dab55053ce78733544f`
  con 166 inputs por el nuevo contrato compartido. Configuración real mantiene
  catálogo vacío, entornos sin aprovisionar y ninguna red habilitada.
- Pendiente consumir estas rutas desde Next, reconstruir la revisión en cliente,
  UI/firma explícita, estimación/admisión real y pruebas onchain/humanas E0–E4.
  No hubo despliegue, commit, push, provisión, cambios de secrets/DNS o mainnet.

## Incremento 100 — preparación de transferencias reconstruida en Next

- Se comparte el codec canónico de revisión y de pruebas públicas entre Worker y
  Web, sin dependencias de D1, Firebase o RPC en esos módulos. Activation utiliza
  el mismo decodificador de política pública; no se mantienen dos implementaciones.
- `transferPreparationClient` solicita/restaura la revisión por HTTP autenticado.
  El cliente reconstruye llamadas, importe/MAX y digest y contrasta cuenta, wallet,
  instancia, red, manifest fijado, EntryPoint, solicitud original, release, RP/origen
  y caducidad. No confía sólo en el checksum enviado por el servidor. La revisión
  sigue siendo una propuesta sin firmas y devuelve `send_enabled=false`.
- BrowserAuth captura la sesión exacta antes de cargar el cliente lazy, copia la
  selección/solicitud antes de esperas y vuelve a comprobar sesión al regresar.
  No solicita passkeys al construirlo ni hace polling o reintentos automáticos.
- Perfil de transporte específico: 50 segundos y respuesta de hasta 1 MB para
  el JSON que contiene la revisión canónica (esta conserva su límite de 150.000
  caracteres). Las otras operaciones conservan 15 segundos/32 KB. La API mantiene
  su plazo de 45 segundos. No se amplían límites por valores recibidos del servidor.
- Bug de integración corregido: el esquema de TransferRequest permitía releases
  de 64 caracteres, pero la release Web content-addressed tiene 71. Se alinea con
  el límite de 80 de compatibilidad HTTP; se regeneran validadores standalone y
  se prueban release real, frontera 80/81 y caracteres inválidos.
- Evidencia: **753 pruebas Web / 27 archivos y build Next aprobados**; **29 pruebas
  Node dirigidas** de transferencias/codec, **202 Workers dirigidas**. Tipos Web,
  Server/runtime, lint Web/Server dirigido, Knip y ciclos aprobados. Las pruebas
  de sesión utilizan SDK simulado, no una identidad Firebase real ni firma humana.
- La suite completa del incremento 99 terminó con **1.211 pruebas / 43 archivos**,
  exit 0. Se repitió tras los cambios del incremento 100: **1.211 pruebas / 43
  archivos**, exit 0 en 135,30 segundos. Lint de los tres codecs compartidos
  también aprobado con configuración explícita, sin archivos ignorados.
- Release local: `web-v3-3cc0d06d3d9a476d80a4ac99ffe5b250c746a42b9b8b96597805660f806b7639`
  (170 inputs). No es una versión desplegada.
- Pendiente: UI de revisión/envío, recolección explícita de firmas, cliente de
  confirmación/entrega, configuración real de estimación/admisión y recorridos
  testnet/humanos. No hay nuevas redes admitidas, cambios remotos, commits ni push.
  E0–E4 siguen abiertos.

## Incremento 101 — confirmación, entrega y control de ejecución en Next

- `transferCommandClient` confirma la preparación exacta con pruebas públicas
  acotadas, verifica el quorum criptográfico localmente y vuelve a comprobar
  caducidad antes/después de adquirir el token. El Worker sigue verificando por
  separado sesión, propiedad, evidencia actual y reserva. No se envían presupuestos,
  políticas o proveedores elegidos por el navegador.
- La entrega requiere el recibo `held` del mismo consentimiento y usa únicamente
  operación/digest. Recibos estrictos contrastan IDs, hash de UserOperation,
  caducidad y estados; `accepted`/`uncertain` nunca significan settlement. Un recibo
  tardío se conserva, aunque la ventana de firma haya expirado durante la respuesta.
- Perfil de transporte para comandos: 50 segundos y 32 KB de respuesta, sin
  polling, redirects, cookies o reintentos automáticos. Preparación conserva su
  perfil de respuesta mayor. El serializador compartido sólo transporta pruebas
  públicas, copiadas y validadas; no invoca gestores de claves.
- BrowserAuth liga comandos a una sesión exacta, con snapshots antes de imports
  lazy/verificación y comprobaciones al regresar, incluso si cambia el objeto
  de sesión conservando el mismo UID.
- `TransferExecutionFlow` implementa el control que consumirá la UI: confirmación
  no dispara entrega; bloquea concurrencia/dobles clics y reload durante mutaciones;
  pierde datos visibles al cambiar sesión y descarta resultados tras desmontaje.
  Una entrega incierta nunca vuelve a estado enviable, ni si una lectura todavía
  observa `held`. Conserva la referencia para consultar estado. Una confirmación
  incierta sólo se reintenta explícitamente con la misma revisión vigente.
- Evidencia: **795 pruebas Web / 28 archivos y build Next aprobados**, incluidas
  **42 pruebas dirigidas** de comandos/control; firmas sintéticas criptográficas
  reales para el cliente, SDK/comandos simulados para lifecycle. **26 Node** de
  wire/codec y **202 Workers dirigidas** aprobadas. Tipos Server/Web/runtime, lint,
  Knip, ciclos y descriptor aprobados. La última suite Workers completa corresponde
  al incremento 100 (1.211); no se presenta como una nueva ejecución completa.
- Release local `web-v3-eafba0983a26335527546f347ee65f1ac1bddd4afb0254470688198f708a569f`
  (172 inputs). No se ha publicado ni admitido una red.
- Pendiente conectar estos clientes/control a la pantalla de revisión y a la
  recolección explícita de passkeys/pruebas externas, configurar costes/proveedores,
  y cerrar recorridos E0–E4 testnet/humanos. No hubo commit, push, cambios remotos,
  migraciones remotas o mainnet. No se declara la app terminada.

## Incremento 102 — panel de revisión y firma explícita

- `TransferReview` integra revisión, colección de pruebas y `TransferExecutionFlow`.
  Presenta dirección, importe/MAX, red, gas máximo, fee y digest. Firmar, confirmar
  y enviar son acciones separadas; no se prepara ni firma al entrar. Un cambio de
  usuario/cuenta/solicitud/revisión reemplaza la instancia y descarta sus pruebas.
- `TransferSigning` conserva pruebas sólo en memoria de la instancia. Cada
  credencial debe corresponder a un signer SPEND no asistido de la política
  revisada. La llamada a la ceremonia es síncrona dentro del gesto, sin import,
  token o HTTP previo; respuestas tardías, sesión distinta y vencimiento rechazan
  el factor. No se confunde registro de credencial con disponibilidad del dispositivo.
- Se comparte `verifyTransferProof` para validar cada factor contra la política
  original; el quorum completo sigue siendo obligatorio antes de confirmar.
  Firmas externas ECDSA se verifican sobre el digest exacto y nunca solicitan seed
  o clave privada. No se agregó WalletConnect/Reown ni proveedor de wallets.
- Sin una credencial coincidente se ofrece ir a Seguridad. El panel se conserva
  sólo como candidato local: falta el formulario de envío que obtiene selección,
  metadata de activos, credenciales y preparación. ERC20 todavía se presenta en
  unidades mínimas mientras no se integre metadata validada; no es la UX final.
- Evidencia: **805 pruebas Web / 28 archivos**, build Next y **54 Node dirigidas**
  de autorización/codec aprobadas. **Suite completa Workers: 1.211 pruebas / 43
  archivos**, exit 0 en 142,20 segundos. Tipos Server/Web, lint, Knip y ciclos pasan.
- Harness `pnpm --filter @gatopago/web dev:transfer-review-harness`: Chromium
  con React StrictMode, viewport móvil 390×844, cero ceremonias al montar y una
  ceremonia sintética cancelada al pulsar. Confirmación siguió deshabilitada;
  cambiar sesión retiró la revisión; consola sin errores. Captura local
  `output/playwright/v3-transfer-review-mobile.png`, inspeccionada visualmente.
  El harness no usa un autenticador real, Firebase, RPC ni fondos. La captura
  precede al ajuste final de clases de botones; no equivale a auditoría visual final.
  Se cerraron navegador y servidor local del harness al terminar.
- Release local: `web-v3-97ad626b5ee460010a916bb29106c058a013eaabd5e3817515cac9b1e79045a1`
  (174 inputs). Sin publicación, cambios remotos, admisión de redes o mainnet.
  E0–E4 siguen abiertos; restan integración completa del envío, estimación/admisión
  reales, seguridad/recuperación/salida y aceptación humana/onchain.

## Incremento 103 — formulario de envío y metadata de presentación

- `TransferForm` conecta entrada de activo/destino/importe/MAX con preparación y
  `TransferReview`. Descubre credenciales públicas en lotes de cuatro antes de
  iniciar la ventana económica corta; no invoca gestores de passkeys ni registra
  credenciales. Una edición aborta la preparación pendiente y descarta resultados
  tardíos. Tras obtener la revisión, el formulario se reemplaza por ese consentimiento.
- `transferAssets` liga la metadata de la lectura validada de balances a wallet,
  instancia, red y dirección. Copia sólo asset ID, símbolo y decimales; no utiliza
  el saldo observado como fondos disponibles. MAX permanece como intención para
  que Wallet Core descuente reservas y costes. No se inventan decimales.
- La revisión ahora exige metadata del activo y del nativo: importe, gas y fee
  se muestran en sus unidades decimales exactas. Los identificadores completos
  permanecen disponibles para distinguir tokens que comparten símbolo.
- El formulario admite punto/coma decimal sin flotantes; rechaza exponentes,
  redondeo, exceso de precisión, importes cero y destinatarios inválidos. Comprueba
  checksum de direcciones mixtas antes de normalizarlas al lowercase requerido
  por el contrato HTTP. No supone que un destinatario sea EOA.
- Evidencia: **832 pruebas Web / 29 archivos y build Next aprobados**, incluyendo
  27 nuevas pruebas de formulario/metadata/renderizado estático; las 79 dirigidas
  de formulario y revisión también pasan. Tipos Web, lint, Knip, ciclos y descriptor
  aprobados. No se repitió la suite Workers en este incremento (última completa:
  incremento 102, 1.211). No hubo nueva prueba de navegación de este formulario.
- Release local `web-v3-33d6663abf94476d7e98a11e3f83babb82942ded45b8ff4d88117431339eef23`
  (176 inputs). Sin commit/push, despliegue, redes habilitadas o cambios remotos.
- Pendiente conectar el listado de wallets con una selección criptográfica propia
  verificada (account ID, address y deployment pin), montar este formulario en el
  recorrido Consumer, probar edición/cancelación en navegador y completar admisión,
  estimación, seguridad/salida y recorridos humanos/onchain E0–E4. No es todavía
  una opción operativa visible en la app desplegada.

## Incremento 104 — contexto privado de cuenta para conectar el envío

- Nuevo GET `/app/v1/wallets/:wallet/accounts/:account/context`. Resuelve propiedad
  con la sesión autenticada y exige un único perfil admitido por el servidor.
  Contrasta red, generación, estado del manifest y dirección CREATE2 derivada.
  No consulta RPC, crea cuentas, registra credenciales ni concede permisos monetarios.
- Devuelve exclusivamente identidad pública y documento/pin del despliegue;
  no serializa commitments, proveedores, URLs RPC ni credenciales operativas.
  `send_enabled` y `receive_enabled` permanecen false, con readiness no evaluado.
  Conserva la frontera HTTP existente de Origin, autenticación, métodos y no-store.
- El cliente Next valida el contexto contra una lista de pins independiente de
  la respuesta HTTP. Rechaza un manifest autoafirmado, duplicado, alterado o una
  dirección no derivable. Captura selección y pins antes de adquirir el token;
  no realiza I/O sin admisión o ante cancelación previa. No reintenta automáticamente.
- Evidencia: **848 pruebas Web / 30 archivos y build Next aprobados**; **36 pruebas
  Workers dirigidas** de propiedad/lecturas, incluidas ocho nuevas del contexto.
  Tipos Server/Web/runtime, lint dirigido Server y completo Web, Knip y ciclos
  aprobados. `git diff --check` sin errores, con avisos LF/CRLF existentes.
  La última suite Workers completa sigue siendo la del incremento 102 (1.211).
- Release local `web-v3-dd2130af950d30808f1611ecc10971519c43b08c31cb9d205b39ad0fb5d658ad`
  (177 inputs). Sin commit/push, despliegues, migraciones remotas o mainnet.
- Pendiente conectar este cliente a BrowserAuth y al flujo visible de wallets,
  admitir los pins revisados en la versión web y comprobar el recorrido completo
  con el formulario. Estas pruebas no son evidencia de envío real ni cierran E0–E4.

## Incremento 105 — envío conectado al listado Consumer

- `BrowserAuth.accountContexts` captura la sesión exacta, preserva la selección
  antes del import lazy y comprueba la sesión antes/después de token y respuesta.
  La lista de deployment pins pertenece al release Web por ambiente; continúa vacía
  hasta admitir artefactos revisados. El emulador no habilita operaciones monetarias.
- `WalletBalances` monta `TransferEntry` por UID/wallet/instancia, mediante carga
  diferida. El botón Enviar inicia una lectura privada explícita, valida el contexto
  contra la metadata del saldo y abre `TransferForm` → `TransferReview`.
  No dispara preparación, registro ni ceremonia al montar.
- La apertura conserva un snapshot propio de metadata, nunca usa el saldo como
  presupuesto. Una observación ya vencida impide abrir; una vez abierto, vencer o
  refrescar el saldo no elimina una revisión/operación activa. Cambiar de cuenta
  reemplaza la instancia; cambiar sesión descarta su contenido y lecturas tardías.
  Se bloquean cambios de selector/página durante las mutaciones protegidas por
  el guard de recarga, también comprobando el guard dentro del handler.
- `TransferEntryStore` rechaza doble clic, contexto cruzado, saldo ausente/futuro,
  cancelación y reemplazo de sesión con el mismo UID. No reintenta automáticamente.
  La implementación de React tolera el replay de efectos de StrictMode.
- Evidencia: **863 pruebas Web / 31 archivos y build Next aprobados**, incluyendo
  14 pruebas nuevas de entrada/lifecycle/admisión y una nueva de BrowserAuth;
  49 dirigidas de entrada y autenticación aprobadas. Tipos Web, lint, Knip y ciclos
  pasan. No se repitió Workers/Foundry en este incremento de frontend.
- Harness local `/?entry`: React StrictMode + componentes reales con adaptadores
  sintéticos, Chromium móvil 390×844. Se comprobó abrir sin firmas, editar durante
  preparación, descartar su respuesta tardía, revisar el nuevo importe exacto,
  conservar revisión al vencer saldo, una ceremonia explícita cancelada y limpiar
  al cambiar sesión. Cero errores de consola. Captura inspeccionada:
  `output/playwright/v3-transfer-entry-mobile.png`. No prueba Firebase, un
  autenticador real, contratos remotos, balances reales ni transferencia monetaria.
  Se cerraron el navegador y el servidor local del harness al terminar.
- Release local `web-v3-d77c268353ba7833768c2c8a6d49eb14a118851a2655b2a9690a9f6e224e1e3a`
  (180 inputs). Sin commit, push, despliegues, cambios remotos o mainnet.
- La integración local ya no deja el formulario aislado del Consumer. Siguen
  pendientes admisión de despliegues/proveedores/costes, perfiles operativos,
  recorridos reales de envío/seguridad/recuperación/salida y cierre de E0–E4.

## Límites de la evidencia

Esta entrega inicial no cierra E0 ni Gate A. No se han creado recursos remotos,
cambiado DNS/secrets, emitido correos, desplegado contratos/Workers/frontends,
movido fondos ni eliminado cuentas. E1–E4 conservan sus gates pendientes; el
avance parcial de Web no reduce ese alcance.
