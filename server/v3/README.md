# Wallet Core V3 — candidato local

Entrada: [src/v3/index.ts](../src/v3/index.ts). Es el reemplazo del runtime App
al completar E4, **no** un tercer servicio de dominio y **no** un despliegue.
El `server/src/index.ts` anterior no se modifica ni se importa como fallback.

El entrypoint implementa liveness, compatibilidad, solicitud de magic link,
sesión Consumer, listas de wallets/instancias propias, enrolamiento WebAuthn,
inventario autenticado y rutas de consentimiento inicial cerradas por admisión.
Los módulos privados también preparan/verifican la primera UserOperation,
despacho, observación y proyección bootstrap. El incremento 40 los conecta al
handler privado de cola y cron del candidato; NO hay endpoint público de jobs
ni consumidor remoto provisionado. No hay cuenta
financiera custodial, recuperación completa ni autorización de pagos aquí.
`ready: false` es intencional. Ambos manifests públicos siguen `unprovisioned`;
el entrypoint real responde 503 a la solicitud de correo y no llama proveedores.

### Consentimiento de activación — incrementos 42–46

La activación posterior tiene un compilador compartido desde el incremento 42:
[`bootstrapActivation.ts`](../../shared/v3/bootstrapActivation.ts). Recompone y
verifica prepare/enrollment/commit con P-256/ECDSA, sin renovar ventanas ni
confundir proofs de fases distintas. Está probado contra Account V3 compilada
en Anvil. El incremento 43 añade [`ActivationRepository`](../src/v3/wallets/activation.ts)
y migración local 0009: preparación/autorización propias, inmutables y retomables,
inspección finalizada vigente y revalidación SQL de ownership. El resolver por
defecto rechaza redes; no recibe estado de autoridad ni RPC desde el visitante.
Recompila/reverifica firmas al restaurar y no bloquea globalmente la cuenta al
preparar. Las lecturas no renuevan ni ejecutan. El 44 añade migración local 0010
y confirmación separada durable: conserva el checkpoint revisado, verifica una
nueva firma y exige tanto propuesta vigente como canonicidad del bloque original.
El avance del head no cambia silenciosamente el mensaje firmado. La configuración
RPC se copia antes de I/O; un cambio del objeto original no sustituye proveedores
entre inspección y comprobación del acknowledgement.
El incremento 45 separa la aceptación breve (hasta 300 segundos) del vencimiento
absoluto firmado de la propuesta. Una confirmación nueva puede prepararse después
de esa primera ventana si la propuesta sigue vigente; no se renueva ninguna firma
ni se rebaja finalidad. La evidencia local del 45 incluye confirmación demorada
en Anvil; no demuestra finalidad de una red admitida.

El incremento 46 añade [`activationRoute.ts`](../src/v3/wallets/activationRoute.ts)
y cuerpos estrictos en [`activationWire.ts`](../src/v3/wallets/activationWire.ts).
Todos requieren origen Consumer exacto, Firebase JWT verificado, sesión existente
y propiedad del recurso. Los POST además requieren release, manifest y red
admitidos; la composición publicada por defecto sigue sin perfiles.

| Método y ruta bajo `/app/v1/account-activations` | Efecto |
|---|---|
| `POST /` | Preparar propuesta con `request_id`, `initialization_id`, `wallet_id`, `wallet_account_id`, `next_policy`, `proposal_valid_until` |
| `GET /{activationId}` | Restaurar términos públicos propios, sin RPC ni cambios |
| `POST /{activationId}/authorize` | Verificar y registrar `owner` y `enrollments` del mismo digest |
| `POST /{activationId}/commits` | Preparar segunda confirmación con un nuevo `request_id`, tras observar la propuesta onchain |
| `GET /{activationId}/commits/{commitId}` | Restaurar confirmación propia; padre y recurso deben coincidir |
| `POST /{activationId}/commits/{commitId}/authorize` | Verificar y registrar otra aserción WebAuthn para el commit |

La ruta raíz es exacta, sin slash final. No existe GET de colección ni endpoint
de ejecución genérica. `next_policy` usa el modelo público SecurityPolicy; las
aserciones usan `authenticator_data`, `client_data`, `signature` base64url canónico.
Cada enrolamiento declara `signer_index`, `kind` y `signature` ECDSA o `assertion`
WebAuthn. Campos extra, RPC, nonces, checkpoints y calldata del visitante se
rechazan. Los cuerpos tienen límites de bytes y tiempo. Las firmas aceptadas no
se devuelven: el cliente debe reconstruir la revisión usando su perfil fijado
independientemente; el documento público incluido en `input` no admite una red.

GET y reintentos exactos no renuevan, no llaman RPC ni despiertan jobs. Un POST
aceptado registra consentimiento, **no** confirma ejecución/activación:
`activation_assessment=not_assessed`, `receive_enabled=false`, `spend_enabled=false`.
Una propuesta cambiada exige nueva revisión; no se incrementan nonces ni cambian
IDs automáticamente tras un 409/410. 400 identifica entrada/prueba inválida;
503 no expone detalles del proveedor ni se trata como firma inválida.

El cliente Next del incremento 47 consume las seis rutas mediante carga diferida
y sesión capturada. `shared/v3/activationWire.ts` reconstruye los términos desde
el perfil aprobado y la selección local, no desde una configuración elegida por
la respuesta. Las firmas se verifican antes de transmitirlas; no hay ceremonia,
polling, almacenamiento de llaves ni ejecución automática dentro del cliente.
La conformidad de los DTO se comprueba contra respuestas del repositorio D1 local.

El incremento 48 añade `GET /app/v1/security/credentials/{credentialRef}`:
JWT Consumer, origen exacto, referencia canónica y ownership revalidado tras D1.
Retorna sólo `scope`, `credential_ref`, `credential_id`, `public_key`,
`device_availability=unknown` y `onchain_authority=not_assessed`, con `no-store`.
No prepara desafíos, no firma, no escribe y no expone pruebas ni identity subjects.
Ausente, ajena o aún no registrada devuelven el mismo 404; los datos corruptos
producen 503. La colección original sigue siendo metadata, sin material público.
El cliente carga este detalle bajo demanda y descarta respuestas de otra sesión.

Next conecta un borrador de quorum a la creación proyectada. Es una revisión
local: no llama las rutas de activación ni considera varias passkeys del mismo
dominio una salida independiente. Quedan pendientes los factores independientes,
sus pruebas por gesto y la composición final de activación.

**Faltan confirmaciones de factores, entrega y observación de activación.** La vía de
enrolamiento ERC-1271 sigue pendiente. Estas rutas no habilitan dinero ni prueban
soberanía: hacen falta la observación posterior y los recorridos humanos de E4.

### Proyección de creación — incremento 33

`processCreationProjection` une evidencia de `CreationObservationJournal` con
lectura actual en un bloque finalizado reciente. Sólo proyecta el manifest
bootstrap inicial exacto, creación completada, sin propuesta ni nonces consumidos.
Revalida el grant firmado y fija el head del journal dentro de una transacción
D1 con las cuatro entidades y un registro histórico de evidencia. No modifica
el contrato, firma, recovery ni permisos. La migración local `0007` añade ese
registro y su vínculo al receipt; no se aplicó a una base remota.

La misma identidad en otra red reutiliza Wallet/AccountIdentity. Una reentrega
no duplica recursos; un error SQL revierte todo. El scheduler de observaciones
de creación deja de seleccionar las cuentas ya proyectadas. Eso no sustituye
un indexer de actividad/reorgs ni la inspección vigente antes de recibir/gastar.
`deployment_state=active` significa despliegue observado: el listado sigue con
`spend_readiness=not_assessed`, `receive_enabled=false` y sin dirección pública.
Activar la política requiere consentimiento y prueba de factor independiente.

### Inventario de credenciales — incremento 34

`GET /app/v1/security/credentials` devuelve hasta 16 registros propios sin
mutaciones, bootstrap automático, cleanup ni consulta onchain. Autentica el
token Firebase y revalida revocación/vencimiento después de D1. RP/origin son
los del ambiente, no parámetros del visitante. Una inconsistencia o exceso
falla explícitamente, nunca se presenta como una lista vacía.

Expone `credential_ref`, fecha y metadatos de registro; no raw credential ID,
public key o proof. La disponibilidad en el dispositivo es `unknown`; la
autoridad onchain es `not_assessed`. La UI no puede convertir la presencia de
una fila o un flag de respaldo en un permiso de gasto o un factor independiente.
No depende de conservar la operación temporal de enrolamiento. La ausencia de
perfil V3 devuelve `409 SESSION_REQUIRED` sin crearlo durante la lectura.

### Consentimiento inicial — incremento 35

`POST /app/v1/account-initializations` y `POST /app/v1/account-initializations/:id/authorize`
montan el consentimiento tipado, no la ejecución ni activación de la cuenta.
Sólo usan credenciales del usuario autenticado y perfiles del servidor que
coincidan con ambiente, red habilitada y compatibilidad de contrato. Preparar
devuelve metadata privada de firma; autorizar exige la prueba P-256 del digest
exacto. El cliente reconstruye y verifica, no confía en un digest opaco.

`createInitializationRoute` separa las dependencias privadas del cuerpo HTTP.
Configurar perfiles **no constituye admisión**: requiere la política de release
aprobada y un observador fresco de composición/finalidad. El entrypoint tiene
catálogo vacío y observador no configurado; no basta cambiar una cabecera, una
bandera o un hash. Los tests usan perfiles sintéticos y un observador stub;
comprueban JWT, propiedad, D1, P-256 y protocolo HTTP, no una red real.

El consentimiento guardado mantiene `account_deployed=false`,
`receive_enabled=false` y `spend_enabled=false`. No se retornan firmas guardadas,
direcciones para depositar ni documentos de despliegue suministrados por el caller.
El incremento 36 conecta selección/confirmación en Next con la sesión capturada,
reconstrucción del consentimiento y replay explícito de la prueba en memoria.
La Web no recibe su perfil de una respuesta HTTP: ambos perfiles de release
siguen nulos. El harness Chromium usa identidad/persistencia sintéticas y el
verificador P-256 real; no sustituye la prueba D1/JWT separada ni demuestra una
red admitida. Faltan observador real, consentimiento/entrega UserOperation,
activación y recorridos de salida/recuperación.

### Restauración de consentimiento — incremento 37

`GET /app/v1/account-initializations?after=...` lista diez metadatos propios por
página, con cursor validado y sin proofs, raw credential IDs ni consultas RPC.
`GET /app/v1/account-initializations/:id` restaura los inputs públicos del
consentimiento seleccionado y vuelve a verificar la prueba guardada en servidor,
sin devolverla. Revalida sesión/propiedad después de D1; ambas respuestas son
no-store. La compatibilidad de lectura usa identidad, no admisión para crear.

Next consulta el historial antes de ofrecer una nueva configuración. Recargar
tras una respuesta perdida permite descubrir el consentimiento registrado sin
otra firma ni otro POST. Un consentimiento pendiente conserva ID/salt/digest y
plazo; retomar requiere confirmación explícita. La existencia de una operación
de creación se muestra aparte: no prueba broadcast, finalización ni activación.
El consentimiento UserOperation y la consulta UI/HTTP se conectan en los
incrementos 38–39; falta renovación explícita de consentimientos vencidos
sin cambiar de identidad de cuenta y seguimiento de confirmación/activación.
No hay storage de firmas en el navegador, polling automático ni perfil real admitido.

### Primera UserOperation por HTTP — incremento 38

`/app/v1/account-initializations/:id/creation-operation` acepta GET para revisar
la operación existente y POST con **sólo** `maximum_gas_charge` (entero decimal
canónico en unidades atómicas nativas). El servidor selecciona perfil y
proveedor de estimación; el caller no controla gas, calldata, red, RPC ni
paymaster. Una estimación que supera el límite devuelve 422
`CREATION_CAP_TOO_LOW`, sin subirlo ni guardar una operación.

La primera preparación exige consentimiento inicial propio y firmado,
admisión de release/red y observación fresca. Guarda un candidato inmutable;
repetir el mismo POST lo consulta sin recotizar. Otro límite produce conflicto.
El GET conserva acceso histórico aunque se deshabiliten nuevas cuentas, pero
no reconstruye registros perdidos ni renueva autorizaciones vencidas.

La vista propia devuelve gas y la assertion inicial necesaria para reconstruir
los bytes de factory. No devuelve la firma de la UserOperation, su lease ni
datos de Firebase. No cambia el contrato de los GET de consentimiento del 37,
que siguen sin devolver pruebas. El cliente verifica firma inicial y recompone
UserOperation/digest con el pin/scope/salt/llave del consentimiento anterior.
`POST .../creation-operation/authorize` verifica la **segunda** firma distinta
y conserva el batch atómico autorización/outbox del 26. Repetir exactamente
esa prueba devuelve su registro sin otra entrega ni RPC, incluso vencida.
Las respuestas son no-store; `pending` y `accepted` no prueban despliegue.

`BrowserAuth.creationOperation` carga este cliente bajo demanda y comprueba
la misma sesión antes/después de cada operación. No abre WebAuthn, no guarda
firmas, no hace polling ni reintenta automáticamente. La pantalla de segunda
confirmación y consulta explícita se añade en el incremento 39 de Web: tras
resultado incierto consulta el mismo recurso, y sólo permite reenviar la misma
prueba si esa lectura aún lo devuelve preparado y vigente. Recargar no firma.
Estimación/proveedores admitidos y financiación/patrocinio todavía faltan.
El consumidor local se conecta en el 40 y el seguimiento en la UI en el 41. El catálogo real y sus
callbacks siguen cerrados. No hay despliegue remoto ni red habilitada.

### Consulta propia del seguimiento — incremento 41

El preview `GET .../creation-operation` incluye `lifecycle`. Revalida dueño y
pruebas, lee operación/job/head/proyección en un mismo SELECT y sólo devuelve
estados, motivos acotados y fechas/IDs públicos. No devuelve leases, firmas de
ejecución ni URLs de proveedores. No despierta jobs ni hace RPC o escrituras.
El recibo de operación usa `deployment_assessment: not_assessed`, no el antiguo
`account_deployed: false` fijo. `lifecycle.bootstrap` es evidencia histórica;
no demuestra seguridad actual y no habilita recibir/gastar. El cliente V3 se
actualiza conjuntamente mediante el descriptor de release, sin fallback legacy.

### Seguimiento privado de creación — incremento 40

`creationJobHandlers` compone el procesador de entrega, el journal de observación
y la proyección bootstrap. La migración **0008** agrega `account_creation_jobs`.
Autorización, outbox y job se insertan en un único batch D1, sin trigger ni
relajar el control de `meta.changes`. Si falla el job, todo el batch se revierte.
Los registros locales anteriores reciben un job al aplicar esta migración local.

La cola transporta únicamente versión/kind, ID de inicialización y token de
despacho. Nunca JWT, firma, endpoint, checkpoint ni indicaciones monetarias.
El handler HTTP solicita un wake-up best-effort por `waitUntil` después de
autorizar; cron recupera la notificación perdida sin depender del navegador.
El resolver de admisión real sigue cerrado; las pruebas inyectan configuración
privada sintética, no una bandera pública ni una variable de activación.

- Cron cada minuto, máximo 20 candidatos por invocación; selección por proyecto
  y perfiles admitidos, ordenada por fecha del próximo intento.
- Lease de notificación de 120 s y ejecución de 180 s; presupuesto de trabajo
  de 120 s. Tokens vencidos/repetidos no reclaman ni liberan el trabajo ajeno.
- Batch de cola de dos mensajes, procesados en serie; máximo dos invocaciones
  concurrentes. La cola reintenta errores de almacenamiento hasta tres veces,
  con 60 s de espera y DLQ configurada **sólo localmente**.
- Los reintentos normales se guardan en D1, con espera de los procesadores:
  no se llama recursivamente al consumidor ni se hace polling en Home.
- Ocho fallos de procesamiento/envío a cola pasan a `review`; una creación
  enviada que sigue sin evidencia resolutiva después de 24 h también se revisa.
  `review` no significa transacción fallida, fondos perdidos ni cuenta activa.
- El estado `sending` interrumpido pasa a `uncertain`, nunca a `pending`.
  Las revocaciones impiden nuevos envíos, pero no borran el resultado económico
  de una operación previamente enviada. La proyección no habilita recibir/gastar.

Antes de abrir staging: provisionar los recursos aislados con autorización,
admitir contratos/proveedores y checkpoint fresco, alertar `review` y DLQ, y
probar redrive operativo. Un mensaje viejo de DLQ **no** debe forzar un send:
su token puede estar vencido; la autoridad sigue siendo el grant y estado D1.
La API/UI de estado y el procedimiento autorizado de revisión/redrive siguen
pendientes. No se debe borrar el outbox ni reiniciarlo a `pending` para salir
de incertidumbre. No hay un endpoint de administración expuesto por este cambio.

La guía de Workers orientó el uso de bindings, leases persistentes, trabajo
acotado y ausencia de promesas de I/O globales. Tipos generados desde Wrangler,
no interfaces de ambiente escritas a mano; ninguna credencial fue añadida.

## Verificación local

Desde la raíz:

```sh
pnpm check:v3:wallet-api
pnpm --filter server test:unit
pnpm --filter server test:worker-runtime
```

El primer comando comprueba tipos generados, TypeScript, pruebas V3 en workerd
con D1 local, y un bundle **dry-run**. CI también lo ejecuta. No publica ni
aprovisiona recursos. El ID D1 cero es un identificador local deliberadamente
inválido para producción; no quitarlo para provocar autoprovisionamiento.
No ejecutar `wrangler deploy` sin `--dry-run` sobre este archivo. El runbook de
release V3 con permisos, inventario, manifest y verificaciones remotas aún falta.

La suite usa el runtime workerd instalado con compatibilidad `2026-07-08`;
el target nuevo declara `2026-09-08`. La prueba de equivalencia con el runtime
final y la infraestructura real sigue siendo un gate remoto, no se presume.
Las pruebas de éxito usan una copia sintética del manifest y sustituyen sólo
Firebase/Siteverify. Los tests del entrypoint exportado verifican el rechazo
real del ambiente no provisionado. No hay bandera HTTP ni fallback de emulador
que permita sustituir el manifest del Worker publicado.

## Configuración y procedencia

Los nombres siguientes son un contrato de configuración, no valores creados:

| Nombre | Origen al provisionar un ambiente autorizado | Presente ahora |
|---|---|---|
| `GATOPAGO_ENVIRONMENT` | Manifest versionado: staging o production | staging local |
| `FIREBASE_PROJECT_ID` | Proyecto Firebase aislado, idéntico al manifest Web | marcador unprovisioned |
| `FIREBASE_WEB_API_KEY` | Configuración pública Web del mismo proyecto Firebase | placeholder vacío |
| `TURNSTILE_SECRET_KEY` | Widget Cloudflare del ambiente y hostname exactos | placeholder vacío |
| `AUTH_RATE_LIMIT_PEPPER` | Material aleatorio independiente para HMAC de cuotas, mínimo 32 caracteres | placeholder vacío |
| `WALLET_DB` | D1 nueva de Wallet Core, nunca App/Payments históricos | D1 simulada local |

`secrets.required` permite generar nombres/tipos sin consultar credenciales.
El Web API Key de Firebase es público; se maneja como binding del Worker por
configuración, no como una prueba de identidad ni como una clave de firma.
Ningún secreto existente se creó, copió, rotó o publicó. No usar Admin SDK,
`FIREBASE_SERVICE_ACCOUNT`, `AUTH_CODE_PEPPER` legacy ni claves monetarias aquí.

## Contrato y límites

- Sólo JSON `{email, locale: "es" | "en", turnstileToken}`; campos adicionales,
  cookies, bearer tokens y query strings se rechazan. Máximo 4 KiB por body.
- Origen Web y host API exactos del manifest; preflight únicamente POST,
  Content-Type y las cinco cabeceras públicas de compatibilidad descritas abajo.
  CORS **no** demuestra humanidad ni identidad: clientes ajenos
  a un navegador pueden declarar un Origin.
- Turnstile obligatorio también en testnet: `email_login`, hostname exacto,
  validación por cada petición, sin caché de tokens. No se aceptan secretos
  públicos de prueba en la configuración del handler real.
- Cuotas D1 mediante escritura condicional atómica: IP 20/h; correo 3/15min
  y al menos 60s entre solicitudes; global 2.000/h. Un token inválido consume
  sólo la cuota IP. Rechazos no extienden ventanas. IP/correo se guardan como
  HMAC con separación de dominio/ambiente, nunca texto claro. No hay estado de
  petición compartido en memoria global. La poda por petición está acotada.
- CF-Connecting-IP procede del edge en el despliegue directo previsto. No se
  confía en X-Forwarded-For. Cualquier proxy/BFF futuro necesita revalidar esta
  frontera; los tests inyectan direcciones reservadas de documentación.
- El destino del magic link se construye desde el manifest: `/login?flow=signin`
  con idioma. Nunca se toma `continueUrl`, UID, tenant o recovery del cliente.
- `202 {sent:true,resendAfterSeconds:60}` significa **aceptación del proveedor**,
  no recepción en la bandeja ni usuario autenticado. Google consume el enlace;
  este Worker no devuelve el código, custom token o sesión.
- Siteverify tiene 3s y Firebase 5s de presupuesto; lecturas/cuerpo y llamadas
  externas comparten señal de cancelación con presupuesto de petición de 10s.
  D1 no ofrece cancelación de una escritura en vuelo: se comprueba la señal
  antes de enviar el correo y no se afirma rollback de cuotas ya consumidas.
- Una respuesta incierta NO se reintenta ni reembolsa cuota. El usuario puede
  revisar su bandeja y pedir explícitamente otro enlace después. El envío es
  síncrono y acotado para confirmar aceptación; una Queue at-least-once sin
  idempotencia del proveedor podría duplicar correos. No es un workflow largo.
- Auth responses: no-store, sin PII/secrets/cuerpos del proveedor. Invocation
  logs automáticos desactivados en este candidato; observabilidad operativa
  sanitizada y redacción en toda la infraestructura deben cerrarse antes de uso real.

### Compatibilidad de Web y Worker

`GET /app/v1/client-compatibility` publica `minimum_mutating_release`, allowlist
vigente, API version, ambiente y perfiles de contratos. Es público y no-store;
`environment_status: unprovisioned` y `account_profiles: []` **no** habilitan
login remoto ni Account V3. Se puede consultar sin declarar una versión cliente.

El POST de magic links exige:

- `X-GatoPago-Client-Release`: ID de fuentes compartido por Web y Worker.
- `X-GatoPago-Api-Version`: `wallet-core-v3.1`.
- `X-GatoPago-Environment`: ambiente exacto.
- `X-GatoPago-Account-Generation: none`.
- `X-GatoPago-Contract-Manifest: none`.

`none` es explícito para identidad, que no opera sobre un contrato. Las futuras
rutas de cuenta deben declarar scope `account` y exigir una pareja habilitada
de generación/versión inmutable del deployment manifest. No es la versión del
SecurityManifest de un usuario ni sustituye su validación onchain.

Falta, duplicado o discrepancia devuelve `409 CLIENT_UPDATE_REQUIRED`, antes de
leer body, gastar cuota o llamar a proveedores. Se expone por CORS la cabecera
`X-GatoPago-Client-Status: update-required` para la UI. No se usa 426: no estamos
negociando otra versión del protocolo HTTP. El perfil monetario vacío falla
cerrado; todavía no existen rutas financieras V3 que puedan superar este gate.

El descriptor [web-release.json](../../shared/v3/web-release.json) se comprueba
en el build Web y en `build:v3:local`. Tras revisar un cambio de fuentes, ejecutar
`node scripts/v3-web-release.mjs --describe` desde la raíz y actualizar el JSON
con ese resultado. El comando sólo imprime; no escribe ni autoriza un release.
No modificar el ID manualmente para hacer pasar el guard. Su hash cubre fuentes,
assets, paquetes/configuración seleccionados y lockfile, normalizando CRLF textual.
No certifica el bundle desplegado, secrets, instalación de dependencias o el hosting.

Las cabeceras/IDs son públicos y falsificables: detectan clientes incompatibles,
**no autentican al usuario ni demuestran que ejecuta un bundle determinado**.
No se descarga la versión nueva para etiquetar solicitudes de código antiguo.
Para una transición N/N-1, mantener explícitamente el ID anterior con un
`accepted_until` finito sólo si sus operaciones siguen siendo compatibles.
La lista actual acepta únicamente el candidato actual; no hay fallback V1/V2.
Un futuro deploy debe coordinar ambos artefactos; primero publicar soporte
compatible en Worker, después Web, y retirar N-1 al vencer su ventana. Si no
pueden convivir sus semánticas, realizar un corte explícito, no falsear el ID.

### Límite importante del control antiabuso

La API key Web de Firebase es pública. Las cuotas anteriores protegen **esta
ruta**, no impiden por sí solas invocar directamente `accounts:sendOobCode`.
Antes de abrir staging hay que verificar controles de abuso/cuotas del proyecto
Firebase, asociación key/proyecto, restricciones aplicables y alertas. No se
declara una protección global del proveedor porque los tests de nuestro Worker
pasen. También falta probar Google, magic links reales y Turnstile real en Web
y Worker conjuntamente, con autorización de recursos y correo.

Fuentes revisadas: [Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[Firebase sendOobCode](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode).
