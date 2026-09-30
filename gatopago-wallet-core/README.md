# Wallet Core

Único backend Consumer, exclusivamente Account V3. Es propietario de identidad, credenciales, cuentas, cambios de seguridad y ejecución personal. No contiene rutas comerciales ni depende de la implementación de Flow.

| Módulo | Responsabilidad |
|---|---|
| `src/auth` | Identidad y límites de autenticación |
| `src/enrollment` | Registro y prueba de posesión de credenciales |
| `src/accounts` | Propiedad, sesión e inspección de cuentas |
| `src/creation` | Preparación, consentimiento, envío y observación de creación |
| `src/security` | Primer respaldo opcional y evidencia del cambio de política |
| `src/transfers` | Preparación, simulación, consentimiento, reserva de fondos/nonces, envío y finalidad |
| `src/portfolio` | Balances observados y admitidos |
| `src/runtime` | Catálogo, finality, providers y composición HTTP/Cron/Queue |
| `src/execution` | Despacho de trabajos y formato de assertions |

`src/index.ts` es el único entrypoint. `wrangler.jsonc`, `worker-configuration.d.ts` y `migrations/0001_initial.sql` son la configuración, tipos generados y esquema inicial vigentes. El esquema se aplica a una base nueva; no es una migración de cuentas antiguas.

Copiar `.env.example` a `.env` y completar credenciales. `dev` carga explícitamente
ese archivo; no usa los placeholders de `.dev.vars.example`. URLs, RP (derivado
del host Web), Firebase y redes se resuelven desde los bindings. El JSON
`packages/environment/environments.json` queda como fixture y referencia para
herramientas históricas de despliegue, fuera del runtime.

Turnstile permite su par oficial de prueba únicamente cuando Web y API usan HTTP
en loopback. Sigue consultando Siteverify. En un dominio remoto requiere claves
reales y valida `action: signup` y el hostname exacto.

```sh
pnpm --filter gatopago-wallet-core exec wrangler d1 migrations apply WALLET_DB --local
pnpm --filter gatopago-wallet-core dev
pnpm --filter gatopago-wallet-core cf-typegen:check
pnpm --filter gatopago-wallet-core typecheck
pnpm --filter gatopago-wallet-core lint
pnpm --filter gatopago-wallet-core test
pnpm --filter gatopago-wallet-core build
```

`test:unit` y `test:worker-runtime` permiten ejecutar cada capa. `test` ejecuta ambas, sin un segundo proyecto o ruta de pruebas de compatibilidad. Los tipos se regeneran con `cf-typegen`.

La configuración local no provisiona recursos remotos. `deploy --dry-run` comprueba el paquete remoto sin publicarlo. `deploy` utiliza `wrangler.remote.jsonc` y actualiza el Worker existente `gatopago-wallet-core` (antes `server`), con fuente en un commit local limpio. Reutiliza su secreto `PRIVATE_KEY`, la base limpia V3 y las colas ya provisionadas. `/app/v1/health/live` comprueba vida del Worker; `/app/v1/health/ready` expone configuración, capacidades y dirección pública del relayer. No certifica conectividad ni ejecución en la red. Véase [Runtime](RUNTIME.md).

Una passkey puede crear una cuenta V3 operativa. El módulo `security` implementa el primer respaldo opcional; la API no implementa aún todas las rotaciones permitidas por el contrato. Esta limitación funcional no justifica conservar Account V2.

Los controles de autorización, el tratamiento de un envío incierto y las comprobaciones de finalidad permanecen específicos de cada operación. Las escrituras atómicas revalidan el consentimiento almacenado. No existe un ejecutor genérico que otorgue autoridad a partir de un estado de base de datos.

El acceso Consumer usa exclusivamente passkeys. `POST /app/v1/auth/register/options`
requiere invitación, nombre, username y Turnstile (`action: signup`); `/register/complete`
confirma la credencial y consume la invitación atómicamente. `/login/options` y
`/login/complete` permiten volver con una passkey descubrible. El token custom se
intercambia con Firebase en el cliente; las APIs sólo aceptan el ID token resultante,
con `credential_ref` y `access_version`. No hay alta por `POST /session`, Google ni correo.

`FIREBASE_CUSTOM_TOKEN_SIGNER_JSON` es un secreto de Worker con `project_id`,
`client_email` y `private_key` de una cuenta de servicio dedicada al proyecto del
entorno. Nunca debe entrar al frontend. `AUTH_IP_REQUESTS_PER_HOUR` y
`AUTH_GLOBAL_REQUESTS_PER_HOUR` configuran los límites atómicos; sus valores locales
son candidatos, no una capacidad de producción medida. Cron limpia en lotes de
256 los desafíos vencidos y las reservas privadas de username; elimina enrollment
antiguo conservando las últimas 24 horas de cuota. Las invitaciones sin consumir
se eliminan un día después de vencer y sólo cuando no tienen desafíos asociados.
Se conservan invitaciones consumidas, credenciales, usuarios y reservas financieras.

Los repositorios y jobs usan `Principal` con ID interno y entorno. El UID Firebase
se deriva del ID interno en autenticación; no se duplican UID ni proyecto Firebase
en `users`. Cambiar de passkey no cambia propietario ni reinicia el presupuesto
de patrocinio. La auditoría de imports impide introducir identificadores Firebase
fuera de `src/auth`.

La autorización comprueba la credencial y su versión incluso después de renovar
el JWT. Una passkey registrada permite acceder si tiene ADMIN en alguna cuenta
del usuario, también si su wallet está archivada. Antes de deshabilitar llaves se
inspeccionan todas las cuentas mediante dos RPC. Un fallo de proveedor rechaza
el acceso sin modificar las credenciales. La revocación local es irreversible
para este reconciliador.

La evidencia se reutiliza como máximo 30 segundos, sin prolongarla con cada lectura,
y nunca más allá de su vencimiento de finalidad. La detección de una retirada
onchain depende de la finalidad de la red más esa ventana; no es instantánea desde
el envío de la transacción. Una llave readmitida necesita un login nuevo: sus tokens
anteriores no recuperan validez. Sin cuentas desplegadas se permite onboarding;
haber tenido acceso onchain impide regresar a ese estado eliminando proyecciones.
La firma de operaciones financieras sigue siendo independiente del login.

El entrypoint nombrado `WalletIdentity` ofrece introspección de sesión a Flow mediante
un service binding privado. Usa el mismo verificador de ID token y `WalletRepository`
que el acceso Consumer; comprueba admisión, usuario habilitado, corte de sesión,
credencial habilitada/no revocada y su versión. Devuelve sólo ID interno, entorno y
vencimiento. No se monta en el router público ni concede autoridad financiera.

Las invitaciones se emiten desde consola, sin endpoint administrativo público:

```sh
pnpm wallet:invites issue --local --issuer daniel --hours 24 --capacity 100
pnpm wallet:invites revoke --local --hash 0x_HASH_DEVUELTO_AL_EMITIR
```

Ejecutar desde la raíz del repositorio. `--capacity` cuenta todos los usuarios más
invitaciones vigentes sin consumir; usar el mismo cupo aprobado en cada emisión.
Sólo un operador autorizado puede cambiarlo. El chequeo y la emisión comparten
una escritura SQL. Revocar una invitación consumida no elimina al usuario ni libera
su lugar. Una invitación permite una cuenta, no demuestra unicidad humana.

La salida de emisión contiene el token una sola vez y su hash para revocación.
Entregar el código o un enlace a la pantalla de acceso con `#invite=TOKEN`; no
ponerlo en query strings, logs, tickets ni argumentos de consola. La BD sólo
almacena el hash. Los errores muestran esa referencia para revisar una escritura
incierta antes de reintentar. `--persist-to` permite aislar la base local.

Para bases remotas se exige `--remote --config /ruta/al/wrangler-provisionado.jsonc`
y las credenciales de operador de Cloudflare que usa Wrangler. Para Wallet Core
usar `gatopago-wallet-core/wrangler.remote.jsonc`. La emisión no cambia los
límites de autenticación ni el presupuesto de patrocinio de gas.

Las pruebas locales no sustituyen una creación y transferencia reales con
passkey. Ver [despliegue](../DEPLOY.md).


El perfil vive en Wallet Core: `GET /app/v1/profile`, `POST /app/v1/profile`
(`display_name`) y `POST /app/v1/profile/username` (`username`, `wallet_id`,
`wallet_account_id`). La publicación requiere propiedad y una inspección vigente
con dos RPC: creación terminada, implementación reconocida y suficientes passkeys
registradas/no revocadas para el quorum de gasto, usando el verifier admitido.
La reserva inicial es privada y no se renueva mediante edición de perfil. Una vez
publicados, el username y la wallet receptora son inmutables en esta versión;
puede editarse el nombre visible. Las escrituras revalidan la sesión y propiedad.

`GET /app/v1/recipients/{username}?network_id=eip155:…` es público y vuelve a
verificar la cuenta en la red elegida. Devuelve nombre, username, red, dirección y
vigencia, sin UID ni IDs internos de wallets. No usa una evidencia vencida como
fallback. `PUBLIC_LOOKUP_IP_REQUESTS_PER_HOUR` y
`PUBLIC_LOOKUP_GLOBAL_REQUESTS_PER_HOUR` limitan consultas de recepción (incluida la comprobación al publicar) en buckets distintos
al login; requieren `AUTH_RATE_LIMIT_PEPPER` y el IP provisto por Cloudflare.
Los valores de `wrangler.jsonc` son límites locales candidatos.
