# Decisiones base de arquitectura V3

> **Snapshot de procedencia (2 de septiembre de 2026).** El diseño vigente y
> su orden de implementación están en [V3 FUSION revisión 2](./V3-FUSION.md).
> Este archivo conserva la fuente original; sus referencias a autoridad,
> prioridades, API futura y migración no prevalecen sobre la revisión 2.

**Fecha:** 2 de septiembre de 2026  
**Estado:** decisiones canónicas previas a implementación  
**Alcance:** Account V3, App, Payments, EVM, recuperación, proveedores, salida y
extensiones futuras.  
**No implica:** contrato desplegado, migración, cambio de secrets ni aprobación
de mainnet.

Este documento cierra las ambigüedades que impedirían implementar V3 de forma
segura. Si otro diseño contradice una decisión de esta lista, debe abrir una
ADR nueva, demostrar el beneficio y repetir threat model, pruebas y revisión.

## ADR-001 — EVM es el núcleo; la red principal es política

**Decisión:** Account V3 es EVM. Base es la candidata inicial para onboarding y
settlement de la App, condicionada a superar el mismo capability gate que las
demás redes. Arbitrum, Avalanche y Monad son rails independientes, no cuentas
distintas ni raíces de ownership. Stellar queda como adapter futuro y no
bloquea V3.

**Razón:** EVM ofrece el modelo de smart account, tooling y composición que ya
usa GatoPago. Elegir una chain como raíz criptográfica volvería frágiles la
identidad, recuperación y API. La preferencia comercial debe poder cambiar sin
migrar la cuenta.

**Consecuencias:**

- `accountId` y el compromiso de seguridad definen la identidad;
- `defaultNetworkId` sólo ordena UX y rutas sugeridas;
- no existe `home chain` ni autoridad de una chain sobre otra;
- una red se habilita únicamente si replica el stack canónico y pasa el gate;
- ninguna frase comercial promete soporte por el mero hecho de ser EVM.

## ADR-002 — Un grupo EVM, una dirección, estados separados

**Decisión:** el mismo `accountId` predice la misma dirección en cada EVM
habilitada. Factory, proxy creation code, implementación inicial y verifiers
tienen address y runtime codehash canónicos. Balances, nonces, despliegue y
versión de seguridad continúan siendo estado local de cada chain.

**Razón:** evita el modelo `home/satellite`, direcciones sorpresivas y lógica de
compatibilidad permanente, sin fingir que las chains comparten estado.

**Consecuencias:**

- recibir en otra EVM nunca crea “otra wallet”;
- el primer gasto puede desplegar contrafactualmente la instancia;
- una divergencia de codehash o dirección bloquea la promoción de la chain;
- los cambios de seguridad se sincronizan explícitamente y nunca por magia.

## ADR-003 — UUPS mínimo y controlado por el usuario; sin módulos en V3.0

**Decisión:** V3.0 usa proxy ERC-1967/UUPS con una implementación pequeña,
storage ERC-7201 y upgrades autorizados onchain por el usuario. No habrá admin,
beacon, clave de GatoPago, instalación de módulos, hooks arbitrarios ni
`DELEGATECALL` desde la superficie normal.

**Razón:** un shell totalmente inmutable reduce superficie, pero obliga a
migrar dirección y activos ante un defecto corregible. UUPS preserva dirección
sin entregar una puerta maestra a GatoPago. Los módulos Draft multiplicarían
selectores, storage, revisión y escenarios de brick antes de necesitarlos.

**Controles obligatorios:**

1. autoridad de upgrade separada de la firma cotidiana;
2. threshold administrativo de al menos dos factores independientes;
3. timelock inicial de 72 horas y cancelación por cualquier signer/guardian
   vigente;
4. `UpgradeManifest` con implementación, codehash, storage-layout hash,
   generación, chain scope, expiración y predecessor;
5. simulación, storage diff, bytecode reproducible y auditoría de la versión;
6. opción avanzada e irreversible de congelar upgrades;
7. recovery no puede ejecutar un upgrade en el mismo paso en que reemplaza
   signers.

ERC-7579/6900/7821 se mantienen en laboratorio aislado. Adoptarlos requerirá
otra ADR y no podrá cambiar la ruta de recovery o salida del core.

## ADR-004 — Separar gastar, administrar y recuperar

**Decisión:** la cuenta tiene tres autoridades con nonces y políticas
independientes:

- **spend:** pagos y llamadas acotadas;
- **admin:** signers, thresholds, upgrades y freeze;
- **recovery:** propone una nueva política tras timelock, pero no mueve fondos.

Una sesión Firebase, correo, soporte, Worker, relayer, bundler, paymaster o RPC
no pertenece a ninguna autoridad onchain.

**Razón:** robar una sesión o comprometer un servicio no debe equivaler a
controlar fondos. Usar la misma firma diaria para upgrades amplía demasiado el
impacto de phishing o pérdida de dispositivo.

**Consecuencias:**

- la App puede iniciar y explicar una ceremonia; la cuenta decide;
- no existe `guardian` único capaz de reemplazar todos los signers;
- la asistencia de GatoPago, si se ofrece, es como máximo un voto de un
  threshold y es opcional;
- cualquier cambio de seguridad produce evidencia onchain y estado por chain.

**Bootstrap seguro:** una cuenta recién creada con una sola passkey permanece
en estado `BOOTSTRAP`. Puede recibir y añadir un factor independiente mediante
una transición que exige prueba de ambos signers, pero no puede actualizarse,
instalar permisos ni usar adapters de alto riesgo. Sólo al activar el manifest
endurecido pasa a `ACTIVE` con autoridades separadas. El producto muestra esta
limitación y no llama “respaldo completo” a una cuenta bootstrap.

## ADR-005 — Passkey cotidiana no equivale a continuidad soberana

**Decisión:** WebAuthn es la experiencia diaria, pero una cuenta sólo recibe el
estado comercial `sovereign_ready` después de registrar y probar al menos un
control independiente del RP ID de GatoPago: wallet ECDSA, multisig ERC-1271 o
guardian threshold externo.

**Razón:** la clave privada de una passkey no es exportable por GatoPago y su
uso depende del RP ID. Sin un factor independiente no se puede demostrar salida
si desaparecen dominio y frontend.

**Consecuencias:**

- una segunda passkey mejora disponibilidad, pero no satisface por sí sola el
  drill “GatoPago desaparece”;
- migrar `app.parmelia.me` a otro RP ID exige coexistencia, enrolamiento y
  prueba; DNS no migra credenciales;
- nunca se ejecutan Signal API, retirada o recovery al montar una pantalla;
- la prueba real es: registrar B, firmar con B, retirar A y volver a pagar con B.

## ADR-006 — Proveedores y claves operativas son reemplazables

**Decisión:** RPC, bundler, paymaster, indexador, bridge, swap y correo se
consumen por interfaces versionadas. Los signers operativos de mainnet viven en
KMS/MPC o un signer service de mínimo privilegio; no como private keys crudas en
variables de Workers.

**Razón:** cambiar un proveedor no debe migrar cuentas ni reautorizar políticas
permanentes. Una clave extraíble en un runtime conectado a Internet tiene un
radio de impacto innecesario.

**Consecuencias:**

- roles de deployer, sponsor, router authorization, relayer y recovery nunca
  comparten key en mainnet;
- cada adapter tiene timeout, circuit breaker, health, canary y fallback;
- cambiar paymaster reconstruye gas y `paymasterAndData` y obliga a firmar el
  UserOperation definitivo;
- siempre existe ruta self-funded para salida, aunque sea avanzada.

## ADR-007 — Dos backends de dominio, no una colección accidental de Workers

**Decisión:** App Worker y Payments Worker permanecen separados. App posee
identidad de producto, cuentas personales, portfolio y ceremonias. Payments
posee merchants, PaymentIntent, routing, settlement, webhooks y reconciliación.
Se comunican por Service Binding tipado cuando el flujo realmente cruza el
límite.

**Razón:** son dominios, datos y escalas distintas. Separarlos reduce blast
radius y permite escalar pagos sin convertir el Worker personal en PSP. Crear
un tercer Worker sólo se justifica con aislamiento de seguridad, ownership o
métricas de capacidad; las interfaces internas ya permiten extraerlo.

**Consecuencias:**

- cada Worker escribe una sola D1 y consume su propia Queue;
- no hay transacciones distribuidas entre D1;
- outbox/idempotencia modelan consistencia eventual;
- checkout y Dashboard hablan con Payments; la App habla con App;
- un BFF futuro compone vistas, pero no absorbe reglas económicas ni ownership
  de datos.

## ADR-008 — El usuario firma el resultado técnico definitivo

**Decisión:** quote, route, fee, paymaster y calldata se fijan antes de la firma.
La UI presenta resultado económico y riesgos; el digest liga chain, EntryPoint,
cuenta, targets, selectors, activos, montos máximos, fee máxima, nonce,
deadline y policy version.

**Razón:** una descripción humana que no está criptográficamente unida a lo que
se ejecuta permite substitution attacks. Reutilizar una firma tras cambiar de
proveedor o ruta rompe el consentimiento.

**Consecuencias:**

- toda mutación sensible se simula inmediatamente antes de firmar;
- `useMax` es una intención de primer nivel y resuelve balance/bloque/reserva de
  gas explícitos;
- no existen approvals ilimitados por defecto;
- un hash enviado por el navegador nunca declara settlement;
- receipt, emisor, router, evento, monto, finality y reorg guard se verifican.

WebAuthn confirma la clave y el RP ID, no presenta un trusted display del
calldata. Operaciones admin, recovery, upgrades y límites altos exigen factor
independiente, timelock/veto o ambos. Para Payments, la
`SettlementDestination` está aprobada por el merchant; el route signer no puede
elegir otra dirección.

## ADR-009 — Cuenta genérica; activos y DeFi fuera del core

**Decisión:** Account V3 sólo ejecuta llamadas genéricas autorizadas. El Asset
Registry clasifica activos como `trusted`, `limited`, `unknown` o `blocked`.
DeFi se habilitará después mediante adapters auditados con target/selector,
activo, monto, slippage y deadline acotados.

**Razón:** soportar EVM no significa confiar en todo token ni protocolo. Meter
DeFi, USDC, bridges o merchants en la cuenta vuelve permanente un riesgo de
producto cambiante.

**Consecuencias:**

- tokens desconocidos se muestran en cuarentena y no alteran balances
  comerciales ni disparan callbacks privilegiados;
- adapters usan `SafeERC20` y verifican deltas de balance cuando corresponde;
- fee-on-transfer, rebasing, retorno falso/sin retorno y callbacks tienen
  fixtures adversariales;
- Earn, lending y vaults son productos posteriores, no requisito de V3.0.

## ADR-010 — La salida independiente es una función, no una promesa

**Decisión:** antes de mainnet se publica un Portable Account Package y un
emergency client/CLI reproducible. Deben permitir comprobar manifests, usar un
signer independiente, financiar gas, ejecutar, recuperar, revocar permisos y
barrer activos sin Firebase, Workers, dominios, bundler ni paymaster de
GatoPago.

**Razón:** “los fondos son del usuario” sólo es defendible si existe un camino
operativo probado cuando GatoPago no coopera o desaparece.

**Consecuencias:**

- no se promete exportar la clave privada de una passkey;
- el paquete contiene únicamente información pública y verificable;
- el simulacro se repite por release y por cada chain habilitada;
- si el drill falla, marketing debe decir `self-custody asistida`, no
  `disappear-safe`.

## Decisiones que continúan fuera de V3.0

- Stellar/Soroban, CCTP con Stellar y una aplicación SCF;
- permisos agentic y sesiones ERC-7710/7715;
- modularidad ERC-7579/6900;
- intents ERC-7683 entre terceros;
- DeFi, ERC-4626/7540, earn y RWA;
- tarjetas, fiat rails, payroll y treasury automation.

La ausencia de estas capacidades no bloquea la cuenta personal. Cuando entren,
deberán respetar identidad, autoridad, consentimiento, evidencia y salida
definidos aquí.
