# Arquitectura objetivo V3 de GatoPago

> **Snapshot de procedencia (2 de septiembre de 2026).** El diseño vigente y
> su orden de implementación están en [V3 FUSION revisión 2](./V3-FUSION.md).
> Este archivo conserva la fuente original; sus referencias a autoridad,
> prioridades, API futura y migración no prevalecen sobre la revisión 2.

**Fecha:** 2 de septiembre de 2026  
**Estado:** especificación canónica; no implementada ni desplegada  
**Decisión de entorno:** testnet es descartable. No se preserva compatibilidad con
las cuentas V1/V2 ni con el modelo `home/satellite` de Fase 4A.  
**Alcance:** contratos, App, Payments, B2C/B2B, redes EVM, activos, seguridad,
recuperación, comisiones, paymasters, operación y salida del usuario.

La extensión para desaparición de GatoPago, Stellar/Soroban y una API
multiecosistema está en
[`STELLAR-SOBERANIA-API-V3.md`](./STELLAR-SOBERANIA-API-V3.md).

Las decisiones cerradas y el threat model que bloquea la implementación están
en [`DECISIONES-BASE-V3.md`](./DECISIONES-BASE-V3.md) y
[`REVISION-SEGURIDAD-PRE-V3.md`](./REVISION-SEGURIDAD-PRE-V3.md). En caso de
ambigüedad, las decisiones base prevalecen sobre propuestas anteriores.

> Este documento reemplaza como arquitectura objetivo a
> [`app-multichain-phase-4a.md`](../design/app-multichain-phase-4a.md). No prueba
> que V3 exista. Ningún contrato, migración, Worker, frontend o configuración
> remota fue modificado por esta especificación.

## 1. Problema que corregimos

El candidato de Fase 4A intentaba agregar redes sin romper las cuentas de
testnet existentes. El resultado fue una identidad Firebase asociada a una
cuenta `home` y a cuentas `satellite` creadas por factories y generaciones de
contratos diferentes. Era operable, pero no era el modelo correcto para un
producto todavía descartable:

- la dirección podía cambiar entre redes;
- el usuario veía una "activación" como si estuviera creando otra wallet;
- backend y D1 no registraban con suficiente precisión factory,
  implementación, verifier, bytecode y generación;
- coexistían componentes onchain antiguos y nuevos dentro del camino activo;
- `account_version` podía significar revisión de destino, generación del
  contrato o versión de seguridad según el contexto;
- la compatibilidad temporal empezaba a parecer arquitectura permanente.

La corrección no consiste en agregar más condiciones al modelo anterior. Se
redefine el núcleo y, después, se reconstruyen las capacidades alrededor.

## 2. Principios no negociables

1. **Una persona ve una cuenta GatoPago.** La misma cuenta tiene la misma
   dirección en todas las EVM admitidas por el wallet rail.
2. **Misma dirección no significa mismo estado.** Cada red conserva balances,
   nonces, código desplegado, seguridad aplicada y transacciones propios.
3. **La cuenta es genérica.** No conoce USDC, Circle, Uniswap, comerciantes,
   fees, paymasters ni una red hogar.
4. **Capacidad no equivale a aceptación comercial.** La cuenta puede custodiar
   y mover activos EVM genéricos; Payments acepta sólo activos y rutas
   explícitamente aprobados.
5. **Todo proveedor es reemplazable.** RPC, bundler, paymaster, swap, bridge,
   indexador y correo viven detrás de puertos y adaptadores.
6. **GatoPago no es requisito para salir.** Con manifests públicos, RPC y gas,
   el propietario debe poder operar, recuperar o vaciar su cuenta sin nuestros
   Workers ni secretos.
7. **La seguridad de gasto es onchain.** Firebase identifica una sesión de
   producto; no controla fondos por sí solo.
8. **Compatibilidad con fecha de muerte.** Las ventanas N/N-1 sólo existen
   durante un rollout medido. Nunca definen la identidad de la cuenta.
9. **El estado económico se confirma con evidencia onchain.** Un navegador, un
   hash declarado o una cola no declaran por sí solos un pago final.
10. **Mainnet no hereda experimentos.** Una sola generación activa, bytecodes
    reproducibles, auditoría, simulacros de salida y gates duros preceden a
    cualquier despliegue productivo.

## 3. Modelo mental del producto

```text
Identidad de producto (Firebase UID)
              │
              ▼
Account Identity (accountId estable)
              │
              ▼
Dirección EVM determinística única: 0xABC...
              │
      ┌───────┼─────────┐
      ▼       ▼         ▼
 Arbitrum   Avalanche   otra EVM habilitada
 instancia  instancia   instancia
 estado A   estado B    estado C
```

La dirección puede recibir fondos antes de tener código. Al primer gasto, una
UserOperation despliega de forma contrafactual la instancia de esa misma cuenta
y ejecuta la acción. La UI puede decir **"Recibir en Avalanche"**, pero nunca
**"Crear otra cuenta en Avalanche"**.

Una red sólo entra al wallet rail si puede reproducir exactamente el stack
canónico y demostrar la misma dirección. Si no puede, puede aparecer como
lectura externa o quedar fuera de soporte; no obtiene una dirección alternativa.

### 3.1 Ecosistemas no EVM

La igualdad de dirección sólo pertenece al grupo EVM. Un mismo `accountId` de
producto puede tener una instancia nativa en otro ecosistema, pero no se fuerza
el formato ni el contrato EVM:

```text
Account Identity
├─ EVM Account Group -> misma dirección 0x... por EVM habilitada
└─ Stellar Account Instance -> contract account C... nativa de Stellar
```

Intent, recovery policy y UX pueden compartir conceptos; addresses,
serialización, firmas, fees, finality y evidencia permanecen nativos.
`defaultNetworkId` es sólo una preferencia mutable de onboarding/settlement.
Para V3.0, EVM es el núcleo y Base es la candidata inicial a esa preferencia si
supera el capability gate. Stellar queda como adapter futuro: no es la cuenta
principal, no bloquea V3 y no concede a una instancia autoridad sobre otra.

## 4. Account V3: núcleo onchain

### 4.1 Responsabilidades mínimas

`GatoPagoAccountV3` debe contener únicamente:

- validación ERC-4337 de UserOperations;
- validación de firmas de contrato ERC-1271;
- ejecución genérica `CALL` individual y por lote;
- recepción segura de activo nativo, ERC-721 y ERC-1155;
- introspección de interfaces;
- administración de validadores y recuperación;
- actualización de implementación autorizada por el propio usuario;
- storage namespaced para evitar colisiones entre versiones/módulos.

No debe contener routing, swaps, CCTP, token lists, cálculo comercial de fees,
patrocinio de gas, merchants, settlement ni lógica específica de una cadena.

### 4.2 Dirección determinística universal

Cada chain habilitada debe tener en las **mismas direcciones** y con los
**mismos runtime codehashes**:

1. bootstrap deployer canónico;
2. verifier(s) canónicos;
3. implementación canónica de Account V3;
4. `AccountFactoryV3` canónica.

La dirección se deriva de:

```text
initialSecurityCommitment = hash(validadores iniciales + threshold + recovery)
accountId = hash(generation, initialSecurityCommitment, userSaltCommitment)

accountAddress = CREATE2(
  canonicalFactory,
  accountId,
  hash(constant ERC1967 proxy creation code)
)
```

El creation code del proxy es constante: apunta a la misma implementación y no
incluye parámetros variables. La factory despliega e inicializa atómicamente.
Si la inicialización o la prueba del manifest falla, revierte toda la
transacción. El manifest comprometido impide que un tercero inicialice la
dirección con llaves diferentes.

`createAccount(accountId, initialManifest, proof)`:

- comprueba que `initialManifest` produce el commitment del `accountId`;
- valida la prueba de control de los validadores iniciales;
- acepta creación contrafactual sólo por la ruta permitida por el EntryPoint
  soportado (`senderCreator` en la especificación ERC-4337 vigente);
- despliega proxy e inicializa en una sola transacción;
- devuelve la cuenta existente si código y manifest coinciden;
- falla cerrado si address, codehash o generación no coinciden.

`userSalt`, `initialSecurityCommitment`, `accountId` y dirección predicha se
calculan y verifican también en el cliente. Firebase UID, correo, username y
otros PII nunca forman parte del salt ni se publican onchain. El Worker puede
recalcular y almacenar, pero no elegir silenciosamente otra identidad.

Que un tercero despliegue **la configuración exacta y autorizada** antes que el
usuario no le entrega control y es aceptable. Nunca se permite inicialización
posterior sin compromiso criptográfico.

### 4.3 Actualizaciones y módulos

La decisión de V3.0 es un proxy ERC-1967/UUPS controlado por la propia cuenta,
con storage ERC-7201. No existe un admin, beacon o clave de GatoPago que pueda
actualizar todas las cuentas. La autoridad `admin` es diferente de `spend`,
exige al menos dos factores independientes, un timelock inicial de 72 horas y
permite veto por cualquier signer/guardian vigente.

Una actualización requiere el threshold de seguridad vigente y un
`UpgradeManifest` que fije implementación, runtime codehash, generación,
storage-layout hash, chain scope, validez y versión anterior. Cada chain aplica
el mismo manifest de manera independiente y verificable.

Validadores previstos:

- P-256/WebAuthn mediante verifier compatible con ERC-7913;
- ECDSA/secp256k1 para una wallet externa;
- ERC-1271 para multisig o smart wallet externa;
- guardian/recovery threshold;
- más adelante, permisos de sesión o capabilities limitadas.

Todo verifier ERC-7913 promovido es stateless, no upgradeable y sin autoridad
administrativa. Su address, runtime codehash, formato de key y curva quedan
fijados por manifest. Una registry o backend no puede cambiarlo en runtime.

V3.0 no instala módulos, hooks arbitrarios ni ejecuta `DELEGATECALL` desde la
superficie normal. ERC-7579, ERC-6900 y ERC-7821 siguen fuera del release porque
su semántica y poder ampliarían la auditoría antes de existir un caso de uso.
Sólo se prototipan en un laboratorio aislado y una ADR futura podrá promoverlos
después de implementación madura, conformance y auditoría.

El inventario completo, sus estados y los gates de adopción viven en el
[Radar ERC/EIP de Account V3](./RADAR-EIP-ERC-V3.md). El inventario inicial son
14 perfiles base —incluido UUPS ya decidido y P-256 modelado por capability— y
6 adapters esenciales. Los 20 perfiles no son funciones independientes ni 20
contratos; cada uno debe tener conformance demostrada.

Por defecto:

- ejecución genérica usa `CALL`;
- `DELEGATECALL`, módulos y hooks instalables están ausentes en V3.0;
- recovery no puede actualizar implementación ni transferir fondos en la misma
  transición;
- el usuario puede congelar upgrades irreversiblemente en modo avanzado;
- cualquier modularidad futura preserva una ruta core no interceptable para
  cancelar, recuperar, congelar y salir.

## 5. Registro canónico de chains y deployments

`shared/networks.ts` deja de ser una lista manual de direcciones. Se genera a
partir de manifests versionados y verificables.

### 5.1 Chain Capability Registry

Cada chain se identifica con CAIP-2 (`eip155:<chainId>`) y declara:

- nombre, finality, política de reorg, sequencer/forced inclusion y riesgos de
  upgrade/gobernanza del protocolo;
- EVM fork, opcodes, precompiles P-256, límites de code/initcode y gas;
- RPC por rol y proveedores independientes;
- EntryPoint version/address/runtime codehash;
- manifest del stack Account V3;
- bundlers y adaptadores de paymaster;
- activos nativos y explorers;
- capacidades de swap, bridge y CCTP;
- estado `read_only`, `wallet_candidate`, `wallet_enabled` o `retired`.

Promover una chain a `wallet_enabled` exige:

- factory, implementation y verifiers en direcciones canónicas;
- runtime codehashes idénticos al manifest;
- predicción de la misma cuenta para fixtures comunes;
- prueba de deploy contrafactual + primera ejecución;
- prueba de recuperación y salida sin servicios GatoPago;
- RPC, bundler y self-funded fallback funcionales;
- finality/reorg policy y monitoreo configurados.

### 5.2 Deployment Manifest

Cada artefacto onchain registra:

```text
manifestId, generation, chainId, component,
address, deployer, salt, creationCodeHash, runtimeCodehash,
ABI hash, compiler + optimizer, dependency lock,
source commit, storageLayoutHash, verification URL,
deployedAt, lifecycleStatus
```

Las direcciones de frontend/backend se generan desde manifests aceptados. El
pipeline rechaza valores escritos a mano o artefactos sin codehash comprobado.

## 6. Activos EVM: capacidad amplia, confianza explícita

La cuenta V3 puede recibir y ejecutar llamadas sobre activo nativo, ERC-20,
ERC-721, ERC-1155 y contratos EVM genéricos. Esto no significa que cualquier
contrato se muestre como dinero confiable ni que Payments lo acepte.

Los activos usan identificadores CAIP-19 para evitar colisiones:

```text
eip155:421614/slip44:60
eip155:421614/erc20:0x...
eip155:43113/erc721:0x.../123
```

El Asset Registry asigna tiers:

| Tier | Comportamiento |
|---|---|
| `trusted` | UX completa, precios/routing permitidos y metadata verificada. |
| `discovered` | Visible con red y advertencias; sin asumir valor o compatibilidad. |
| `custom` | Importación avanzada por contrato y chain. |
| `blocked/spam` | Oculto o en cuarentena; nunca activa una acción automática. |

Reglas de seguridad:

- nunca confiar en `symbol`, `name` o `decimals` devueltos por el token;
- detectar interfaces y codehash sólo como señales, no como prueba de bondad;
- usar transferencias seguras y medir balance antes/después en routers;
- tratar fee-on-transfer, rebasing y retornos no estándar explícitamente;
- no valorar ni autoejecutar tokens desconocidos;
- callbacks de tokens/NFT no pueden instalar módulos ni alterar autorización;
- approvals y permits tienen límites, expiración y destinatario visible.

La UX sigue siendo **assets first, chains second**, pero conserva siempre la
procedencia. Puede sumar una vista fiat estimada; no finge que fondos
fragmentados constituyen liquidez inmediatamente gastable en una sola chain.

## 7. Intent, routing, fees y paymasters

### 7.1 Intent Engine fuera de la cuenta

Un intent expresa el resultado:

```text
recipient + asset + amount + destination chain
+ max total cost + max slippage + deadline + policy
```

Quote y Execution Plan resuelven pasos concretos mediante adapters:

```text
source -> approval -> swap -> bridge/CCTP -> settlement -> receipt
```

Cada quote congela adapter, contratos, chain IDs, cantidades, slippage, fee,
expiración y riesgos. La cuenta sólo autoriza calls explícitas; no confía en la
intención textual.

La passkey estándar no tiene un display confiable del calldata: un frontend
comprometido puede mentir en el texto aunque el digest sea correcto. CSP,
simulación y supply-chain hardening reducen ese riesgo; operaciones admin,
recovery, upgrades y límites altos requieren factor independiente, timelock o
veto. No se presenta el preview web como hardware clear signing.

### 7.2 Fees comerciales separados del gas

La política por defecto continúa siendo comisión GatoPago cero. La arquitectura
admite cobrar en el futuro sin cambiar la cuenta:

- `NetworkCost`: gas/bridge/liquidity observado o estimado;
- `PlatformFeePolicy`: versión, base, porcentaje, mínimo, máximo y beneficiario;
- `MerchantPricingPolicy`: acuerdo B2B separado;
- snapshot inmutable de la política en quote/intent/attempt;
- límites máximos autorizados por el usuario;
- recibo separa principal, gas, bridge/slippage y comisión comercial.

Ninguna implementación de cuenta contiene un porcentaje o fee collector.

### 7.3 Paymaster reemplazable

```text
SponsorshipPolicy -> PaymasterPort -> Adapter
                                  ├─ GatoPago
                                  ├─ ERC-7677
                                  ├─ proveedor externo
                                  └─ self-funded
```

Cambiar paymaster obliga a recalcular gas/paymaster data y simular antes de que
el usuario firme; nunca reusa una firma para otra política. Si el patrocinio
falla, la UX puede ofrecer self-funded o un adapter alternativo. Address,
validadores y recuperación de la cuenta no dependen del paymaster.

## 8. Fronteras App, Payments, B2C y B2B

Se mantienen **dos backends de dominio**, no uno por frontend:

| Deployable | Propiedad | No posee |
|---|---|---|
| App Worker | identidad de producto, Account Identity, security manifests, portfolio, operaciones personales, indexación | merchants, links, settlement, webhooks |
| Payments Worker | merchants, API keys, links, intents, quotes, attempts, routing de cobro, settlement, outbox/webhooks | passkeys privadas, perfil App, App D1 |

App Web consume App y, para checkout, Payments. Dashboard consume Payments y
usa App/Firebase sólo para autenticación. Checkout es un cliente público, no un
backend. App puede invocar Payments por Service Binding versionado; Payments no
depende de App y verifica su propia autorización.

No se crea un tercer Worker preventivamente. Dentro de App, `ChainExecution`
es un componente lógico con Queue y Durable Object. Sólo se extrae detrás de un
Service Binding si métricas demuestran aislamiento necesario de CPU,
subrequests, secretos, disponibilidad o cadencia de despliegue.

Cada Worker:

- escribe únicamente su D1;
- consume únicamente sus Queues;
- no conserva Promises RPC entre requests globales;
- usa Queue para reconciliación y Durable Object sólo para coordinación que
  exige serialización, por ejemplo `(chainId, relayer)`;
- modela operaciones como `prepared -> submitted -> confirmed`, con estados
  explícitos `failed`, `expired` y `needs_review`;
- consulta receipts únicamente para operaciones realmente `submitted`;
- aplica idempotencia y outbox atómica en su propio dominio.

La compatibilidad App→Payments admite N/N-1 sólo durante un rollout con fecha,
telemetría y borrado programado. El runtime limpio de testnet no conserva los
runners históricos de Payments dentro de App.

Payments no conoce generaciones internas de la cuenta del comercio. Congela
una `SettlementDestination`:

```text
address + chainId + assetId + destinationRevision
```

`settlement_account_version` se renombra a
`settlement_destination_revision`. Un attempt congela además router address,
router generation y política económica.

La destination/revision se registra con prueba del merchant (firma de su smart
account/wallet o ceremonia B2B de step-up), no sólo con autoridad del route
signer. Cambiarla emite aviso, invalida quotes pendientes y puede usar timelock.
El signer de routing nunca puede redirigir settlement fuera de la revisión
autorizada por el merchant.

## 9. Modelo de datos objetivo

### App D1

```text
account_identities(
  uid, account_id, generation, initial_security_commitment,
  user_salt_commitment, created_at
)

account_instances(
  account_id, chain_id, address, generation, deployment_manifest_id,
  deployment_state, implementation_address, implementation_codehash,
  security_version, created_at, deployed_at, updated_at
)

security_manifests(
  account_id, version, previous_hash, payload_hash, chain_scope_hash,
  signed_payload, status, created_at
)

contract_deployments(
  manifest_id, generation, chain_id, component, address,
  creation_code_hash, runtime_codehash, abi_hash, compiler,
  storage_layout_hash, salt, source_commit, lifecycle_status, verified_at
)

account_operations(
  id, account_id, chain_id, idempotency_key, operation_type, state,
  userop_hash, tx_hash, first_error, last_error, attempts,
  prepared_at, submitted_at, confirmed_at, updated_at
)

asset_registry(
  asset_id, chain_id, asset_standard, contract_address,
  trust_tier, metadata_source, capability_flags, updated_at
)
```

`account_instances` no crea identidades distintas: registra el estado de la
misma dirección en cada chain. `deployment_state` puede ser `counterfactual`,
`deploying`, `active`, `needs_security_sync`, `unsupported` o `retired`.

### Payments D1

PaymentIntent conserva resultado económico y `SettlementDestination`.
PaymentAttempt conserva payer, source chain/asset, quote/policy, router
generation, capability, hashes y evidencia de reconciliación. Ninguna tabla
referencia con foreign key la App D1.

## 10. Seguridad y recuperación multichain

### 10.1 Security Manifest

La configuración se expresa como una cadena de manifests:

```text
accountId, generation, securityVersion, previousManifestHash,
validator set + threshold, recovery set + threshold + timelock,
explicit chain scope, validAfter, validUntil, nonce, signatures
```

El backend puede almacenar y retransmitir el payload, pero no puede modificarlo.
Cada instancia acepta sólo la siguiente versión cuyo `previousManifestHash`
coincida. Un cambio aplicado en una chain y pendiente en otra se muestra como
`needs_security_sync`; App y Payments fallan cerrado para nuevas operaciones en
la chain atrasada. Onchain, sin embargo, su manifest anterior continúa vigente
hasta que se confirme el nuevo: no existe atomicidad entre chains sin una raíz o
mensajería de confianza.

Los cambios planificados usan `prepare` en todas las instancias desplegadas y
`commit` sólo después de acknowledgements/finality. Una emergencia transmite
freeze/recovery por relayers y RPC independientes a todas las chains; una chain
caída conserva riesgo residual y se declara al usuario. V3 no describe esa
ventana como seguridad sincronizada.

Las firmas normales de UserOperation continúan ligadas a chain ID y EntryPoint,
como exige ERC-4337. Para propagar seguridad puede existir un mensaje distinto,
deliberadamente multichain, cuyo scope enumera las chains autorizadas. Su replay
en esas chains es la función esperada; fuera de ellas falla. Este esquema exige
especificación formal, fuzz/invariants y auditoría antes de mainnet. Hasta
entonces se usan autorizaciones por chain.

### 10.2 Factores de recuperación

Orden recomendado:

1. dos o más passkeys en proveedores/dispositivos distintos;
2. llave física FIDO2;
3. wallet ECDSA o multisig ERC-1271 externa;
4. guardians sociales con threshold;
5. recuperación asistida por GatoPago, opcional y nunca suficiente por sí sola.

Una cuenta creada con una sola passkey permanece `BOOTSTRAP`: puede añadir y
probar el factor independiente, pero no puede ejecutar upgrades, instalar
permisos ni acceder a adapters de alto riesgo. La promoción a `ACTIVE` prueba el
signer nuevo y fija thresholds `spend/admin/recovery` en una sola transición.

Correo, Google/Firebase o soporte al cliente no cambian inmediatamente las
llaves onchain. Una recuperación asistida sólo propone un Security Manifest:

- espera configurable, inicialmente 48 horas;
- aviso por todos los canales disponibles;
- cancelación por cualquier signer o guardian vigente;
- sin movimiento de fondos durante la espera;
- activación independiente en cada chain;
- ninguna clave única de GatoPago puede aprobar recuperación o upgrade.

La recuperación debe funcionar aunque una chain esté temporalmente caída. Las
chains pendientes quedan visibles y el usuario puede retomar el relaying sin
reiniciar la recuperación completa.

### 10.3 Si GatoPago desaparece

Una passkey adicional bajo el mismo RP ID mejora disponibilidad entre
dispositivos, pero no garantiza continuidad si desaparecen el dominio y los
servicios de GatoPago. Antes de declarar una cuenta "completamente respaldada"
debe existir al menos un control independiente: signer ECDSA/Ed25519, multisig
externa o guardians sin dependencia de GatoPago.

El emergency client y los manifests deben ser públicos y reproducibles. La
prueba de aceptación apaga Firebase, Workers, paymaster, bundler y dominios de
GatoPago. El detalle operativo y comercial está en
[`STELLAR-SOBERANIA-API-V3.md`](./STELLAR-SOBERANIA-API-V3.md).

## 11. Exportar o sacar la cuenta de GatoPago

Esta evaluación ocurre **después** de definir la cuenta, porque "exportar" puede
significar cuatro cosas diferentes.

### 11.1 Exportar la clave privada de una passkey

No es una promesa válida. La clave privada WebAuthn pertenece al authenticator o
gestor del sistema y se diseña para no ser expuesta, incluso al propietario.
GatoPago nunca la recibe y, por tanto, no puede descargarla.

FIDO trabaja en Credential Exchange para transferencias entre gestores, pero la
disponibilidad depende de cada proveedor y no convierte a GatoPago en custodio
de la clave. La arquitectura no debe depender de que esa exportación exista.

### 11.2 Portable Account Package

GatoPago sí debe permitir descargar un paquete JSON versionado con:

- schema, generation y accountId;
- dirección EVM universal e instancia Stellar `C...` cuando exista;
- networks y estado de despliegue;
- EntryPoint, factory, implementation, verifiers y runtime codehashes;
- manifest inicial y cadena de Security Manifests firmados;
- descriptores y claves **públicas** de passkeys;
- guardians, recovery policy, módulos y upgrade policy;
- snapshot no autoritativo de activos;
- instrucciones y checksums para un cliente/CLI abierto.

No contiene claves privadas, tokens Firebase, API keys, secretos de recovery ni
secrets operativos. Puede cifrarse y firmarse del lado del cliente para
transporte, pero siempre debe existir una exportación verificable y legible.

### 11.3 Transferir el control sin mover la cuenta

Flujo de salida recomendado:

1. agregar ECDSA, otra passkey o multisig ERC-1271 independiente;
2. demostrar que el nuevo validator firma una operación self-funded;
3. retirar guardian asistido y validadores dependientes de GatoPago si existen;
4. opcionalmente actualizar a una implementación independiente auditada;
5. opcionalmente congelar upgrades de manera irreversible en modo avanzado;
6. descargar el Portable Account Package;
7. revocar sesiones y borrar el perfil offchain sólo después de verificar todas
   las chains desplegadas.

La misma smart account y su dirección siguen existiendo. Un wallet de terceros
puede no reconocer inmediatamente validadores propios de GatoPago. Por eso la
salida fuerte es control ECDSA/ERC-1271 + manifests públicos + tooling abierto,
no una promesa de importación mágica en cualquier UI.

### 11.4 Vaciar y cerrar

Como alternativa, el usuario puede barrer a una wallet externa:

- activo nativo dejando gas suficiente;
- ERC-20, ERC-721 y ERC-1155 conocidos;
- revocación de allowances, permits, sesiones y delegaciones;
- reporte de tokens desconocidos que requieren acción manual;
- cierre del perfil offchain después de confirmaciones y finality.

### 11.5 Prueba de aceptación de salida

La portabilidad no está terminada hasta ejecutar un simulacro destructivo:

1. deshabilitar App API, paymaster y bundler de GatoPago;
2. usar sólo el paquete exportado, tooling público y RPC/bundler externos o gas
   propio;
3. firmar y transferir en todas las chains desplegadas;
4. aplicar recuperación sin un secreto de GatoPago;
5. retirar cualquier capacidad de asistencia;
6. demostrar que GatoPago no puede impedir ni revertir las operaciones.

Se debe publicar un emergency client/CLI reproducible. Sin él, la afirmación
"puedes sacar tu cuenta" sería sólo teórica.

## 12. Corte limpio de testnet

El cambio a V3 no migra las cuentas existentes. Procedimiento objetivo:

1. congelar nuevas capacidades de Fase 4A;
2. marcar V1/V2, Base antigua, Arbitrum anterior y Fuji 4A como `historical`;
3. eliminar del runtime activo factories, verifiers, paymasters y ramas de
   compatibilidad antiguas;
4. desplegar Account V3 canónico en Base Sepolia, Arbitrum Sepolia y Fuji con
   iguales addresses/codehashes; Monad entra sólo después de superar el mismo
   capability gate;
5. crear App D1 limpia con el modelo V3;
6. recrear usuarios de prueba y, si se desea, barrer activos de testnet;
7. desplegar App sólo cuando predicción, recepción contrafactual, primer gasto,
   recovery y salida pasen en toda la matriz habilitada;
8. integrar Payments después mediante `SettlementDestination`, sin conocer la
   generación interna de la cuenta.

No se mantiene lookup de cuentas V1/V2, traducción de direcciones ni fallback
silencioso. La evidencia histórica queda en Git/manifests archivados, fuera del
camino ejecutable.

## 13. Política de versiones y releases

Antes de mainnet debe existir una sola generación activa. El pipeline bloquea
un release si:

- un wallet rail tiene factory/implementation/verifier diferentes;
- un runtime codehash no coincide;
- el mismo `accountId` predice direcciones distintas;
- D1 registra otra generación o manifest;
- un componente `retired` aparece en una operación nueva;
- cambió compiler, dependencia, init code o storage sin manifest/ADR;
- no pasaron storage diff, fuzz, invariants, fork y salida destructiva.

Migraciones futuras en mainnet:

- Account: upgrade explícito aprobado por cada usuario; nunca sustitución
  silenciosa por backend.
- Router: dirección y generación nuevas; versión anterior sólo drena intentos
  existentes y luego se retira.
- Datos: expand/contract con lecturas/escrituras acotadas y rollback probado.
- RPC interno: N/N-1 por una ventana con deadline y telemetría; luego se borra.
- Proveedores: adapter nuevo, canary y fallback; no cambia identidad onchain.

## 14. Plan de implementación

| Etapa | Resultado | Gate de salida |
|---|---|---|
| 0. Congelar | Fase 4A declarada reemplazada; decisiones base cerradas | nadie implementa `home/satellite` |
| 1. Especificar V3 | contratos, manifests, threat model y storage | Gate A de seguridad + revisión independiente |
| 2. Stack canónico | mismas direcciones en Base/Arb Sepolia/Fuji | source y runtime codehash verificados |
| 3. Reset App | D1 V3 y usuarios nuevos | counterfactual receive + first spend |
| 4. Seguridad | múltiples validadores, sync y recovery | lifecycle real en dos dispositivos/chains |
| 5. Activos | native/ERC20/ERC721/ERC1155 y registry | tokens hostiles/no estándar probados |
| 6. Ejecución | bundler/paymaster adapters + self-funded | caída de proveedor no bloquea salida |
| 7. Payments | SettlementDestination e intents | pagos locales/cross-chain reconciliados |
| 8. Portabilidad | export package + emergency client | simulacro sin infraestructura GatoPago |
| 9. Assurance | fuzz, invariants, fork, load y auditoría | hallazgos críticos/altos cerrados |
| 10. Mainnet | decisión separada | autorización explícita y checklist completo |

## 15. Decisiones y especificaciones obligatorias antes de código

Las decisiones de arquitectura están cerradas en
[`DECISIONES-BASE-V3.md`](./DECISIONES-BASE-V3.md): EVM core, red por política,
dirección determinística, UUPS mínimo sin módulos, autoridades separadas,
continuidad independiente, proveedores reemplazables, dos backends, firma del
plan final, assets/DeFi fuera del core y salida verificable.

Antes del contrato definitivo todavía deben congelarse como especificaciones
ejecutables:

1. encoding exacto de `accountId`, Initial Security Manifest y proof;
2. structs, nonces y transiciones `spend/admin/recovery`;
3. `UpgradeManifest`, timelock, veto y `freezeUpgrades` irreversible;
4. bootstrap deployer y manifest reproducible por chain;
5. chain scope de Security Manifest y conducta ante sync parcial;
6. Asset Registry, token quarantine y política de metadata;
7. formato del Portable Account Package y emergency client;
8. `ExecutionIntent`/`ExecutionPlan`, digest UI/TypeScript/Solidity y `useMax`;
9. finality/reorg policy por chain y evidencia económica;
10. threat properties e invariants del
    [Gate A](./REVISION-SEGURIDAD-PRE-V3.md#gate-a--antes-de-escribir-account-v3-definitivo).

## 16. Riesgos que el diseño no oculta

- misma dirección exige poder reproducir el deployer y todo el init code en cada
  chain; una EVM incompatible queda fuera del wallet rail;
- estado de seguridad separado por chain puede quedar desincronizado;
- módulos y upgrades amplían superficie de ataque;
- activos arbitrarios pueden mentir, reentrar, cambiar balances o ser spam;
- ERC-7579/6900/7821 todavía pueden cambiar;
- una passkey no ofrece exportación directa de su clave privada;
- un wallet de terceros puede no ofrecer UI para nuestros validadores;
- recovery multichain y salida deben probarse, no sólo documentarse;
- el diseño amplio no elimina compliance, liquidez ni riesgo de contraparte de
  los rails comerciales.

## 17. Fuentes normativas y operativas

- [ERC-4337: Account Abstraction Using Alt Mempool](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-1271: Standard Signature Validation Method](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-7913: Signature Verification for Verifiers](https://eips.ethereum.org/EIPS/eip-7913)
- [EIP-7951: Precompile for secp256r1 Curve Support](https://eips.ethereum.org/EIPS/eip-7951)
- [ERC-6492: Signature Validation for Predeploy Contracts](https://eips.ethereum.org/EIPS/eip-6492)
- [ERC-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [ERC-7201: Namespaced Storage Layout](https://eips.ethereum.org/EIPS/eip-7201)
- [CREATE2 / EIP-1014](https://eips.ethereum.org/EIPS/eip-1014)
- [ERC-7579: Minimal Modular Smart Accounts](https://eips.ethereum.org/EIPS/eip-7579)
- [ERC-6900: Modular Smart Contract Accounts](https://eips.ethereum.org/EIPS/eip-6900)
- [ERC-7821: Minimal Batch Executor](https://eips.ethereum.org/EIPS/eip-7821)
- [ERC-7677: Paymaster Web Service Capability](https://eips.ethereum.org/EIPS/eip-7677)
- [CAIP-19: Asset Type and Asset ID](https://standards.chainagnostic.org/CAIPs/caip-19)
- [WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/)
- [FIDO Credential Exchange Specifications](https://fidoalliance.org/download-credential-exchange-specifications/)
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

## 18. Diagramas asociados

- [C4 objetivo V3](./diagrams/15-c4-arquitectura-objetivo-v3.puml)
- [Creación determinística](./diagrams/16-secuencia-cuenta-deterministica-v3.puml)
- [Recuperación multichain](./diagrams/17-secuencia-recuperacion-multichain-v3.puml)
- [Salida portable](./diagrams/18-secuencia-salida-portable-v3.puml)
- [Despliegue canónico EVM](./diagrams/19-despliegue-canonico-evm-v3.puml)
- [Activos e intents](./diagrams/20-actividad-activos-intents-v3.puml)
- [Soberanía, Stellar y API multirail](./STELLAR-SOBERANIA-API-V3.md)
- [Decisiones base V3](./DECISIONES-BASE-V3.md)
- [Revisión de seguridad pre-V3](./REVISION-SEGURIDAD-PRE-V3.md)
- [Radar ERC/EIP de Account V3](./RADAR-EIP-ERC-V3.md)
- [Decisión de rol de redes](./diagrams/24-decision-network-role-v3.puml)
- [Radar ERC/EIP](./diagrams/25-radar-eip-erc-v3.puml)
- [Threat model V3](./diagrams/26-threat-model-v3.puml)
