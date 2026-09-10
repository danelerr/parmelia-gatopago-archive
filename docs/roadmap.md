# Roadmap técnico de GatoPago

**Última revisión:** 9 de septiembre de 2026
**Estado:** Fase 3 App promovida; candidato Fase 4A descartado y reemplazado por
la especificación Account V3. No promover `0038` ni el modelo `home/satellite`;
V3 FUSION revisión 2 incorpora Next.js, ambientes y Platform. Consumer es la
primera entrega; API/Business se publican después. Estado remoto de los cortes
anteriores no revalidado en esta revisión documental.
**Fuente inicial:** [auditoría técnica del 23 de agosto de 2026](./audits/2026-08-23.md)

Este archivo es la única lista de trabajo técnico. El corte de Fase 2.1 está en el
[registro del 26-08-2026](./operations/phase-2-1-live-readiness-2026-08-26.md) y
la promoción correctiva actual en el
[registro de Fase 3 del 28-08-2026](./operations/phase-3-release-readiness-2026-08-28.md).
Un testnet desplegado y sano no demuestra readiness de mainnet ni sustituye un
pago E2E con evidencia on-chain.

## Implementación V3 — orden vigente E0–E8

La especificación y los criterios detallados están en
[V3 FUSION §14](./architecture/V3-FUSION.md#14-orden-de-implementación-recomendado--revisión-2).
Este backlog conserva el estado de ejecución; definir una etapa no la completa.

- [x] **Refinamiento de diseño revisión 2:** Next consumer, landing local,
  dominios/RP, ambientes, Accounts, owners de API/Flow/ledger, ADR-011–018,
  gates W/P y prioridad Consumer incorporados a V3 FUSION.
- [ ] **E0 — Especificaciones ejecutables:** cerrar structs/manifests y Gate A;
  schemas de ambiente, identidad, rutas y API; protocolo de operación firmado.
  En curso: IDs/unidades, schemas estrictos, política de roles/thresholds y
  vectores EIP-712/CREATE2 cruzados TS/Solidity implementados localmente.
  Verificador WebAuthn V3 con RP/origin ligados a la key y P256 real: 17 tests
  Foundry, incluida una assertion Chromium virtual contrastada con OpenSSL.
  Quorum y enrolamiento criptográfico candidatos implementados: 39 tests nuevos
  de policy/signatures/enrollment, además de los vectores. No instalan signers
  ni reemplazan las transiciones de Account V3 o el threat review independiente.
  Biblioteca stateful posterior: prepare/commit/recovery/veto/expiry/freeze sobre
  el namespace real; 25 unitarias/fuzz, dos invariantes y un recorrido del handler.
  No equivale a Account/4337, factory, upgrade ni cierre de Gate A.
  [Evidencia, límites y siguiente trabajo](./operations/v3-e0-e4-implementation.md).
- [ ] **E1 — Staging y procedencia:** inventariar la landing en
  `C:\Users\danie\OneDrive\Desktop\parmelia-landing\parmelia-landing`,
  preservar cambios locales aprobados y verificar recursos/orígenes/credenciales
  por ambiente. No reutilizar producción como staging.
  Inventario local de 218 archivos y cuatro capturas base registrado;
  recursos remotos y matriz completa de rutas aún pendientes.
- [ ] **E2 — Next Web:** `apps/web/`, landing ES/EN/legales/docs, login,
  Consumer/checkout shell, rutas, PWA y actualización; evidencia web de Gate W,
  cuyo cierre integral con Account V3 corresponde a E4.
  Iniciada localmente: Next 16.3.4, landing ES/EN e interacciones; Google/magic
  link y sesión probados con Auth Emulator, incluidas recarga/logout y segundo
  navegador. La ruta de magic links V3 ya tiene candidato y pruebas D1 locales;
  PWA local con instalación/recarga, offline neutro y actualización natural con
  dos pestañas comprobada en Chromium; 454 unitarias Web tras el incremento 41. Compatibilidad de
  identidad integrada: 409 antes de I/O, allowlist con expiración, descriptor
  de fuentes compartido y guard de build Web/Worker; 518 pruebas runtime V3
  tras el incremento 45. El consentimiento inicial tipado y persistente del
  incremento 24 tiene 23 unitarias y 13 runtime propias. El 25 agrega inspección
  de composición y constructor de UserOperation con dos pruebas WebAuthn;
  verifica creación y receipt en Anvil con contratos reales (363 pruebas V3
  totales). El 26 conserva ambas pruebas y la operación exacta con outbox
  atómico; añade 23 runtime de recarga, concurrencia, rollback, corrupción y
  revocación antes de commit. El 27 agrega despacho privado con lease,
  composición/simulación y frontera `sending` persistente; 46 nuevas runtime
  cubren concurrencia, grants, fallas SQL/RPC y respuesta incierta sin reenvío.
  El 28 verifica eventos/receipt, coste y composición con dos RPC independientes;
  el 29 persiste observaciones con lease, append/head atómicos y recuperación
  sin bundler a partir de un hash verificado. 26 nuevas runtime cubren journal,
  concurrencia, rollback, corrupción, revocación y cambios de bloque. El 30 añade
  finalidad por política con pin, quorum en altura común, frescura/vigencia y
  defensa contra cambio de un receipt previamente finalizado; 46 pruebas de
  finalidad y 38 del journal. La finalidad sólo tiene evidencia sintética local:
  faltan políticas/proveedores admitidos y comprobación real por red. Los
  incrementos 31–32 leen política/manifest/nonces actuales con dos RPC,
  finalidad vigente y revalidación de sesión/ownership; no prolongan evidencia
  caducada. El 33 proyecta Wallet/identidad/instancia/bootstrap mediante batch D1,
  conserva procedencia del receipt y detiene el sweep de creación. Otra red
  reutiliza la misma identidad; no hay activación ni permiso monetario implícito.
  El 34 añade GET autenticado de credenciales persistidas y su lista en Next:
  reload, error distinto de vacío y aislamiento entre sesiones, sin ceremonias
  automáticas ni afirmaciones de autoridad onchain. Chromium virtual y D1 local
  comprueban el recorrido y los límites, no sustituyen dispositivos físicos.
  Hay 460 unitarias/integración V3 y 518 runtime (evidencia del 45), incluidas 20 de proyección, 23 de jobs y
  13 de lectura del seguimiento. El 41 muestra ese seguimiento en Next, sin
  RPC/envíos al consultar ni confundir bootstrap histórico con cuenta activa.
  El 42 añade compilación/verificación de activación prepare/enrollment/commit:
  36 pruebas y una integración Anvil que instala política, envía con ECDSA y
  prueba admin con dos claves sin el dominio. El 43 conecta preparación/autorización
  con D1, ownership e inspección finalizada vigente (25 pruebas nuevas), sin
  reservas globales ni renovación en GET. El 44 persiste la confirmación separada,
  revalida propuesta y bloque revisado sin cambiar el mensaje firmado al avanzar
  el head (25 nuevas runtime). En ese incremento faltaban HTTP, jobs y pantallas; no
  acredita salida humana ni admisión de red. El 45 corrige localmente ese bloqueo:
  aceptación de hasta 300 segundos y vida de propuesta firmada independiente
  (máximo siete días; recovery suma la demora anterior). Commit mantiene otra
  firma breve y el vencimiento absoluto. D1/ABI/vectores y modelo independiente
  coinciden; 266 Foundry pasan y Anvil completa activación tras una hora.
  Los siete días no son renovación automática. No demuestra finalidad real ni
  una pantalla completa. El 46 monta las seis rutas HTTP propias de activación
  y commit: sesión, origen, admisión, entrada estricta y padre correcto; 21 nuevas
  pruebas HTTP y 539 runtime totales pasan. GET/replay no renuevan ni ejecutan.
  El 47 añade el cliente Next diferido de las seis acciones, ligado a sesión y
  a un perfil aprobado independiente. Reconstruye y valida los consentimientos;
  514 Web, 460 unitarias V3 y 541 runtime pasan, además de la build Next y dos
  pruebas de conformidad contra D1 real local. Siguen pendientes entrega/observación y UX
  de factores para activación, admisión de red y recorridos humanos de E4.
  El 48 incorpora detalle privado de credenciales y revisión Next de llaves,
  quorum y demoras; lectura explícita, sin firmas ni POST. 564 Web, 552 runtime
  y 460 unitarias V3 pasan. El borrador de passkeys muestra la dependencia del
  dominio y mantiene activación deshabilitada: no reemplaza factores de salida
  independiente ni cierra el recorrido E4. Chromium sintético confirma
  móvil/desktop, reintento y descarte de estado al cambiar sesión.
  El 49 añade revisión avanzada de tres guardianes ECDSA: gasto cotidiano por
  passkey, administración con dos votos y recovery 2-de-3 con 72h. El cliente
  exporta/importa pruebas EIP-712 ligadas a la propuesta, sin proveedores de
  wallets ni secretos del usuario. Direcciones distintas no prueban independencia;
  falta coordinar ceremonias, entrega/observación de activación y drill de salida.
  El 50 conecta la política avanzada a preparación/autorización en Next: dos
  gestos distintos de la llave inicial y tres pruebas externas de guardianes,
  con restauración por localizador público y GET del mismo recurso. Cancelar
  una prueba local no se confunde con un POST incierto; ese último conserva
  bytes/ID exactos y nunca reintenta automáticamente. La guía React mantiene
  las acciones fuera de efectos y la edición se bloquea sin un spinner perpetuo.
  `authorized` no activa recibir/gastar. Pasan 656 pruebas Web, 460 unitarias
  V3 y 552 runtime, tipos/lint/Knip y build Next; Chromium sintético valida la pantalla
  ES/EN móvil/desktop. Faltan entrega/observación, commit onchain, guardianes
  reales y drill de salida; E0–E4 continúan abiertos.
  El 51 añade outbox atómico a las autorizaciones prepare/commit y reconstrucción
  privada sin sesiones fabricadas, con leases/CAS y recuperación de envíos
  inciertos. Pasan 582 pruebas runtime (30 nuevas). Falta el sender patrocinado,
  consumidor y observador de activación; guardar un hash no activa la cuenta.
  No cambian contratos, frontend, secretos ni despliegues.
  El 52 incorpora reserva durable de nonce/envelope del sponsor, validación de
  firma/bytes exactos y persistencia atómica de raw transaction/hash antes de
  un único broadcast. Simula con dos RPC; no reenvía tras incertidumbre ni
  activa la cuenta por un acuse. Quedan firmante/presupuesto admitidos,
  consumidor y observador de activación, más resolución operativa de reservas.
  El 53 conecta inspección fresca, estimación/reserva, firmante sign-only y raw
  sender mediante un coordinador privado de prepare/commit. El checkpoint de
  commit no cambia; revocación y caducidad se revisan antes del envío. Corrige
  acumulación de timers RPC al completar llamadas. Quedan consumidor durable,
  observador/proyección de activación y configuración/pruebas reales; no habilita
  perfiles ni cierra E0–E4.
  El 54 incorpora observador/journal de activación. El 55 conecta consumidor
  durable y scheduler mediante la cola existente, sin otro Worker; conserva
  aislamiento de mensajes, leases y observación sin reenvío. Falta proyección
  de política efectiva e integración Consumer; la admisión real sigue cerrada.
  El 56 añade la comprobación de política instalada y su proyección histórica
  inmutable antes de cerrar el job de commit. El 57 conecta la confirmación final
  explícita en Next y el 58 añade GET de estado propios, lectura por gesto y
  presentación de observación reciente/historia. Una proyección histórica no
  se convierte en permiso de gasto. Faltan navegador/dispositivos, admisión real
  y el ciclo monetario E4; no volver a implementar esos transportes.
  No se cobra gas al usuario ni se habilitan redes/recursos remotos.
  El 35 monta preparación/autorización inicial HTTP y el cliente diferido ligado
  a sesión. El 36 conecta selección/revisión/confirmación en Next, plazos,
  cancelación y replay de la misma prueba sin volver a firmar; Chromium virtual
  verifica el recorrido y aislamiento con persistencia sintética. El 37 añade
  historial/restauración GET de consentimiento tras recargar: no guarda firmas
  en navegador ni reenvía automáticamente una autorización. Detecta operación
  de creación existente, sin afirmar que está confirmada. El 38 conecta
  UserOperation por HTTP y cliente de sesión: cap explícito, estimador sólo de
  servidor, preview recompuesto, segunda firma distinta y outbox atómico.
  GET y retry exacto no recotizan ni renuevan. El 39 conecta la pantalla de
  segunda confirmación y consulta explícita: firma sólo por gesto, límite decimal
  exacto, lectura tras incertidumbre, recarga sin duplicar y estados de entrega
  distintos de activación. Los detalles ya confirmados se pliegan. El 40 conecta
  cola/cron privados a entrega, observación y proyección bootstrap con jobs D1,
  leases, presupuestos y revisión de fallos persistentes. No depende del Home.
  Faltan revisión/redrive operativo, recursos
  aislados y observador/estimador admitidos, financiación/patrocinio; los catálogos
  reales de creación Web/Worker continúan cerrados.
  `pending`/`accepted`/`observed` no significan cuenta lista para recibir/gastar.
  No hay perfil de red admitido ni activación por bandera.
  El incremento 21 conecta la lista de wallets al token Firebase y al perfil
  propio de Wallet Core, sin polling ni autorización de llaves/fondos. Chromium
  sintético verifica paginación, reintento y cambio de usuario durante carga;
  no equivale a login ni pagos remotos.
  CSP por documento y 404 inerte verificadas en Chromium local; scripts sin
  nonce/nonce incorrecto bloqueados en el parser HTML. El HTML pasa a SSR/no-store
  (coste de hosting/latencia pendiente de medición); assets conservan caché propia.
  Falta auth remota
  (recursos aislados, controles Firebase y prueba integrada), PWA en dispositivos
  físicos, CSP de helpers Firebase/Turnstile reales, compatibilidad monetaria,
  legales/docs y Consumer monetario real.
  No equivale a Gate W.
- [ ] **E3 — Wallet Core:** Party/Wallet mínimos, Account V3 canónico,
  ejecución, passkeys, recovery, self-funded y salida independiente; Gate B.
  Entrada V3 aislada y cuotas/envío de magic links implementados localmente;
  verificador WebAuthn stateless implementado, sin despliegue ni autoridad monetaria.
  Codec DER/low-S implementado y contrastado byte a byte con Solidity;
  adaptador de ceremonia con activación explícita, UV, cancelación y timeout.
  Incremento 22: preparación/registro con posesión ligada al usuario y persistida
  atómicamente en D1; adaptadores create/get y errores diferenciados en Next.
  Sin autoridad onchain; falta autorización inicial con manifest admitido.
  Ese incremento añadió 29 pruebas workerd y 22 del navegador simulado.
  Incremento 23: `/settings/security` conecta registro/prueba al usuario Firebase,
  con cancelación al cambiar sesión, gestos separados y reintento de confirmación
  idempotente; no genera llaves al entrar. 37 pruebas Web adicionales y recorrido
  Chromium virtual contra el verificador real (identidad/persistencia sintéticas).
  Identidad/firma locales comparten `localhost`; smoke de firma Chromium virtual.
  Políticas y firmas ECDSA/WebAuthn/ERC-1271 comprobadas localmente; posesión de
  miembros nuevos y roles modificados ligada a la propuesta y dominio.
  Seguridad stateful candidata ya instala políticas y consume nonces, con
  recovery timelock y freeze irreversible; no mueve activos ni ejecuta upgrades.
  Creación autenticada candidata con factory/proxy reales: one-time init, posesión
  inicial y seguridad tras rotación/recovery probadas localmente. El harness integrado
  usa seguridad e instalación enlazadas fijas (17.060 B en la composición sólo de seguridad),
  sin módulos elegibles por el caller. Factory y cuenta comprueban su código;
  quedan 7.516 B hasta EIP-170 en ese harness, no prueba de que quepa el Account final. El frame de creación
  ya tiene integración local con EntryPoint v0.9 y una ventana de creación
  persistente hasta la primera validación. La traza no observa timestamp/acceso
  a código de EntryPoint en esos frames, incluida la biblioteca. La prueba de dos
  ECDSA pasa con 500.000 gas y también con 496.000; aún no demuestra el presupuesto
  WebAuthn/políticas mayores, admisión ERC-7562 ni cierre de E3. El incremento 16 añade
  CALLs atómicos 4337, versión revalidada al ejecutar y relay firmado directo con nonce
  independiente. La nueva composición mide 23.118 B y su biblioteca 22.251 B: cabe en
  EIP-170 pero no satisface aún el margen del Account final. Pasan transferencias,
  rollback, callbacks, cambios de autoridad en bundle y tres invariantes stateful.
  El incremento 17 añade ERC-1271 de cuenta, receptores ERC-721/1155 e
  introspección 165/5267. Esa composición medía 22.138 B y la biblioteca
  24.046 B; conserva primer envío contrafactual con 496k de verificación.
  El incremento 18 compone Account/UUPS con biblioteca fija de upgrades, quorum
  ADMIN, mínimo 72h, confirmación tipada, veto/freeze, rollback y migración de un
  uso. El perfil medido de 200 optimizer runs conserva 496k para primer envío y
  permite exigir <=20k por componente. Cambia bytecode/CREATE2: requiere manifests
  nuevos, no reutilizar los históricos. El incremento 19 añade validación de ambas
  bibliotecas en factory e inspección post-upgrade sin reinicializar ni imponer
  el target original; las pruebas EntryPoint usan ejecución/autorización completas.
  Hay 259 pruebas V3 de contratos tras el incremento 31; el agregado TS/schemas también pasa.
  El incremento 20 añade perfil de inspección con pin externo, validación CREATE2,
  lector EIP-1898 y adaptador Wallet Core acotado por petición. Reconocer una revisión
  no acredita readiness ni procedencia; no se publicó endpoint ni pin de producción.
  El incremento 21 añade las seis tablas Consumer y repositorio de ownership,
  verificación Firebase RS256, sesión local idempotente y endpoints privados de
  lectura. Resolver de inspección integrado a ownership, sin perfiles admitidos.
  El corte de sesión D1 no acredita sincronización de revocación Firebase Admin.
  Pendiente: provisioning autorizado de wallet/passkeys/Account desde ese modelo,
  generación/admisión independiente de artefactos/manifests e integración
  con el paquete portable, gas WebAuthn, layout compuesto,
  manifests, pantallas de seguridad/recovery/salida
  y conexión de las ceremonias al Account definitivo.
- [ ] **E4 — Consumer completo:** recibir/enviar/useMax/recibo/balance,
  seguridad y salida, aceptación humana, corte RP/domain/PWA y retiro de
  Astro/Vite activos. Primera entrega de producto V3.
- [ ] **E5 — Flow:** tenancy mínima, SettlementAccount, links reusables,
  intents/attempts, pago externo, journal/outbox/webhook; Gate C.
- [ ] **E6 — Business/Platform:** proyectos/customers, permisos/grants,
  wallets como recursos, API/SDK/docs/sandbox y dashboard; Gate P.
- [ ] **E7 — Extensiones:** capacidades/ledger según necesidad y Stellar
  posterior; cada una tiene gate propio, sin bloquear Consumer.
- [ ] **E8 — Mainnet:** auditoría y drills del alcance elegido, signers/roles
  segregados, evidencia remota y autorización explícita; Gate D.

Dependencias: E0 → E1 → E2/E3 → E4. E2 y E3 pueden avanzar en paralelo
con interfaces fijadas y capacidad disponible. Flow es técnicamente independiente
de Account V3; la prioridad de publicación E5 después de E4 responde al foco
del usuario. Mainnet Consumer no requiere terminar Business o Stellar.

Las listas P0–P3 siguientes conservan antecedentes y pendientes del runtime
anterior. Su secuencia no sustituye E0–E8; antes de una acción remota se verifica
qué sigue vigente en el ambiente destino.

## P0 — Requiere acción operativa antes del despliegue

- [x] **Cerrar la promoción técnica de la App de consumo.** La
  infraestructura de la tercera revisión ya eliminó el lock global de attempts,
  endureció Turnstile y retiró Promises RPC globales; permanece desplegada con
  `PAYMENT_LIVE_ENABLED=false`. El 30-08 el alcance cambió: primero se cierra la
  App y API/Business/Dashboard continúan después. El candidato local reemplaza
  OTP por magic links nativos de Firebase, no usa Resend ni otro proveedor de
  correo y añade `0035_firebase_email_links.sql` para recovery de un solo uso.
  La matriz integral `pnpm verify:all` pasó sobre el árbol final. El commit
  `b976acb` tiene 6/6 checks verdes; backup/restore, `0035`, App Worker y App Web
  quedaron promovidos. Un enlace real abrió sesión y Firebase confirma una sola
  identidad verificada con Google y Email Link. El candidato inicializa Firebase
  Auth con persistencia local y resolver de redirect en una sola operación; el
  gate de frontend impide reintroducir la carrera `getAuth`/`setPersistence` que
  podía cerrar IndexedDB durante la recuperación de sesión. La UX de llaves y
  Passkey Security v2 fueron versionados, `0036` fue aplicada y App Worker/App
  Web quedaron promovidos desde `246d967`; el preflight remoto tiene 12/12
  checks listos. Sus ceremonias reales requieren autorización específica y gesto
  del usuario. Recovery/replay queda como drill de Fase 4,
  deteniéndose antes de proponer onchain. El smoke adversarial remoto de Payments conserva
  su evidencia histórica y no necesita repetirse para este cambio de App. El
  preflight `preflight:phase3-app:remote` ya delimita el estado sin mutar nada.
  El [runbook histórico de magic links](./runbooks/phase-3-app-magic-link-cutover.md)
  conserva el corte de `0035`; el
  [runbook Passkey v2](./runbooks/phase-3-app-passkey-v2-cutover.md) impide tocar
  Dashboard, Payments, DNS o secrets durante la promoción vigente.
- [x] **Cerrar la auditoría posterior a Fase 2.1.** El candidato exige
  prueba de wallet y capability por attempt; valida receipt/emisor/router/evento
  antes de persistir un hash; aplica CAS y expiración de `submitted`; no filtra
  autorizaciones activas; usa checksum semántico; reinicia checkout A→B; separa
  liveness/readiness con último health válido; y exige dos hosts RPC por chain.
  La segunda revisión endureció A→B mediante remount por identidad completa,
  corrigió los seis RPC del helper y eliminó el bypass documental del guard.
  El 26-08-2026 se versionó y promovió: `0006` está aplicada, los Workers y
  frontends fueron desplegados y los smokes remoto/adversarial pasan.
- [x] **Rehacer el corte con evidencia semántica.** El checksum del target
  histórico sólo cubría IDs y sus webhooks importados usan un key ID incompatible.
  No se actualiza el control in-place: congelar/drainar App, conservar ambos
  targets, crear otra D1 vacía, importar el manifest v4/checksum v2, exportar y
  verificar semánticamente el target antes de activar. Seguir el
  [runbook dedicado](./runbooks/payments-semantic-recut.md). El target activo es
  `gatopago-payments-semantic-20260826`; la D1 histórica permanece intacta.
- [x] **Hacer públicos los frontends que son públicos.** Se desactivó Vercel SSO
  del dashboard y el preflight prueba una petición anónima sin aceptar redirects
  fuera del dominio. App y Dashboard muestran sus superficies GatoPago.
- [x] **Versionar la fuente desplegable.** Los guards de Workers y Vercel
  rechazan archivos relevantes dirty/untracked, HEAD sin upstream o HEAD distinto
  del commit publicado. El runtime promovido de Fase 3 corresponde al commit
  publicado `762c933`.

- [x] **Cerrar el componente local de Fase 3 antes de cualquier promoción.** El alcance y
  los criterios de aceptación canónicos están en [Fase 3 del plan de checkout
  universal](./design/universal-checkout-multichain.md#fase-3-hardening): contrato
  Queue/Wrangler, recovery y nonces CCTP, contabilidad del monto acuñado,
  leases/firmas/rotación de webhooks, idempotencia concurrente, bootstrap/cutover
  fail-closed, checkout público y documentación operativa coherente. El gate
  integral local, el split/restore D1 y los E2E pasan; esto cierra sólo el código
  y el ensayo local, no la promoción remota ni readiness de mainnet.
- [ ] **Secretos locales (externo).** Seguir el
  [inventario canónico](./operations/worker-variables.md): sacar credenciales
  operativas de OneDrive, eliminar los OIDC locales después de su expiración,
  revocar/rotar la API key de Etherscan expuesta el 25-08-2026, confirmar la
  revocación del service account Firebase histórico y conservar únicamente
  archivos `.example` sin valores. Ninguna rotación remota forma parte del
  cambio documental local.
- [x] **`user_event_outbox_dead` (producción).** El 25-08-2026 la única fila
  `activity.payment_received` con 12 intentos y causa
  `TERMINAL_PUSH_NOT_CONFIGURED` se reencoló condicionalmente. El Worker la
  entregó de forma válida a cero dispositivos; quedan 0 dead, 0 activos y
  `/health=ok`.
- [x] **Promover la autenticación passwordless de la App.** Las
  migraciones `0030_email_otp.sql`, `0031_webauthn_registration.sql` y
  `0032_recovery_step_up.sql` están aplicadas en producción. El candidato añade
  `0035_firebase_email_links.sql`, ya aplicada después del backup cifrado.
  Firebase tiene Google, Email Link y `app.parmelia.me` autorizados; App Worker y
  App Web están desplegados, el preflight remoto está verde y la recepción/
  consumo real abrió una sesión válida.
- [x] **Promover la frontera App/Payments (Cloudflare).** El primer corte del
  25-08-2026 se conservó como evidencia histórica. El 26-08-2026 se repitió sobre
  una D1 vacía con manifest v4/checksum semántico v2
  `5d3093e9b12288d7783832037b3bf06635591da1cf56df377ff4b4b6f3093a27`,
  migraciones `0001`–`0006`, export target verificado y D1 histórica intacta;
  el 28-08 se añadió `0007` sobre ese mismo target después de un backup cifrado
  y restore drill, sin rebaselinar el checksum histórico.
  App terminó en modo `payments`, sync drenado y ambos health/smokes verdes.
  Históricamente, el 25-08-2026 se
  crearon D1/Queue/DLQ Payments, se aplicaron migraciones, se cifró y restauró el
  backup App, se congeló y drenó el escritor anterior, se importó data-only una
  vez y se fijó el checksum
  `ffb10c840313390517ec88afe2590385f73bd4b7e500670340a9c979aac30bb9`.
  Payments se activó antes de cambiar App a `payments`; los outbox de sync están
  drenados, ambos health están verdes y los smokes directo/proxy pasan. App y
  Payments son ahora D1/Queues físicamente independientes con un solo escritor.
- [x] **Promoción física y acceso público de frontends (Vercel).** `parmelia` quedó `Ready` en
  `app.parmelia.me`; se creó y vinculó `gatopago-dashboard`, quedó `Ready` en
  `dashboard.parmelia.me`, y variables/aliases pasan el preflight remoto. Los
  dos dominios se comprobaron durante el corte. La auditoría posterior demostró
  que ese preflight no verificaba acceso anónimo; el 26-08-2026 se desactivó
  Vercel SSO, se redesplegaron ambos frontends y el preflight ya valida acceso
  anónimo real. El checkout sólo admite el provider EIP-1193 ya inyectado por una extensión
  o por el navegador integrado de la wallet, decisión deliberada que no se
  resolverá incorporando un proveedor externo. El smoke limpio confirma su
  fallback sin spinner y no existe Reown/WalletConnect en el código activo.
- [ ] **Decidir preparación contractual para fees CCTP.** El lanzamiento gratuito funciona con los routers Base/Fuji actuales (cap inmutable `0`). Solo si negocio quiere conservar la opción de una fee positiva, redeployar ambos con cap `100`, verificar, smokear y actualizar manifests/registry antes de cualquier policy. No activar una regla global como primer canary.

## P1 — Implementado localmente

- [x] **Magic links de Firebase implementados para la App.** Turnstile y cuotas protegen la solicitud; Firebase envía/consume el enlace, el correo no aparece en la URL y otro dispositivo debe confirmarlo. El login nunca inicia recovery ni crea una passkey. Recovery usa challenge opaco, UID + `auth_time` reciente y proof acotado de un solo uso sólo después de elegirlo explícitamente en `Configuración → Seguridad`. Las rutas OTP quedan sólo como compatibilidad temporal Business.
- [x] **UX de acceso a llaves centralizada y promovida.** Home sin llave registrada y los flujos pagar/enviar/swap/cross-chain/Earn sin llave utilizable muestran un único camino hacia `Configuración → Seguridad`. Consumir un link de recovery sólo confirma identidad y espera un CTA; no abre WebAuthn ni muta la cuenta automáticamente. El bundle productivo y la matriz de navegador verifican este contrato; la aceptación WebAuthn real requiere gesto del usuario.
- [x] **CI reproducible en Node 24/Linux.** Node 24, pnpm congelado, Foundry, verificación integral, E2E y scanners están versionados; las Actions usan commits inmutables y se ejecutan sobre cada HEAD publicado.
- [x] **Cabeceras y health separado.** CSP y cabeceras defensivas están declaradas; `/health/live` es mínimo, `/health` expone sólo estado agregado y `/health/ops` requiere el token operativo. Los health remotos pasan y Payments sostuvo 30/30 lecturas consecutivas tras el ajuste RPC/Multicall3.
- [x] **Caché y service worker.** Chunks con hash son inmutables; HTML/manifest/SW se revalidan; las escrituras de Cache Storage se esperan y las rutas de Firebase Auth no se interceptan. El gate automatizado cubre instalación, fetch, invalidación y notificaciones.
- [x] **PWA y formulario de perfil.** La PWA usa únicamente la cara original de Meli en PNG, expone instalación desde navegador y conserva instrucciones para iOS. El perfil memoiza el modelo inicial para que nombre y red social no se reinicien durante la escritura; el selector de red usa estado controlado estable.
- [x] **Passkeys y recovery endurecidos.** Registro y verificación son server-bound con `@simplewebauthn/server`; las credenciales se pueden listar, renombrar y revocar. Recovery exige step-up, no consume el desafío en el preflight y lo consume atómicamente al proponer la recuperación.
- [x] **Passkey Security v2 promovido.** El Worker fija RP ID y
  allowlist WebAuthn separados de CORS, cada UserOperation devuelve el RP ID,
  `0036` persiste AAGUID/BE/BS/tipo/proveedor sólo como metadata, la UI distingue
  incertidumbre y ofrece llave física bajo divulgación progresiva. Signal API
  recibe el inventario únicamente cuando D1 y signers onchain coinciden uno a
  uno; el retorno a una operación valida mismo origen. Está activo en App Worker
  `a2ea1d70-0553-48fd-8501-201bfe7e5143` y App Web
  `parmelia-4ezj8lobg-danelerrs-projects.vercel.app`.
- [x] **Gates de promoción Passkey v2 promovidos.** El deploy del
  Worker rechaza cambios accidentales de RP/orígenes y cualquier migración App
  local pendiente; además verifica 13 columnas, 6 restricciones y el índice
  parcial de `0036`. El preflight remoto comprueba `0035`, `0036`, ese esquema
  semántico y los bindings WebAuthn exactos en todas las versiones con tráfico.
- [x] **Economía extensible sin cambiar la política gratuita.** Payments usa `free-default` cuando no hay policy, reglas versionadas/acotadas con máximo 100 bps, snapshots inmutables, ledger separado de plataforma/red, desglose API/webhook/dashboard y preflight on-chain obligatorio antes de una comisión positiva.
- [x] **Paymaster reemplazable sin migrar cuentas.** App abstrae Parmelia, ERC-7677 y self-funded; todo fallback reconstruye/reestima antes de la firma, mainnet fija el contrato externo esperado y D1/health conservan provider + dirección exacta para drenar rotaciones.
- [x] **Frontera Payments escalable promovida.** RPC App→Payments usa una única interfaz versionada compartida; health de App no consulta tablas de Payments; reintentos diferidos se compactan por partición en Durable Object con fallback Queue; el cutover descubre todas las migraciones, exige índices críticos y once planes de consulta hot-path se validan automáticamente. La máquina de estados terminó en `cutover`, el checksum runtime coincide con el control D1 y la separación física por dominio está desplegada. No equivale a sharding horizontal ni sustituye pruebas de carga.
- [x] **Hardening 3A promovido.** Queue/Wrangler, bootstrap/sync, preflight,
  recuperación y nonces CCTP, monto realmente acuñado, webhooks at-least-once,
  rotación de claves e idempotencia concurrente tienen migraciones y pruebas de
  runtime. Los preflights Cloudflare y los smokes directo/proxy pasan sobre los
  Workers promovidos.
- [x] **Checkout público 3B endurecido y promovido.** El link consulta Payments
  directamente, acepta una wallet externa EIP-1193 sin login, mantiene saldo
  GatoPago como método opcional, simula, intenta EIP-2612 y cae a
  `approve + pay`, registra el source hash inmediatamente y reanuda el attempt
  tras refresh. El attempt requiere firma del payer y una capability aleatoria
  guardada sólo en `sessionStorage`; un hash reportado no se acepta hasta que el
  backend verifica receipt, sender, router y evento. No se carga un SDK o relay
  externo de conexión. El E2E local cubre teclado, wallet injected, fallback de permit,
  registro, caída HTTP, recarga, re-registro del mismo hash y reconciliación a
  `paid`. El smoke remoto A→B retuvo B y demostró 0 acciones disponibles mientras
  cargaba; el fallback sin provider también se verificó en Chromium limpio. La
  tercera revisión detectó que la firma aún tomaba un lock global; `0007` lo
  elimina y el delta ya está desplegado en Payments versión
  `9f65035e-4ba4-4b4e-bdac-54a21cff8f24`.
- [x] **Gates 3C revalidados y promovidos después de la tercera auditoría.**
  `pnpm verify` y `pnpm test:e2e` pasan en el delta local actual con 260+26
  pruebas App, 52+23 Payments y 52 E2E aprobadas/32 omisiones deliberadas de
  matriz, además de 11 diagramas, OpenAPI y límites de bundle. El candidato
  promovido anterior también pasó `verify:all`, audit sin vulnerabilidades
  conocidas, split/restore semántico, storage, coverage y 191 pruebas Foundry
  finales aprobadas/4 forks omitidos sin RPC. Esto conserva evidencia local
  reproducible; el gate remoto añade 197/197 Foundry con forks, preflights
  Vercel/Cloudflare y smokes de checkout.
  La prueba adversarial A→B pasa en escritorio y móvil. El ensayo compuesto
  cubre bootstrap/sync, freeze y
  compatibilidad N/N-1, import data-only sobre base vacía, checksum, rechazo de
  replay y restores independientes. La evidencia remota histórica ejecutó 197
  pruebas sin omisiones, incluidas 6 forks vivas. La D1 de reemplazo, la
  migración `0006`, los Workers y ambos frontends de aquel corte fueron
  promovidos. El 28-08 se repitió esa matriz sobre `762c933`, se aplicó `0007`,
  se desplegaron Payments/App y ambos frontends, y los preflights remotos pasaron.
  El smoke remoto controlado confirmó dos pagadores concurrentes, cancelación
  merchant sin monopolio y limpieza sin errores FK. Turnstile dejó de esperar
  indefinidamente en el Dashboard real. El nuevo flujo App de magic links pasa
  pruebas unitarias, runtime y navegador dirigidas y su guard confirma que no
  existe dependencia Resend. La matriz integral final pasó. El 30-08 se publicó
  `b976acb`, se respaldó App D1, se aplicó sólo `0035`, se desplegaron sólo App
  Worker/App Web y el preflight remoto quedó completamente verde. La CSP Google
  está corregida y el enlace real fue recibido/consumido bajo el mismo UID
  vinculado a Google. La observación real produjo el delta UX de llaves descrito
  arriba quedó publicado. `0036`, Worker/Web y el preflight de 12 checks están
  verdes; la consulta redactada confirma 0 dead letters y 0 trabajos activos.
  Recovery/replay real
  será un drill deliberado de Fase 4, junto con pagos testnet reales, evidencia
  monetaria completa y fault injection.

## P2 — Mantenibilidad y cobertura

- [x] **Reducir hotspots por dominio.** `storage.ts` bajó de 3.159 a menos de 1.000 líneas y delega ledger, merchants/webhooks, passkeys, cross-chain, leases, cursores, operaciones de cuenta y features de usuario. `indexer.ts` bajó de 1.664 a menos de 750 líneas al separar los tres watchers. `ScanQR.tsx` y `PayPage.tsx` quedaron por debajo de 700 líneas mediante extracción de lógica y vistas.
- [x] **Unificar lógica sensible.** Esquemas EIP-712 y autorizaciones de pago viven en `shared`; los fixtures de TypeScript/Solidity comprueban la misma codificación. Los watchers comparten ventanas, finality, journal, reorg guards y cursores; el outbox permanece en la misma transacción que el cambio de estado correspondiente.
- [x] **Eliminar código muerto y deuda de efectos React.** Knip y el gate de ciclos pasan; `react-hooks/set-state-in-effect` es error, no warning. Se retiraron dependencias, assets PWA y exports sin consumidores solo después de comprobar su uso.
- [ ] **Aceptación autenticada y Fase 4 (producción).** El magic link real ya fue recibido/consumido y comparte UID con Google; `0036` y la UX centralizada están promovidas. Falta que el usuario complete una ceremonia WebAuthn real bajo autorización específica. Recovery/replay deliberado, perfil, red, envío, swap, cross-chain y webhooks reales pertenecen a Fase 4 cuando requieran cuentas, APIs, chains u operaciones monetarias.
	- [x] **Remediación técnica Passkey v2.1 promovida:** se eliminó la falsa ausencia basada en `localStorage`, se agregó comprobación WebAuthn firmada y anti-replay (`0037`), compatibilidad segura para retiro durante el rollout, limpieza de llaves reemplazadas por recovery y reparación del hint tras retiro. El 30-08-2026 se respaldó App D1, se aplicó únicamente `0037` y se publicaron App Worker `ee69b705-0e82-413a-8444-c54ceddd5e65` y App Web `dpl_5PNXgaf3zYqnNyxUdkuxvF7gKpzs` desde `76b50a2`; el preflight remoto quedó listo y sin pendientes. La aceptación comprobar/agregar/quitar/recuperar en iPhone continúa abierta porque requiere el gesto del usuario.
	- [x] **Fase 4A documentada y luego rechazada:** el candidato local
	  `home/satellite` demostró capacidades multichain, pero no se promoverá. No se
	  arrastran cuentas ni contratos de generaciones diferentes. Registro
	  histórico en [Fase 4A App](./design/app-multichain-phase-4a.md).
	- [ ] **Arquitectura objetivo Account V3:** una identidad y dirección
	  determinística únicas en todas las EVM habilitadas, stack canónico,
	  Security Manifests, assets CAIP-19, paymaster/fees desacoplados y salida
	  independiente. EVM es el core, Base la candidata a `defaultNetworkId` y
	  ninguna chain es raíz de ownership. Implementar por etapas sólo después de
	  superar los gates de
	  [`V3-FUSION.md`](./architecture/V3-FUSION.md).
	- [ ] **Pre-audit y decisiones base V3:** cerrar Gate A antes del contrato
	  definitivo: spend/admin/recovery, digest de consentimiento, UUPS con
	  threshold+timelock+freeze, deploy determinístico, análisis Solidity sin
	  rutas omitidas y threat model independiente. Ver
	  [Partes II–III de V3 FUSION](./architecture/V3-FUSION.md).
	- [ ] **Vertical Stellar/SCF sin contaminar EVM:** contract account `C...`
	  con passkey + recovery Ed25519/guardians, SAC XLM/USDC, fee sponsorship,
	  TTL/restore, API namespaced y PaymentIntent Stellar. Alcance, coste e
	  impacto B2B/B2B2C en
	  [`STELLAR-SOBERANIA-API-V3.md`](./architecture/STELLAR-SOBERANIA-API-V3.md).
	  Es una extensión futura, posterior a V3; no será la cuenta principal ni
	  condiciona el EVM core.
	- [ ] **Baseline y radar ERC/EIP V3:** implementar 14 perfiles base —UUPS ya
	  decidido y EIP-7951 como capability por chain— y 10 compatibilidades
	  definidas en
	  [`RADAR-EIP-ERC-V3.md`](./architecture/RADAR-EIP-ERC-V3.md). ERC-7579,
	  7484, 7739, 7730, 7710, 7715, 7930 y 7683 permanecen opt-in/Testnet hasta
	  cerrar ADR, conformance, fuzz/invariants y revisión de seguridad. El primer
	  release se limita a 20 perfiles: 14 base y 6 adapters esenciales.
- [ ] **Corte de RP ID V3:** `gatopago.com` para Consumer y
  `staging.gatopago.com` para staging con origins exactos. El reset testnet crea
  cuentas y passkeys nuevas. Sólo preservar cuentas antiguas exige coexistencia
  y migración de signers probada. DNS no migra credenciales ni instalaciones PWA.
  Configuración, login Firebase, redirects y rollback se validan en Gate W.

## P3 — Rendimiento, dependencias y mainnet

- [ ] **Core Web Vitals de producción.** `sileo` se eliminó, Analytics/Firebase Analytics se cargan de forma diferida y existen presupuestos gzip por chunk y por aplicación. Falta medir LCP, INP y CLS antes/después en producción con tráfico o sesiones representativas.
- [x] **Dependencias compatibles actualizadas.** El lockfile usa las versiones actuales compatibles con Node 24. Permanecen intencionalmente `@types/node` 24 (runtime Node 24) y TypeScript 6 (TypeScript 7 excede actualmente el peer soportado por `typescript-eslint`); se revisarán como migraciones separadas.
- [ ] **Gate de mainnet.** Siguen siendo obligatorios: cero `TODO_DEPLOY`, claves/roles segregados, KMS/MPC o arquitectura equivalente, direcciones verificadas, fork tests con RPC reales, simulacro de rollback y revisión externa independiente. No hay autorización para desplegar contratos ni promover configuración mainnet.

## Evidencia mínima para cerrar producción

1. Commit y push revisados; CI y security workflows verdes en GitHub.
2. Backup D1 cifrado y restore drill verificado antes de aplicar migraciones.
3. Migraciones App `0030`–`0038` y todas las migraciones Payments descubiertas
   en `payments-worker/migrations/` (actualmente `0001`–`0007`) aplicadas en su
   orden, con health operativo sin dead letters ni operaciones activas en
   contratos retirados.
4. Manifest v4/checksum semántico v2 sobre una D1 Payments nueva, seguido de
   export y `--verify-target-sql`; el checksum histórico no se modifica.
5. Deploy desde un commit publicado y limpio, target Payments antes de clientes,
   seguido de smoke autenticado y smoke anónimo sin redirect externo.
6. Validación de magic link recibido/consumido y mismo Firebase UID con Google;
   además, publicar y comprobar que el login no dispara recovery y que la falta
   de llave conduce a `Configuración → Seguridad`. Recovery deliberado, perfil,
   red, passkeys, pagos y webhooks reales continúan como evidencia de Fase 4
   cuando impliquen operaciones sensibles/monetarias/on-chain.
7. Evidencia de CSP/caché/PWA y Core Web Vitals desde los dominios reales.

## Regla de actualización

Cada tarea cerrada debe registrar fecha, evidencia y entorno. Si un audit descubre trabajo adicional, se añade aquí; no se crea otro backlog paralelo ni se confunde una prueba local con validación de producción.
