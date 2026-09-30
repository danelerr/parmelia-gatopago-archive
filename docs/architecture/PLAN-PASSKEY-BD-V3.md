# Iteración: acceso con passkey y simplificación de BD V3

Fecha: 2026-09-28. Estado: implementación local validada; smoke integrado pendiente, no desplegada.

Última validación para staging: `pnpm verify:ci` terminó con exit 0 usando
Foundry 1.7.1 y las variables públicas reales del frontend. Pasaron 888 pruebas
Web, 748 unitarias de Wallet Core, 1.296 Workers, 60 unitarias y 42 Workers de
Flow, y 395 contractuales. Las cuatro pruebas de fork optativas no se ejecutaron;
la prueba RPC optativa se ejecutó por separado y verificó la composición V3 con
ambos observadores. Cobertura, tamaños, lint y auditoría de dependencias pasaron.
Log: `output/staging-source-review/verify-ci-final.log`. No acredita el smoke remoto.

## Estado de implementación

- Wallet Core ya usa `users → wallets → wallet_accounts`; se actualizaron consultas,
  creación, seguridad, transferencias y DTO del frontend. El alta implícita mediante
  `POST /session` fue retirada.
- Flow eliminó `payment_links`: el enlace se proyecta desde `payment_intents` y el
  propietario del comercio. El importe decimal se deriva de `amount_atomic`.
  Creación, cancelación y liquidación ya no sincronizan dos tablas. Se retiraron
  los dos índices de links y los dos índices redundantes de prefijo.
- Registro por invitación y login descubrible están implementados como repositorios
  con verificación WebAuthn real y transacciones D1. Incluyen consumo único, reserva
  provisional del username, rollback de registro y token custom Firebase de cinco
  minutos. Ya están conectados a las cuatro rutas HTTP y a las pantallas de registro/login.
  El navegador intercambia el custom token con Firebase después de la verificación.
- Los ID tokens sólo admiten el contrato custom con referencia/versión de credencial;
  las consultas y escrituras autenticadas revalidan su vigencia mediante una condición
  SQL común. Google/password y el endpoint de correo fueron retirados del backend.
  La admisión ahora reconcilia `login_enabled` y `access_version` con ADMIN onchain
  en todas las cuentas del usuario mediante dos RPC. `revoked_at` es una revocación
  local que ese proceso nunca revierte. Repositorios y jobs usan ahora ID interno
  y entorno; Firebase queda en autenticación, protegido por una auditoría AST.
- El frontend retiró Google/correo, los proxies Firebase y la dependencia de la URL
  de correo para contactar Wallet Core. La identidad de navegador sólo contiene el
  UID; el perfil se lee de Wallet Core. El emulador no ofrece una vía alternativa
  de admisión. Falta aceptación del flujo nuevo en navegador con proveedores reales.
- Perfil y recepción por username están conectados al backend y al frontend. La
  publicación y resolución verifican la cuenta mediante dos RPC; las consultas
  tienen cuotas propias. La revisión de envío fija la dirección resuelta antes de
  firmar. Username y wallet receptora publicados son inmutables en esta iteración.
  No se añadieron tablas, índices ni triggers para estas pantallas.
- Flow delega la sesión Consumer al entrypoint privado `WalletIdentity` de Wallet
  Core; se retiró su verificador Firebase duplicado y la dependencia directa `jose`.
  Recibe el ID interno, comprueba el entorno y no cachea autorizaciones. Checkout
  anónimo y API keys siguen independientes. Falta validar el binding provisionado
  en el entorno real. La revocación onchain está cubierta localmente, incluido el
  rechazo de tokens renovados y la indisponibilidad del proveedor.
- La consola `pnpm wallet:invites` emite/revoca invitaciones con un cupo explícito
  de usuarios más invitaciones vigentes. Usa una escritura condicional, exige
  selección local/remota y conserva sólo hashes. Prueba real con Wrangler local
  en base temporal completada; no se emitieron invitaciones remotas.
- Patrocinio usa el ID interno estable con clave foránea y constraints para hashes,
  importes canónicos, redondeo y liquidación. Se consolidó en el esquema inicial.
  La retención conserva enrollment durante su cuota de 24 horas y elimina
  invitaciones vencidas sin consumir cuando ya no tienen desafíos asociados.
  Invitaciones consumidas y reservas financieras se conservan. Los seis planes
  SQL de cuotas/retención usan índices sin ordenación temporal.
- Flow usa `owner_user_id`/`payer_user_id` y RPC v3 con `claim.userId`; rechaza el
  formato anterior y claims ambiguas antes de acceder a almacenamiento.
- Pendiente: configurar staging y ejecutar el smoke real. Los límites por IP/global
  siguen siendo configurables; los gates locales no acreditan el entorno remoto.

Verificación local del 28/09 tras separar la identidad interna:

| Alcance | Resultado |
| --- | --- |
| Wallet Core unitarias | 744 aprobadas; una prueba de RPC real omitida |
| Wallet Core Workers completa | 1.285 aprobadas en 52 suites, 345,36 s; exit 0 |
| Wallet Core Workers dirigidas, revisión previa al ajuste del índice | 364 aprobadas en siete suites de registro, enrollment, wallets, patrocinio, respaldo y transferencias |
| Flow | 60 unitarias y 40 Workers aprobadas |
| Frontend | 888 pruebas aprobadas; tipos, lint, inventario y build correctos |
| Tipos, typegen, lint y builds locales de ambos backends | Correctos |
| Fronteras e invitaciones | Ocho y cuatro pruebas aprobadas; imports e infraestructura auditados |
| Planes SQL | Seis de Wallet Core y trece de Flow; integridad y claves foráneas correctas |
| Knip, ciclos, logs estructurados y guards de deployment | Correctos |
| Protocolo | Dependencias Solidity, perfil desplegado, schemas, vectores, layout, WebAuthn y ABIs correctos |
| Contratos | 395 aprobadas; cuatro pruebas de fork optativas omitidas; 31 suites, exit 0 |
| Auditoría de dependencias de producción | Sin vulnerabilidades conocidas |

Las tres pruebas adicionales de Flow rechazan claims antiguas, IDs del proveedor
no canónicos y campos ambiguos antes de acceder a almacenamiento. El índice de
invitaciones se ajustó después de comprobar que SQLite elegía otro índice y hacía
una ordenación temporal; ahora usa la clave compuesta sin ese paso.

La nueva pasada completa cierra los fallos de la ejecución anterior. No se
relajaron plazos ni condiciones SQL de producción. Los logs de esta revisión
se conservan en `output/passkey-db-v3-verification/`. No equivalen a checks de
GitHub sobre un commit publicado.

Descriptor web de esa validación: `web-v3-af036e1f4788a204dc672b59d406bd664ed62fba4eaec12be5e80479c4bd649a`,
236 inputs. Es identidad de fuentes, no una atestación de despliegue.

El binding remoto y el smoke real de Turnstile/passkey siguen pendientes.
Staging ya referencia Firebase y Arbitrum Sepolia provisionados; producción
permanece `unprovisioned`. Configuración disponible no significa deployment
publicado ni transacciones verificadas.

Preflight remoto de sólo lectura del 28/09:

- Firebase CLI tiene acceso al proyecto `proyecto-prueba-push-firebase`, llamado
  Parmelia. Daniel confirmó usarlo para staging el 28/09. La aplicación web
  existente es `1:1011080603204:web:5a42f1ccf6d7a0d33e3e11` (`parmelia-links`).
- Las consultas DNS A y AAAA de `staging.gatopago.com` y
  `api.staging.gatopago.com` devolvieron `ENOTFOUND`.
- La comprobación posterior de `wrangler whoami` terminó con exit 0: Cloudflare
  ya está autenticado. No hace falta repetir el login por el fallo anterior.
- La zona `gatopago.com` está activa en esa cuenta. Los únicos Workers enumerados
  son `server` y `gatopago-payments-api`; todavía no hay Workers V3 de staging.
- D1 enumera `parmeliadb`, `gatopago-payments` y
  `gatopago-payments-semantic-20260826`. Las colas existentes son
  `parmelia-scheduled-jobs`, `gatopago-payment-jobs` y sus DLQ. Ninguna de estas
  bases o colas se ha seleccionado para el esquema nuevo.
- El widget Turnstile existente sólo admite `app.parmelia.me` y `parmelia.me`.
  Staging necesita un widget para `staging.gatopago.com` y su secreto asociado.
- Los archivos locales de Wallet Core inspeccionados no contienen
  `FIREBASE_CUSTOM_TOKEN_SIGNER_JSON` ni `WALLET_RPC_ENDPOINTS`. Sigue pendiente
  configurar el firmante del proyecto elegido. La decisión posterior es operar el
  relayer en Wallet Core: requiere `PRIVATE_KEY` y ETH de prueba en
  su EOA dedicada, sin servidor ni endpoint de bundler separado.

Hasta provisionar y conectar estos recursos no se puede acreditar el intercambio
real de tokens, la passkey del dominio definitivo ni el binding remoto. La elección
del proyecto Firebase queda registrada aquí; el manifiesto conserva
`unprovisioned` hasta que existan los recursos necesarios. No se crearon recursos
remotos ni se modificaron proyectos Firebase durante esta comprobación.

Implementación posterior del relayer en Workers, solicitada por Daniel:

- Creación y transferencias comparten transporte `self`/`bundler`. El catálogo
  de Arbitrum Sepolia selecciona `self`; el entorno sigue sin habilitarse.
- `user_operation_submissions` persiste el transporte y, para self relay, nonce,
  transacción firmada y hash antes del envío. Los jobs recuperan los mismos bytes;
  las consultas de estado no hacen broadcasts. El cambio de proveedor no modifica
  los envíos anteriores. No hay sustitución automática de comisiones.
- Se reutilizan las verificaciones de transacción operativa y los dos RPC para
  simulación; recibos y finalidad mantienen su validación independiente.
- Suite completa: 1.295 Workers y 744 unitarias aprobadas, una prueba live omitida.
  Tras separar recuperación y lecturas, 265 Workers y 35 unitarias dirigidas
  aprobaron los cambios finales. Tipos, lint, build, typegen, Knip, ciclos,
  fronteras y planes SQL correctos. Esto no acredita un envío remoto.
- Esquema actual de Wallet Core: 32 tablas, 316 columnas, 26 índices explícitos
  y 24 triggers; integridad y claves foráneas correctas. La tabla adicional guarda
  envíos de la EOA, no duplica estados financieros ni identidad del usuario.

También se crearon posteriormente dos D1 vacíos (`gatopago-wallet-core-staging`
y `gatopago-flow-staging`) y sus colas `-jobs`/`-jobs-dlq`. Sus identificadores están
registrados en `wrangler.staging.jsonc` de cada backend. Se aplicó `0001_initial.sql`
en ambos D1 nuevos. No se publicaron Workers ni se habilitó el entorno. Los recursos
anteriores permanecen intactos.

La migración remota de Wallet Core detectó una limitación del parser D1 con
`SELECT CASE … END` dentro de un trigger. Encerrar la expresión entre paréntesis
permitió aplicar el mismo esquema, sin retirar constraints ni cambiar la condición
de reconciliación. El intento fallido no dejó tablas de aplicación parciales.
Los comandos `deploy:staging` de ambos backends completaron su dry-run; cuatro
pruebas cubren la selección de recursos, argumentos y secretos obligatorios.
La publicación conserva el requisito de fuente reproducible y entorno admitido.
Ambas bases remotas devolvieron `quick_check = ok` y cero conflictos de claves
foráneas. Wallet Core tiene 32 tablas, 26 índices explícitos y 24 triggers; Flow,
22 tablas, 38 índices explícitos y un trigger (excluyendo metadatos de D1).
Después del ajuste SQL aprobaron las 205 pruebas Workers de reservas/reconciliación
y los seis planes de consulta de Wallet Core. D1 remoto no admite el pragma
`integrity_check`; esa comprobación completa sigue acreditada sólo en SQLite local.

Preparación de credenciales de staging posterior a esas migraciones:

- Creado `gatopago-staging-auth@proyecto-prueba-push-firebase.iam.gserviceaccount.com`,
  sin conceder roles de proyecto. Su clave RSA firma los custom tokens de staging.
- Creado el widget managed `GatoPago staging signup`, limitado a
  `staging.gatopago.com`, sin pre-clearance. Site key pública:
  `0x4AAAAAAFIbO_vx5D_ZvYVE`.
- Secretos de Wallet Core guardados en
  `~/.config/gatopago/staging/wallet-secrets.json` (0600, directorio 0700),
  fuera del repositorio. Incluyen el firmante Firebase, Turnstile, pepper, mapa
  de los dos RPC y una clave nueva dedicada al relayer. La configuración pública
  del frontend está preparada en `web-config.json` del mismo directorio.
- Emisión con `createSessionToken`, intercambio Firebase, verificación con
  `verifyConsumerIdentity` y renovación con conservación de claims: aprobados
  contra Firebase real. Se ejecutó el código del backend en Node con un adaptador
  de caché vacío, no en un Worker remoto. Los usuarios temporales se eliminaron.
- La inspección live de composición contractual y checkpoint finalizado aprobó
  nuevamente mediante los dos RPC de Arbitrum Sepolia.
- Relayer preparado: `0x05a48b17e57593783BCA71A3a3B3f00D644A02F4`.
  Ambos RPC confirman saldo cero; no se envió ninguna transacción. Los archivos
  `.env` actuales de contratos y Wallet Core no contienen una clave válida para
  financiarlo. Se solicitó al usuario financiación de prueba o su ruta local.

Quedan pendientes la financiación, secretos de Flow, dominios, publicación desde
fuente registrada y publicada, binding remoto y smoke completo de passkey/creación/
transferencia. Los secretos preparados todavía no están desplegados.

Revisión de rutas antes de publicar:

- Flow atendía `/checkout/*`, `/links/*` y `/merchant/*`, mientras Wrangler sólo
  publicaba `/checkout/v1/*` y `/v1/*`. Se corrigió la composición a
  `/checkout/v1/*`, `/v1/payment_links` y `/v1/merchant/*`, sin aliases. Las rutas
  de sesión se resuelven antes del middleware de API keys de integradores.
- Health ahora usa `/app/v1/health/live|ready` en Wallet Core y
  `/v1/health`, `/v1/health/live|ops` en Flow, dentro de las rutas publicadas.
- Aprobaron las 42 pruebas Workers y 60 unitarias de Flow, las seis pruebas
  Workers de composición de Wallet Core y las 26 pruebas de ownership/entorno.
  Tipos, lint, fronteras y Knip correctos. Las pruebas rechazan los paths retirados
  y verifican que sesiones y API keys no sustituyen la autenticación de la otra API.
- Lectura real del router Flow `0x64e0B48A4D360B235C3fEDe2431D79413aebb7A4`
  en Arbitrum Sepolia: ambos RPC coinciden en `paused = false` y en owner/signer
  `0x75464f762bc50d0A0B127ab5a085504BF102Bb88`. Activar autorizaciones exige
  la clave de ese signer o una rotación autorizada por el owner; generar una clave
  distinta localmente no conecta el router. No se modificó su configuración onchain.
- Daniel confirmó que financiará el relayer con ETH de prueba. La última consulta
  a ambos RPC aún devuelve saldo cero; no se interpreta la intención como depósito.

Preparación del frontend y DNS:

- Creado el proyecto Vercel `gatopago-web-staging`, raíz `apps/web`, Node 24,
  instalación con lockfile y cuatro variables públicas para Preview. El dominio
  `staging.gatopago.com` está asociado a `feature/v3`; no hay deployment todavía.
- Creado y verificado el DNS A de `staging.gatopago.com` a `76.76.21.21`, DNS only.
  Los registros anteriores del dominio permanecen intactos.
- Wallet Core declara el Custom Domain `api.staging.gatopago.com` para que su
  publicación cree DNS y certificado. Flow conserva sus rutas específicas sobre
  el mismo hostname. El dominio de API sigue pendiente de publicación.
- El manifiesto conecta el Firebase provisionado y sólo Arbitrum Sepolia a staging;
  producción permanece deshabilitada. Las variables públicas del frontend se
  configuraron también en GitHub Actions. Esto permite verificar y publicar la
  configuración real; no acredita saldo del relayer ni el smoke financiero.

Medición intermedia sobre los esquemas SQL vacíos (no instalaciones remotas):

| Backend | Tablas | Columnas | Índices explícitos | Triggers |
| --- | ---: | ---: | ---: | ---: |
| Wallet Core, antes | 32 | 295 | 21 | 23 |
| Wallet Core, ahora | 31 | 306 | 26 | 23 |
| Flow, antes | 23 | 273 | 42 | 1 |
| Flow, ahora | 22 | 259 | 38 | 1 |

Wallet Core eliminó tres tablas estructurales y añadió dos para invitaciones y
challenges de autenticación. El aumento neto de columnas incluye esa funcionalidad
nueva y los campos de perfil/acceso; no es una afirmación de reducción total de
almacenamiento. Ambos esquemas pasan `integrity_check` y `foreign_key_check`.
La reconciliación de acceso añade una columna JSON acotada en `users`, sin tablas,
índices ni triggers nuevos.

## Objetivo y alcance

Propuesta de lanzamiento: beta por invitación controlada. Crear una cuenta
GatoPago con nombre, username y passkey; volver a entrar con
esa passkey sin Google ni correo obligatorio. Mantener Firebase Authentication
para emitir y renovar sesiones. Simplificar las bases de Wallet Core y Flow,
sus repositorios y los contratos de API afectados, sin compatibilidad con datos
o clientes anteriores.

Esta iteración incluye la resolución funcional de usernames y su conexión con
perfil, recepción y revisión de envío. No incluye FCM, Analytics, aplicación móvil, cambio del modelo de
autoridad Solidity ni nuevos despliegues de contratos. Esas integraciones serán
trabajo posterior; no se añadirán tablas especulativas para ellas.

No se eliminarán bases remotas durante la implementación. El despliegue usará
bases nuevas y un cambio coordinado de frontend/backend; no habrá escritura doble
ni adaptadores al esquema anterior. La retirada de bases antiguas será una tarea
explícita del despliegue, con identificación exacta del entorno.

## Decisiones de arquitectura

- Un ID interno estable identifica al usuario. Firebase recibe ese mismo valor
  como UID; no se guarda otra referencia ni proyecto Firebase en `users`. La BD
  conserva el entorno de GatoPago. Autenticación valida emisor/proyecto y entrega
  un principal interno a los repositorios; ninguna operación depende del proveedor.
- Wallet Core verifica WebAuthn y emite un custom token para el UID correspondiente.
  El navegador lo intercambia mediante `signInWithCustomToken`; las APIs reciben
  el ID token Firebase resultante, nunca el custom token como bearer de API.
- Firebase se concentra en el módulo de autenticación. Los repositorios reciben
  un principal interno verificado, en lugar de repetir joins por proyecto/subject.
- El backend conserva sus controles de revocación y autorización. El verificador
  admite únicamente el contrato custom con referencia/versión de credencial;
  Google/password no se aceptan como acceso Consumer.
- La sesión no autoriza transferencias, cambios de policy ni altas de firmantes.
  Se mantienen los mensajes y firmas específicos del protocolo contractual.
- Passkey registrada, credencial autorizada onchain y sesión son estados distintos.
  La creación pendiente puede permitir acceso al onboarding; no permite simular
  una wallet activa ni publicar un destino de recepción sin verificarlo.
- Flow adopta el mismo contrato de identidad y referencias internas de propietario,
  sin acceso SQL directo a Wallet Core. Se conserva su autenticación por API keys.

## Control de abuso: cuentas, usernames y patrocinio

La passkey demuestra posesión, no unicidad humana. Firebase Auth, Turnstile y
App Check tampoco garantizan una persona por cuenta. El objetivo de esta iteración
es dificultar el registro automatizado, limitar acaparamiento y acotar el coste,
sin confundir esos controles con prueba de identidad.

- Reutilizar Turnstile en el registro con validación de servidor, action/hostname
  esperados y token de un solo uso. Aplicar límites baratos antes de WebAuthn,
  escrituras duraderas, emisión Firebase y solicitudes de patrocinio.
- Limitar desafíos y altas por IP, señales de instalación y capacidad global.
  Las señales de instalación se pueden reiniciar; IP compartida no equivale a
  persona. Usar enfriamiento y desafío adicional antes que bloqueos permanentes
  basados sólo en IP. La admisión global debe ser atómica entre workers.
- Usar umbrales configurables y medir rechazo/abandono; no inventar límites de
  producción sin datos. Los presupuestos globales de coste sí son límites duros.
- Un usuario tiene como máximo un username. Normalizarlo a un alfabeto ASCII
  acotado, comprobar unicidad atómica y reservar nombres de sistema/suplantación.
  Propuesta inicial: 5–30 caracteres; nombres más cortos quedan sin asignación
  automática. Esta regla reduce inventario atractivo, no impide multicuentas.
- La comprobación de disponibilidad no reserva. Tras verificar la passkey se
  permite una reserva provisional corta durante onboarding, con vencimiento
  absoluto y sin renovaciones ilimitadas. Sólo la activación verificada y la
  admisión antiabuso convierten esa reserva en username público definitivo.
- No liberar ni reasignar automáticamente un username ya publicado por inactividad:
  puede haber links/QR antiguos. El vencimiento aplica a reservas nunca publicadas.
- Antes de desplegar cada cuenta patrocinada, reservar presupuesto global y por
  usuario; limitar también la cantidad de nuevas creaciones por intervalo. Una
  nueva passkey/UID no debe superar el límite global. Reintentos consumen la misma
  reserva cuando representan la misma operación, sin doble gasto presupuestario.
- Un límite de patrocinio pausa nuevas concesiones, no congela fondos ni revoca
  autoridad contractual de cuentas existentes. Respuestas claras y reintentos
  controlados; no convertir una solicitud fallida en otro intento facturable.
- Para la beta, usar invitaciones de un uso emitidas por GatoPago dentro de un cupo
  global. Los usuarios nuevos no reciben automáticamente capacidad de emitir otras:
  así no existe crecimiento recursivo de invitaciones. Ésta es la propuesta de
  lanzamiento; la emisión real se configura al habilitar el entorno.

### Invitaciones: implementación mínima

Una tabla `signup_invites` en Wallet Core guarda el hash de un token aleatorio de
alta entropía, creador administrativo, fecha de creación, vencimiento, revocación
y usuario consumidor. El token íntegro se muestra sólo al emitirlo; no se registra
en logs ni métricas. El mecanismo inicial de emisión es una herramienta operativa
autenticada, sin construir un panel o sistema de referidos en esta iteración.

El enlace de invitación abre el registro. Consultar/abrir el enlace no consume la
invitación ni reserva permanentemente un nombre. Verificarla en el inicio evita
trabajo inútil, pero se vuelve a comprobar dentro de la transacción final. El
consumo de invitación, consumo de desafío y creación de usuario/credencial/reserva
de username forman una operación atómica. Dos solicitudes simultáneas no pueden
producir dos usuarios con la misma invitación.

Una vez creado el usuario, el acceso y la reanudación del onboarding se hacen con
su passkey y no requieren otra invitación. Una cancelación del diálogo WebAuthn
no consume el cupo. Una incidencia posterior de Firebase o de creación onchain
no devuelve la invitación al inventario ni crea una segunda cuenta. Una reserva
de username vencida obliga a elegir uno disponible, no a registrarse otra vez.

Limitar también enumeración/validación de invitaciones; no exponer datos del
consumidor al presentar un código gastado. La invitación permite el alta, no
promete patrocinio ilimitado ni sustituye los presupuestos globales. Abrir el
registro más adelante será una decisión explícita de admisión; no habrá un
fallback público que permita omitir el control de invitaciones en la beta.

No exigir depósitos circulares como prueba de humanidad: los mismos fondos pueden
recorrer varias cuentas. No reintroducir Google/correo como supuesto control fuerte
de multicuentas. No añadir identificación legal en esta iteración.

Pruebas adicionales: carreras de reserva de username y de presupuesto, reciclado
de desafíos/Turnstile, múltiples UIDs que comparten el presupuesto global,
agotamiento de cupos, invitación inválida/vencida/revocada/consumida, consumo
concurrente, reanudación sin otra invitación, vencimiento de reservas privadas y no reasignación de
handles publicados. Definir métricas de altas, activaciones, rechazos y coste de
patrocinio sin guardar huellas invasivas ni datos sensibles innecesarios.

Las métricas de aceptación de la beta quedan definidas así:

| Métrica | Fuente y significado |
| --- | --- |
| Altas | Usuarios de Wallet Core creados en el intervalo UTC; no desafíos emitidos ni usuarios de Firebase |
| Creaciones finalizadas | Proyecciones de creación confirmadas, por red y fecha `projected_at`; no equivalen a usuarios únicos |
| Usuarios con wallet | Usuarios distintos con alguna creación finalizada; separar de altas que siguen en onboarding |
| Rechazos de registro/login | Respuestas 400/401/403/409/429/503 de las cuatro rutas de autenticación durante la prueba; distinguir conflicto, cuota y proveedor |
| Presupuesto comprometido | Suma de `charged_gwei` por scope/día; incluye reservas inciertas, no sólo gas ya gastado |
| Gas confirmado | Suma exacta de `actual_wei` de reservas liquidadas, agrupada por red; usar enteros grandes, sin conversión a coma flotante |

Altas, proyecciones y reservas ya tienen fuentes persistidas; no se añaden tablas
de contadores. Las tasas de rechazo/abandono se medirán al habilitar staging y no
se presentan como telemetría ya desplegada. La purga de desafíos impide usarlos
como histórico de conversión. No registrar invitaciones, assertions, tokens,
usernames ni IP sin procesar en los resultados agregados del smoke.

## 1. Cerrar modelo y contratos antes de editar la persistencia

Inventariar consumidores del UID, party ID, account identity ID y wallet account
ID, incluidos frontend, Flow, fixtures, jobs y patrocinio. Definir juntos el nuevo
DDL y los DTO de sesión, perfil, wallet, cuenta por red y credencial.

El modelo central pasa de seis tablas a tres:

```text
users
  └── wallets                  identidad determinística y commitments
        └── wallet_accounts    despliegue y estado por red
```

Eliminar `parties`; fusionar `account_identities` con `wallets` y
`account_instances` con `wallet_accounts`. Conservar los IDs de recurso que
necesite el modelo final, la unicidad por red, los commitments y los pins de
despliegue. Resolver explícitamente el ciclo de vida antes de que exista wallet:
el usuario y sus intentos de onboarding pueden existir sin una wallet activa.

Añadir nombre visible y username canónico único al modelo de perfil. Definir
la wallet receptora del perfil sin depender de seleccionar arbitrariamente la
primera wallet cuando un usuario tiene varias.

Entregable: esquema y API de destino, con mapa de cada campo que se elimina,
se deriva o cambia de propietario.

## 2. Reforma de Wallet Core

- Aplicar el modelo de tres tablas y simplificar queries, proyecciones y tipos.
- Retirar campos constantes sin función propia; V3 permanece explícita en los
  protocolos que lo requieran, sin repetir discriminadores en cada tabla.
- Mantener credenciales y desafíos con relaciones claras. Reutilizar la tabla de
  enrollment sólo donde sus restricciones representen el nuevo flujo; no forzar
  desafíos de login en una estructura incompatible para ahorrar una tabla.
- Unificar tipos de fecha, importes, constraints e índices dentro de cada dominio.
  Endurecer también la tabla nueva de reservas de patrocinio.
- Mantener el presupuesto de patrocinio ligado al usuario interno estable:
  cambiar de dispositivo o passkey no reinicia límites ni elude reservas.
- Consolidar el esquema inicial para instalaciones nuevas y actualizar todos los
  repositorios, jobs, pruebas y consumidores afectados.

La revisión de coordinación conserva el dispatcher común y los procesadores
específicos: creación proyecta la cuenta, backup distingue propuesta y commit,
y transferencia reconcilia fondos/nonces reservados. Sus estados terminales y
autorizaciones no son intercambiables. Se retiró el acoplamiento Firebase de los
tres; se conservan exclusión entre workers, incertidumbre de envío, idempotencia
y evidencias sin introducir otro motor de workflows.

## 3. Registro y login con passkey

Registro:

1. Abrir una invitación válida e introducir nombre y username; validar formato,
   nombres reservados y disponibilidad.
2. Emitir un desafío WebAuthn corto, de un solo uso, ligado al intento de registro.
3. Crear una credencial descubrible con verificación de usuario requerida.
4. Verificar challenge, origen, RP ID, respuesta y posesión; consumir invitación y
   desafío y persistir usuario/credencial/reserva provisional de username de forma
   atómica e idempotente, sujeto a los límites de admisión.
5. Emitir el custom token y abrir sesión Firebase.
6. Continuar el protocolo existente de creación de la wallet, conservando sus
   autorizaciones independientes y su recuperación tras interrupciones.
7. Confirmar el username y publicar recepción sólo al cumplir los requisitos de
   readiness y admisión. Si la reserva venció, pedir un nombre disponible antes
   de publicarlo; no cambiar la identidad de la wallet. Ofrecer una
   segunda credencial autorizada y explicar la pérdida de acceso si se pierden todas.

El username no se reserva indefinidamente con una mera consulta de disponibilidad.
La unicidad se decide en BD; una carrera devuelve un conflicto recuperable. No se
crearán usuarios Firebase por cada consulta ni por cada desafío sin verificar.
Si falla el intercambio con Firebase después del commit local, la cuenta permanece
consistente y se puede reanudar con una nueva autenticación, sin duplicarla.

Login:

1. Emitir un desafío para login sin requerir sesión previa ni correo.
2. Permitir al autenticador seleccionar una passkey descubrible.
3. Resolver la credencial y verificar firma, alcance, user verification y estado.
4. Consumir el desafío atómicamente; emitir token para el mismo usuario interno.

Los desafíos de login y las autorizaciones de transacciones tendrán propósitos
separados. Una prueba de login no será reutilizable para autorizar una operación.
Tratar correctamente passkeys sincronizadas: un contador que no aumenta no basta
por sí solo para declarar clonación; aplicar las reglas de la biblioteca WebAuthn.

Definir credencial de origen y versión de acceso en el contrato de sesión; comprobar
su vigencia en el backend en cada acceso protegido, también tras renovación del
ID token. Una claim no reemplaza la consulta del estado actual de revocación.
La retirada de una llave debe impedir nuevos logins y acceso con sesiones previas
de esa llave. Fijar y probar cómo se reconcilia una retirada realizada directamente
onchain y cuál es su ventana máxima de detección; no prometer revocación instantánea.

Implementado: todas las rutas protegidas, incluido el servicio privado de Flow,
usan la misma admisión. Una llave necesita ADMIN en alguna cuenta del usuario;
archivar una wallet no retira autoridad contractual. El login verifica posesión
antes de consultar proveedores. La evidencia se reutiliza hasta 30 segundos y
nunca más allá de la vigencia de finalidad; las lecturas cacheadas no escriben
ni renuevan ese plazo. El retraso desde una transacción incluye la finalidad de
la red, además de la caché. Un fallo de proveedor no habilita ni revoca llaves.
Una retirada incrementa la versión de acceso; readmitir la llave requiere una
nueva autenticación y no restaura tokens previos. La instantánea se actualiza
junto a las credenciales en una transacción que revalida usuario y cuentas.

Configurar la firma de custom tokens únicamente en backend, con credenciales de
servicio de privilegios mínimos. Verificar compatibilidad con Workers y evitar
añadir otro servidor sólo para emitir tokens. No exponer claves al bundle web.

## 4. Frontend y usernames funcionales

- Reemplazar Google y magic link por crear cuenta/entrar con passkey.
- Eliminar providers, pantallas, endpoints de envío de correo y configuración que
  queden sin consumidores, conservando Firebase Auth y controles antiabuso útiles.
- Permitir reanudar onboarding; distinguir sesión creada, wallet pendiente y wallet
  operativa. No prometer un número de prompts biométricos antes del smoke real.
- Añadir gestión de credenciales, cierre de sesión y aviso claro de recuperación.
- Conectar guardar perfil y la página pública del username al backend real.
- Resolver username a un destino verificado para la red seleccionada, con límites
  de consulta. Mostrar username, red y dirección antes de firmar; fijar esa dirección
  en la operación revisada, sin resolverla de nuevo después de obtener la firma.
- Mantener el username inmutable en esta primera versión para evitar reasignaciones
  y pagos a antiguos handles; permitir editar el nombre visible. La posibilidad de
  renombrar/reutilizar usernames será una decisión posterior explícita.

## 5. Reforma de Flow

- Quitar de `payment_links` el estado financiero duplicado. Para el modelo actual
  de link 1:1 con intent, integrar el identificador público en `payment_intents` y
  eliminar la tabla si la revisión completa confirma que no tiene ciclo propio.
- Conservar las URLs de producto como rutas del nuevo modelo, sin un adaptador al
  esquema anterior. Actualizar creación, consultas, cancelación y settlement.
- Usar importes atómicos como valor canónico; derivar la representación decimal.
- Conservar snapshots de destino/condiciones, cotizaciones, intentos, liquidaciones,
  eventos y entregas de webhooks que representan hechos diferentes.
- Comprobar planes de consulta y retirar los dos índices de prefijo redundantes;
  añadir índices sólo cuando una consulta del modelo nuevo los justifique.
- Simplificar el DDL inicial y adaptar propiedad de comercios a la nueva identidad.

## 6. Retención y validación

Definir purga acotada de desafíos vencidos y datos temporales, con índices de
expiración cuando sean necesarios. Para jobs y reservas financieras, la antigüedad
sola no autoriza el borrado: conservar datos mientras exista incertidumbre,
reintentos válidos o necesidad de reconciliación/dedupe.

Pruebas de aceptación obligatorias:

- Crear cuenta con invitación y sin Google/correo; entrar nuevamente con la passkey
  sin otra invitación. Verificar que no exista un endpoint alternativo de alta libre.
- Mismo usuario al entrar desde otra credencial autorizada; ninguna wallet duplicada.
- Rechazar challenge repetido/vencido, origen/RP incorrecto, firma inválida y
  credencial deshabilitada; aislar propósitos de firma.
- Revocar acceso anterior de una credencial retirada, incluida una sesión renovada.
- Competencia por el mismo username y por la misma credencial sin duplicaciones.
- Reanudar después de fallos de Firebase, bundler o commit local, sin crear otra cuenta.
- Resolver username por red, revisar dirección y completar una transferencia.
- Mantener creación, backup, envío, finality y patrocinio sin regresiones; ninguna
  operación financiera se autoriza sólo con la sesión Firebase.
- Mantener acceso de comerciantes, API keys, checkout, settlement y webhooks de Flow.
- Construir las dos bases vacías; comprobar integridad referencial y constraints.
- Ejecutar pruebas unitarias y Workers de ambos backends, frontend, typechecks,
  lint, builds, boundaries y gates de protocolo afectados.
- Smoke real de navegador/passkey y Firebase staging; separar sus resultados de
  los tests con emuladores. Si falta infraestructura, reportarlo como pendiente.

## Entrega y secuencia

Orden: contratos de datos/API → reforma Wallet Core → registro/login y frontend
→ usernames → reforma Flow → retención y validación integrada.

Trabajar en cambios revisables por responsabilidad dentro del monorepo. Regenerar
bindings, descriptor de release y documentación del runtime al cerrar la iteración.
No extraer repositorios ni desplegar nuevas bases durante el refactor local.

Medir antes/después: tablas, columnas, índices, triggers, consultas principales y
código retirado. Base observada: Wallet Core 32 tablas, Flow 23. Se eliminan tres
tablas estructurales de Wallet Core y posiblemente una de Flow; esto no promete
un total final de 51/52: se añade `signup_invites` y el nuevo login puede requerir
persistencia adicional.
Las mediciones de planes/latencia serán evidencia separada del ahorro de archivos.

La iteración está terminada cuando registro, login, username y flujos financieros
funcionan con el esquema nuevo, sin rutas activas de Google/magic link ni consultas
a las tablas retiradas, y el smoke de staging está documentado. Una suite local
verde no sustituye esa prueba integrada.

Referencia Firebase: https://firebase.google.com/docs/auth/web/custom-auth
