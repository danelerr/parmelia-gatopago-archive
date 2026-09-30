# Arquitectura visual de GatoPago

**Revisión de diseño:** 8 de septiembre de 2026 (V3 FUSION revisión 2)
**Estado:** arquitectura V3 especificada; Fase 4A `home/satellite` reemplazada y
prohibida como base de implementación
**Propósito:** explicar el sistema con un único vocabulario y separar con claridad
lo que está desplegado, lo que está listo en código y lo que sólo es futuro.

**Código vigente (25 de septiembre de 2026):** los backends están en
`gatopago-wallet-core/` y `gatopago-flow/`. La estructura y los límites actuales
están en [`ARCHITECTURE.md`](../../ARCHITECTURE.md). Los nombres de carpetas y
recursos remotos en las tablas históricas siguientes documentan el runtime
anterior; no son instrucciones de despliegue del código actual.

Este directorio es el punto de entrada visual. No reemplaza al código,
`ARCHITECTURE.md`, `SECURITY.md` ni `DEPLOY.md`, y no autoriza por sí mismo un
despliegue.

## Documento canónico V3

[`V3-FUSION.md`](./V3-FUSION.md) es el documento principal y consolidado. Reúne
la arquitectura objetivo, decisiones base, threat model, gates de seguridad,
recuperación y salida soberana, radar ERC/EIP, Next.js, dominios/ambientes,
Platform Accounts, Flow y API B2C/B2B/B2B2C. Stellar sigue como implementación
futura. El orden vigente es E0–E8, con Consumer como primera entrega.

Los documentos especializados permanecen como snapshots de origen; sus planes
anteriores no prevalecen sobre V3 FUSION revisión 2:

- [`ARQUITECTURA-OBJETIVO-V3.md`](./ARQUITECTURA-OBJETIVO-V3.md): diseño total;
- [`DECISIONES-BASE-V3.md`](./DECISIONES-BASE-V3.md): decisiones no ambiguas;
- [`REVISION-SEGURIDAD-PRE-V3.md`](./REVISION-SEGURIDAD-PRE-V3.md): bloqueos y gates;
- [`RADAR-EIP-ERC-V3.md`](./RADAR-EIP-ERC-V3.md): estándares;
- [`STELLAR-SOBERANIA-API-V3.md`](./STELLAR-SOBERANIA-API-V3.md): extensión futura.

En caso de ambigüedad se aplica el orden de autoridad declarado en
`V3-FUSION.md`. Stellar no bloquea V3 ni se convierte en la cuenta principal.

Los diagramas 12–14 describen el candidato histórico Fase 4A y se conservan
sólo como evidencia de la decisión reemplazada. **No deben implementarse ni
desplegarse.** Los diagramas canónicos V3 empiezan en el 15.

## La arquitectura en una frase

GatoPago tiene **dos backends por dominio**, no un Worker por frontend:

1. **App Backend** administra identidad, smart accounts y operaciones personales.
2. **Payments Backend** administra comercios, links, intents, checkout,
   liquidación y webhooks.

El Dashboard es otro cliente web y Checkout es una ruta de App Web. No tienen
Worker propio. El control de corte dentro de App Backend es compatibilidad
temporal, no un tercer BFF.

## Vocabulario del runtime anterior y transición

El código V3 usa `apps/web/`, `gatopago-wallet-core/` y `gatopago-flow/`.
El cambio de carpetas no modifica los recursos remotos del corte anterior.
La tabla siguiente identifica el runtime anterior, no una implementación V3.

| Nombre que usamos | Nombre técnico | Responsabilidad |
|---|---|---|
| App | `client/` | Interfaz de personas y cuenta GatoPago. |
| Dashboard | `dashboard/` | Panel de comercios y desarrolladores. |
| Checkout | ruta pública de `client/` | Experiencia para pagar un link, incluso con wallet externa. |
| App Backend | carpeta `server/`; Worker remoto `server` | Identidad, passkeys, cuentas, UserOperations, Home, swaps, contactos y CCTP personal. |
| Payments Backend | carpeta `payments-worker/`; Worker remoto `gatopago-payments-api` | Comercios, links, intents, quotes, attempts, routing de cobro, settlement, eventos y webhooks. |
| App DB | binding `GATOPAGO_DB`; D1 `parmeliadb` | Datos propios del dominio App. |
| Payments DB | binding `PAYMENTS_DB`; D1 `gatopago-payments-semantic-20260826` | Datos propios del dominio Payments. La D1 `gatopago-payments` permanece sólo como histórico del primer corte. |
| App Jobs | Queue `parmelia-scheduled-jobs` | Indexación y trabajos de App. |
| Payments Jobs | Queue `gatopago-payment-jobs` | Reconciliación, CCTP y entregas de webhooks. |

Un *binding* es el nombre que ve el código. El nombre D1 o Queue es el recurso
que ve el operador en Cloudflare.

## Estado histórico documentado

Evidencia de agosto/2 de septiembre conservada para trazabilidad. No se auditó
el estado remoto al refinar el diseño el 8 de septiembre de 2026.

| Elemento | Estado registrado en el corte anterior |
|---|---|
| App Backend `server` | Desplegado. |
| App DB `parmeliadb` | Existe; todavía contiene también las tablas históricas de pagos. |
| App Jobs | Existen. |
| Payments Backend | `gatopago-payments-api` desplegado con capability/firma del payer, validación de receipt, CAS/expiry, Multicall3 y migración `0006`. |
| Payments DB | `gatopago-payments-semantic-20260826` activa con manifest v4/checksum semántico v2. `gatopago-payments` permanece intacta como evidencia histórica. |
| Payments Jobs | Queue y DLQ creadas; sin trabajos activos o terminales al cierre. |
| Migraciones App `0033` y `0034` | Aplicadas; App usa boundary v2 y modo `payments`. |
| Snapshot de partición | Import data-only ejecutado una vez: 4 merchants, 21 links y 21 intents. El checksum semántico cubre tablas, columnas y contenido; el export target se comparó antes de activar y el sync posterior dejó 7 merchants. |
| Cliente Vercel | `parmelia` sirve `https://app.parmelia.me`; el checkout usa únicamente el provider EIP-1193 que una extensión o el navegador integrado de la propia wallet ya expone. No integra proveedores externos de conexión. |
| Dashboard Vercel | `https://dashboard.parmelia.me` es accesible anónimamente y muestra el login de GatoPago; Vercel SSO está desactivado. |
| Routers de pago | Desplegados y verificados en testnets soportadas. No se activó mainnet. |
| Autenticación App | Google + Firebase Email Link están promovidos; `0035`–`0037` y Passkey Security v2 están activos. No usa Resend, SMTP ni OTP numérico. Las ceremonias WebAuthn reales de aceptación siguen requiriendo gesto del usuario. |
| Fase 4A App multichain | Rechazada como arquitectura objetivo. Sus cambios locales no deben promoverse; V3 reemplaza `home/satellite` por una identidad y dirección determinística únicas. |

## Orden de lectura

1. [Contexto del sistema](./diagrams/01-contexto-sistema.puml) — quién usa
   GatoPago y qué sistemas externos participan.  
   ![Contexto del sistema](./rendered/01-contexto-sistema.svg)
2. [C4 nivel 2: contenedores](./diagrams/02-c4-contenedores.puml) — cuáles son
   los dos backends, las dos D1 y sus clientes.  
   ![C4 contenedores](./rendered/02-c4-contenedores.svg)
3. [C4 nivel 3: Payments](./diagrams/03-c4-componentes-payments.puml) — cómo se
   divide internamente el dominio de pagos.  
   ![C4 componentes de Payments](./rendered/03-c4-componentes-payments.svg)
4. [Creación y ejecución del cobro](./diagrams/04-secuencia-creacion-y-ejecucion-cobro.puml)
   — intent, quote, attempt y broadcast sin declarar pago anticipadamente.  
   ![Creación y ejecución del cobro](./rendered/04-secuencia-creacion-y-ejecucion-cobro.svg)
5. [Reconciliación y webhook](./diagrams/05-secuencia-reconciliacion-y-webhook.puml)
   — leases, evidencia local/CCTP, transición atómica y entrega firmada.  
   ![Reconciliación y webhook](./rendered/05-secuencia-reconciliacion-y-webhook.svg)
6. [Secuencia del corte 2.1](./diagrams/06-secuencia-corte-fase-2-1.puml) — qué
   se crea, migra y despliega, en qué orden y con qué gates.  
   ![Secuencia del corte](./rendered/06-secuencia-corte-fase-2-1.svg)
7. [Actividad de checkout universal](./diagrams/07-actividad-checkout-universal.puml)
   — cómo se elige la ruta sin exponer infraestructura al usuario.  
   ![Actividad del checkout](./rendered/07-actividad-checkout-universal.svg)
8. [Despliegue físico](./diagrams/08-despliegue-fase-2-1.puml) — Vercel,
   Cloudflare, D1, Queues, Durable Objects y redes.  
   ![Despliegue de Fase 2.1](./rendered/08-despliegue-fase-2-1.svg)
9. [Casos de uso B2B](./diagrams/09-casos-de-uso-b2b.puml) — lo que se ofrece
   al promover 2.1 y lo que sigue siendo una propuesta posterior.  
   ![Casos de uso B2B](./rendered/09-casos-de-uso-b2b.svg)
10. [Arquitectura escalable de proveedores](./diagrams/10-arquitectura-proveedores-escalable.puml)
    — núcleo actual y puertos/adapters que sólo se extraen al integrar un
    proveedor real.  
    ![Arquitectura escalable de proveedores](./rendered/10-arquitectura-proveedores-escalable.svg)
11. [Secuencia de magic link de la App](./diagrams/11-secuencia-magic-link-app.puml)
    — Google, Turnstile, solicitud/consumo de Email Link y recovery de un solo
    uso sin proveedor de correo adicional.
    ![Secuencia de magic link de la App](./rendered/11-secuencia-magic-link-app.svg)
12. **Histórico reemplazado:** [C4 nivel 3: App multichain](./diagrams/12-c4-componentes-app-multichain.puml)
    — candidato Fase 4A `home/satellite`; no implementar.
    ![C4 App multichain](./rendered/12-c4-componentes-app-multichain.svg)
13. **Histórico reemplazado:** [Activación y seguridad multichain](./diagrams/13-secuencia-activacion-seguridad-multichain.puml)
    — secuencia satélite descartada; no implementar.
    ![Secuencia de seguridad multichain](./rendered/13-secuencia-activacion-seguridad-multichain.svg)
14. **Histórico reemplazado:** [Actividad de una operación multichain](./diagrams/14-actividad-operacion-app-multichain.puml)
    — gates útiles, pero modelo de cuenta reemplazado.
    ![Actividad multichain](./rendered/14-actividad-operacion-app-multichain.svg)
15. [C4 arquitectura objetivo V3](./diagrams/15-c4-arquitectura-objetivo-v3.puml)
    — dominios, clientes, adaptadores y salida independiente.
    ![C4 arquitectura objetivo V3](./rendered/15-c4-arquitectura-objetivo-v3.svg)
16. [Cuenta determinística V3](./diagrams/16-secuencia-cuenta-deterministica-v3.puml)
    — misma dirección, recepción contrafactual y primer gasto.
    ![Cuenta determinística V3](./rendered/16-secuencia-cuenta-deterministica-v3.svg)
17. [Recuperación multichain V3](./diagrams/17-secuencia-recuperacion-multichain-v3.puml)
    — Security Manifest, timelock y sincronización explícita.
    ![Recuperación multichain V3](./rendered/17-secuencia-recuperacion-multichain-v3.svg)
18. [Salida portable V3](./diagrams/18-secuencia-salida-portable-v3.puml)
    — export package y transferencia de control sin depender de GatoPago.
    ![Salida portable V3](./rendered/18-secuencia-salida-portable-v3.svg)
19. [Despliegue canónico EVM V3](./diagrams/19-despliegue-canonico-evm-v3.puml)
    — manifests, addresses/codehashes iguales y configuración generada.
    ![Despliegue canónico EVM V3](./rendered/19-despliegue-canonico-evm-v3.svg)
20. [Activos e intents V3](./diagrams/20-actividad-activos-intents-v3.puml)
    — capacidad EVM amplia con tiers de confianza y settlement acotado.
    ![Activos e intents V3](./rendered/20-actividad-activos-intents-v3.svg)
21. [Soberanía sin GatoPago](./diagrams/21-secuencia-soberania-sin-gatopago.puml)
    — recuperación con infraestructura GatoPago apagada.
    ![Soberanía sin GatoPago](./rendered/21-secuencia-soberania-sin-gatopago.svg)
22. [C4 multiecosistema EVM/Stellar](./diagrams/22-c4-multiecosistema-evm-stellar.puml)
    — una identidad de producto y dos modelos de ejecución nativos.
    ![C4 EVM y Stellar](./rendered/22-c4-multiecosistema-evm-stellar.svg)
23. [PaymentIntent con Stellar](./diagrams/23-secuencia-payment-intent-stellar.puml)
    — API neutral, simulación Stellar, reconciliación y webhook.
    ![PaymentIntent Stellar](./rendered/23-secuencia-payment-intent-stellar.svg)
24. [Decisión de rol de redes](./diagrams/24-decision-network-role-v3.puml)
    — EVM core, red por política y Stellar como adapter futuro.
    ![Decisión de rol de redes](./rendered/24-decision-network-role-v3.svg)
25. [Radar ERC/EIP V3](./diagrams/25-radar-eip-erc-v3.puml)
    — núcleo estable, adapters, pilotos y tecnologías fuera del core.
    ![Radar ERC/EIP](./rendered/25-radar-eip-erc-v3.svg)
26. [Threat model V3](./diagrams/26-threat-model-v3.puml)
    — trust boundaries, componentes comprometibles y autoridad económica.
    ![Threat model V3](./rendered/26-threat-model-v3.svg)

27. [Web y ambientes V3 revisión 2](./diagrams/27-web-ambientes-v3.puml)
    — Next.js, dos Workers, API y staging aislado.
    ![Web y ambientes](./rendered/27-web-ambientes-v3.svg)
28. [Modelo Accounts y Flow](./diagrams/28-accounts-flow-v3.puml)
    — owners, identidades, settlement y evidencia.
    ![Accounts y Flow](./rendered/28-accounts-flow-v3.svg)
29. [Entregas E0–E8](./diagrams/29-entregas-v3.puml)
    — camino crítico Consumer e independencia de Flow.
    ![Entregas](./rendered/29-entregas-v3.svg)

Las decisiones y fundamentos de esta corrección están en
[CORRECCIONES.md](./CORRECCIONES.md). El procedimiento operativo está en el
[runbook de cutover](../runbooks/payments-cutover.md); la producción histórica
debe pasar primero por el
[reemplazo semántico](../runbooks/payments-semantic-recut.md).
El corte histórico de autenticación está en el
[runbook de magic links](../runbooks/phase-3-app-magic-link-cutover.md); la
promoción vigente del modelo de llaves usa el
[runbook Passkey v2](../runbooks/phase-3-app-passkey-v2-cutover.md).

## Fronteras que no deben romperse

- App Backend puede llamar a Payments por un Service Binding versionado;
  Payments no llama a App.
- `/pay` y `/crosschain` son superficies App; sólo el pago de un link reservado
  cruza por RPC hacia Payments. El split nunca copia el CCTP personal.
- Cada Worker escribe únicamente su propia D1 y consume su propia Queue.
- Ningún deploy puede avanzar a doble escritura: los guards validan la máquina
  de estados y Payments vuelve a comprobar en D1 el checksum importado antes de
  HTTP/RPC mutante, Queue o Cron.
- Dashboard y la ruta Checkout llaman directamente a Payments para recursos de
  cobro; el proxy de App se conserva sólo durante la compatibilidad N-1.
- Un `PaymentIntent` expresa el resultado; quote, route, CCTP y UserOperation son
  pasos internos de ejecución.
- Estado y liquidación salen de evidencia on-chain reconciliada, no de lo que
  afirme el navegador.
- Un visitante sólo puede leer/registrar/cancelar su attempt con una capability
  aleatoria y prueba de la wallet cotizada. El hash no se persiste hasta que el
  backend verifica receipt, payer, router y evento.
- Cada transición económica y su evento/outbox se escriben atómicamente en
  Payments DB. No se simula una transacción entre dos D1.
- En Payments, el comercio recibe USDC de test en Arbitrum Sepolia durante el
  primer corte y Base/Fuji son redes de origen. Esa decisión B2B no define la
  identidad multichain de Account V3 ni autoriza cuentas satélite.
- `free-default` mantiene la comisión de plataforma en cero. El coste de red se
  registra aparte.

## Secretos sin jerga

Payments necesita dos claves blockchain y cuatro valores operativos:

| Grupo | Valores |
|---|---|
| Claves blockchain | Signer de autorizaciones (la dirección pública coincide con `wallet-0x75`) y relayer CCTP dedicado. |
| Acceso a infraestructura | RPC HTTPS por chain. |
| Protección de datos | Clave AES de webhooks y su identificador de rotación. |
| Operación | Token del healthcheck privado. |

No se copian a Payments las claves de usuarios, passkeys, guardian, OTP ni
paymaster de App. Los valores `VITE_*` son configuración pública de frontend, no
claves privadas.

## Alcance B2B de Fase 2.1

La promesa acotada es:

> Crear cobros por link, QR o API; aceptar USDC desde las redes soportadas;
> liquidar directamente en la cuenta del negocio; y reconciliar mediante
> dashboard, eventos y webhooks firmados.

No forman parte de 2.1: fiat/BOB, cualquier token, payroll, treasury automático,
subscriptions, splits, refunds automáticos, roles empresariales ni settlement
programable. Esos elementos aparecen en gris en casos de uso cuando sirven para
mostrar el siguiente límite, nunca como funcionalidad disponible.

## Renderizado

Los SVG se generan desde los `.puml`; no deben editarse manualmente. Java es
necesario. El script descarga una versión fijada de PlantUML a la carpeta
temporal, valida su SHA-256 y rechaza SVG que contengan mensajes de error:

```powershell
pnpm docs:architecture:render
pnpm docs:architecture:check
```
