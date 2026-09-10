# Extensión futura — Soberanía, Stellar y API multirail

> **Snapshot de procedencia (2 de septiembre de 2026).** El diseño vigente y
> su orden de implementación están en [V3 FUSION revisión 2](./V3-FUSION.md).
> Este archivo conserva la fuente original; sus referencias a autoridad,
> prioridades, API futura y migración no prevalecen sobre la revisión 2.

**Fecha:** 2 de septiembre de 2026  
**Estado:** diseño futuro no bloqueante; no implementado ni desplegado  
**Precedencia:** complementa
[`ARQUITECTURA-OBJETIVO-V3.md`](./ARQUITECTURA-OBJETIVO-V3.md).  
**Alcance:** desaparición de GatoPago, recuperación independiente, integración
Stellar/Soroban, coste, SCF e impacto en API/B2B/B2B2C.

La decisión canónica actual es EVM core. Este documento preserva el diseño de
Stellar para una iteración posterior; no autoriza hacerlo cuenta principal ni
retrasa Account V3. Véase
[`DECISIONES-BASE-V3.md`](./DECISIONES-BASE-V3.md#adr-001--evm-es-el-núcleo-la-red-principal-es-política).

## 1. Qué significa realmente “los fondos son del cliente”

Hay tres afirmaciones diferentes:

1. **Propiedad onchain:** los activos están en una cuenta del usuario, no en una
   wallet omnibus ni un balance interno de GatoPago.
2. **Autorización:** GatoPago no puede gastar unilateralmente.
3. **Continuidad:** aunque GatoPago, sus dominios, Workers, paymasters y bundlers
   desaparezcan, el usuario conserva una ruta practicable para operar o mover
   sus activos.

La arquitectura sólo puede vender la promesa fuerte cuando cumple las tres.
Account V3 cumple la primera por diseño. Para cumplir las otras dos necesita una
credencial independiente y tooling de emergencia probado.

### 1.1 Lo que no basta

- Un JSON de manifests no firma transacciones.
- Una passkey WebAuthn ligada únicamente al RP ID de GatoPago puede quedar
  inutilizable desde otro dominio aunque su clave privada siga en el dispositivo.
- Una PWA offline o un dominio de recuperación de GatoPago reducen riesgo
  operativo, pero continúan dependiendo de que el origen/RP ID siga disponible.
- Firebase, magic link o soporte no son autorización onchain.
- Publicar contratos no demuestra que una persona normal pueda construir,
  simular, financiar y enviar la operación de rescate.

Por tanto, el Portable Account Package es necesario, pero **no es una credencial
de recuperación**.

## 2. Modelo disappear-safe obligatorio

Cada cuenta debe tener al menos dos clases de control:

```text
Control cotidiano
└─ passkey WebAuthn cómoda, posiblemente sincronizada

Control independiente de GatoPago
├─ wallet ECDSA o hardware wallet, o
├─ multisig ERC-1271 / guardian threshold, o
└─ en Stellar, clave Ed25519 / guardian threshold
```

No es obligatorio forzar una seed phrase durante el primer minuto de
onboarding. Sí es obligatorio:

- explicar el estado de continuidad;
- bloquear la etiqueta **“respaldo completo”** hasta configurar un signer
  independiente;
- incentivar o exigirlo antes de límites altos, mainnet o funciones B2B;
- probar que ese signer puede ejecutar una operación sin infraestructura
  GatoPago.

### 2.1 Opciones de producto

| Opción | UX | Independencia | Recomendación |
|---|---|---:|---|
| Conectar wallet externa como recovery signer | familiar para usuario cripto | alta | opción principal avanzada |
| Hardware wallet / llave controlando multisig externa | más fricción | muy alta | altos saldos/B2B |
| Guardians sociales con threshold | no exige seed personal | alta si son independientes | opción principal masiva |
| Recovery kit con clave ECDSA/Ed25519 generada localmente | exige guardar secreto | alta | opt-in, UX muy cuidada |
| Segunda passkey bajo el mismo RP ID | cómoda | media/baja ante desaparición del dominio | respaldo de dispositivo, no salida total |
| Guardian único de GatoPago | cómoda | nula si GatoPago desaparece | prohibido como única recuperación |

Si se ofrece un recovery kit, la clave se genera y cifra en el cliente; el
backend nunca recibe material privado. Debe advertir que quien obtenga el
secreto puede controlar la cuenta según el threshold configurado.

### 2.2 Thresholds y autoridad de GatoPago

Configuración recomendada para personas:

```text
gasto normal:             1 passkey activa
cambio de seguridad:      passkey + confirmación independiente, o timelock
recovery sin passkey:     2 de 3 guardians independientes
GatoPago assistance:      como máximo 1 guardian dentro de un threshold > 1
```

GatoPago nunca debe ser el único guardian capaz de reemplazar signers. Si el
modelo actual conserva esa autoridad, la afirmación comercial correcta es
“autocustodia con recuperación asistida y timelock”, no “GatoPago no tiene
ninguna autoridad”.

### 2.3 Kit público de continuidad

Debe existir fuera del producto principal:

- repositorio open source y releases reproducibles;
- emergency client descargable y CLI;
- deployment manifests y ABIs/Wasm públicos;
- verificadores de codehash y estado de seguridad;
- construcción de operaciones EVM self-funded;
- construcción, simulación y envío Stellar mediante RPC público;
- restauración/TTL de contratos Stellar;
- barrido de native/ERC-20/ERC-721/ERC-1155 y XLM/activos Stellar;
- revocación de módulos, sesiones, allowances y asistencia;
- documentación que funcione sin Firebase ni D1.

El paquete debe poder conservarse localmente. Las releases y manifests deberían
tener múltiples mirrors y firmas verificables, no un único enlace de GatoPago.

### 2.4 Prueba comercial de soberanía

Antes de usar la promesa fuerte en marketing:

1. crear una cuenta real de prueba;
2. agregar un signer independiente;
3. apagar App API, Payments, paymaster, bundler y dominio de recuperación;
4. importar el paquete en el emergency client;
5. self-fund o usar infraestructura pública;
6. firmar, transferir y cambiar seguridad en cada red;
7. repetir tras retirar toda capacidad de GatoPago;
8. publicar el procedimiento, evidencia y limitaciones.

## 3. Stellar será una instancia futura, no la cuenta principal de V3

Account V3 empieza con el grupo EVM. Una integración posterior puede agregar
una cuenta Stellar `C...` a la misma identidad de producto sin reemplazarla,
controlarla ni obligar a migrar la API. `accountId` permanece estable y
`defaultNetworkId` sigue siendo una preferencia mutable:

```text
GatoPago Account Identity
├─ accountId estable
├─ defaultNetworkId = eip155:...           <- política de producto
├─ EVM Account Group 0x...                 <- núcleo V3
└─ Stellar Account C...                    <- adapter futuro opt-in
```

Esta separación permite agregar Stellar después sin romper tres decisiones:

- un merchant puede elegir settlement EVM;
- una persona puede activar una EVM sin crear otra identidad GatoPago;
- el producto puede cambiar la red sugerida sin migrar ownership ni romper la
  API ni convertir Stellar en raíz de ownership.

No se deriva la clave EVM de una key Stellar ni viceversa. Tampoco se entrega a
la cuenta Stellar autoridad administrativa sobre el grupo EVM. Ambas instancias
se vinculan al mismo `accountId` mediante manifests y pruebas de control, pero
mantienen autorización, fees, finality y recovery nativos.

### 3.1 Dónde Stellar sí es más fácil y dónde no

| Criterio | Stellar | EVM | Consecuencia para GatoPago |
|---|---|---|---|
| Pago simple de activos Stellar | operación de pago nativa y barata entre cuentas clásicas | transferencia nativa/ERC-20 por contratos | ventaja Stellar para el caso cotidiano |
| Passkeys | verificación P-256 nativa en contratos desde Protocol 21 | depende de soporte de chain o verifier compatible con ERC-7913 | Stellar reduce coste y variación para la llave cotidiana |
| Patrocinio | fee-bump; sponsored reserves para ledger entries clásicas | ERC-4337 paymasters y fallback self-funded | ambos sirven; son adapters diferentes |
| On/off-ramp | anchors y SEPs de depósito, retiro y cross-border | proveedores y APIs no uniformes entre chains | ventaja de estandarización Stellar, no garantía de cobertura local |
| DEX/rutas | path payments y SDEX integrados para activos compatibles | mayor profundidad DeFi, AMMs, agregadores y bridges | EVM conserva ventaja de liquidez y composabilidad |
| Cuenta programable | `__check_auth` flexible | ERC-4337 y ecosistema modular más amplio | empate conceptual; EVM tiene tooling más maduro |
| Estado de contrato | rent, TTL, archivado y restore | estado persistente sujeto al modelo de cada EVM | Stellar exige un nuevo subsistema operativo |
| Interoperabilidad wallet | formatos `G...`, `C...`, `M...`, memos y XDR | tooling `0x`, ABI y EIP-1193 ampliamente disponible | EVM es hoy más familiar para integradores |
| Misma dirección multichain | no existe entre Stellar y EVM, ni entre Testnet/Pubnet | posible dentro del grupo EVM con stack canónico | `accountId`, no address, es el identificador universal |
| Salida si GatoPago desaparece | viable con signer Ed25519 independiente, RPC y restore | viable con ECDSA/ERC-1271, RPC y self-funding | ambas deben superar un drill destructivo |

Por tanto, Stellar no es “mejor blockchain” en abstracto. Puede ser un rail de
pagos muy eficiente si la implementación real prueba passkeys, recovery,
exchanges, TTL y continuidad. EVM conserva el rol de cuenta inicial y núcleo de
composición en V3.

### 3.2 Gate futuro antes de habilitar Stellar

Después de cerrar V3 se ejecutará un spike aislado en Stellar Testnet. Debe
demostrar:

1. registrar y usar una passkey en iOS y Android;
2. recibir/enviar XLM y USDC entre `C...` y `G...`;
3. pagar a un exchange de prueba usando memo o muxed address sin error humano;
4. fee sponsorship y fallback financiado por el usuario;
5. recovery con Ed25519/guardians mientras todos los servicios de GatoPago
   están apagados;
6. archivado, restore y extensión de TTL con tooling público;
7. CCTP Testnet en ambos sentidos, incluyendo precisión y failure recovery;
8. reconciliación canónica y webhook desde un PaymentIntent.

Si los ocho casos pasan, `stellar:testnet` puede promoverse a rail opt-in y más
adelante a settlement elegible. Si falla passkey, recovery, restore o
compatibilidad de pagos externos, permanece experimental. El SCF no sustituye
estos gates ni altera el EVM core.

### 3.3 Stellar no es otra EVM

Stellar se integra como un **ecosistema de ejecución distinto**:

```text
GatoPago Account Identity
├─ EVM Account Group
│  ├─ misma dirección 0x... en cada EVM habilitada
│  └─ Account V3 + ERC-4337
└─ Stellar Account Instance
   └─ dirección contrato C...
      + CustomAccountInterface/__check_auth
```

No se promete la misma dirección entre EVM y Stellar. Tampoco entre Stellar
Testnet y Pubnet: el network ID de Stellar participa en firmas y derivación de
contract IDs. La unidad común es `accountId`, no el formato de dirección.

### 3.4 Por qué usar un Contract Account `C...`

Una cuenta clásica `G...` ofrece excelente compatibilidad, signers Ed25519,
thresholds y operaciones nativas, pero no valida directamente la passkey P-256
con la política programable de GatoPago.

Un smart wallet Soroban implementa `CustomAccountInterface` y `__check_auth`:

- puede verificar secp256r1/WebAuthn nativamente;
- puede combinar passkeys, Ed25519, multisig, límites y timelocks;
- puede autorizar árboles completos de invocaciones;
- puede custodiar XLM, activos Stellar mediante SAC y tokens SEP-41;
- puede pagar a cuentas `G...` y recibir desde ellas mediante las rutas
  soportadas por protocolo.

Por coherencia con Account V3, la opción recomendada es `GatoPagoStellarAccount`
como contract account `C...`, no una keypair `G...` custodiada por backend.

### 3.5 Stellar Account V1

Responsabilidades mínimas del contrato Rust/Soroban:

- `__check_auth` con passkey P-256;
- validator Ed25519 independiente;
- threshold y security version;
- recovery con guardians/timelock;
- validación de auth context para impedir autorización más amplia de la
  presentada al usuario;
- upgrade controlado por el usuario o estrategia de código inmutable;
- TTL/restore seguro de instancia y configuración;
- events de cambios de seguridad;
- interfaz de exportación pública de configuración.

No contiene routing, CCTP, merchant fees ni metadata de activos.

Stellar permite deployment determinístico en función de deployer, salt y Wasm.
El pipeline debe congelar network ID, deployer address, Wasm hash, constructor
args y source commit. No se exige que el contract ID coincida con la address EVM.

### 3.6 Modelo de activos Stellar

Se deben distinguir:

- XLM nativo;
- activos clásicos `CODE:ISSUER`;
- Stellar Asset Contracts (SAC);
- contract tokens SEP-41;
- liquidity pool shares si alguna vez se exponen.

SAC ofrece a contratos una interfaz para XLM y activos Stellar. Los balances de
una address `C...` viven en contract data; no son trustlines clásicas. Cuando el
destinatario es `G...`, siguen importando trustlines, autorización del issuer,
clawback flags, reservas y memos/muxed accounts.

Asset IDs objetivos:

```text
stellar:testnet/slip44:148
stellar:testnet/asset:USDC-G...
stellar:testnet/sep41:C...
```

El namespace Stellar de CAIP sigue en Draft; internamente se usa un
`NetworkRef` namespaced y se conserva además el network ID/passphrase canónico.
No se depende de aliases sin verificarlos contra RPC.

### 3.7 Sponsorship, fees y estado archivado

Stellar no tiene ERC-4337/paymasters:

- fee-bump transactions permiten que otra cuenta cubra fees sin modificar la
  transacción interna firmada;
- sponsored reserves cubren reservas de cuentas clásicas, trustlines, signers y
  otras ledger entries;
- Soroban cobra inclusion fee, resource fee y rent;
- las transacciones de contrato deben simularse para estimar footprint y fees;
- código, instancia y storage tienen TTL; los datos persistentes pueden
  archivarse y restaurarse.

El adapter Stellar necesita:

```text
StellarFeePolicy
├─ sponsor/fee-bump account
├─ self-funded XLM
├─ simulation + resource bounds
└─ TTL monitor + permissionless restore path
```

La desaparición de GatoPago no puede volver inaccesible una cuenta archivada.
El emergency client debe poder pagar el restore/TTL con una fuente XLM externa.

### 3.8 CCTP EVM ↔ Stellar

CCTP V2 en Stellar Testnet permite mover USDC nativo entre Stellar y dominios
CCTP, lo que encaja con el Intent Engine. Debe ser un adapter distinto al EVM:

- dominio Circle Stellar `27`;
- direcciones Stellar se codifican a 32 bytes;
- USDC Stellar usa 7 decimales, mientras el mensaje CCTP usa 6;
- hacia Stellar se usa siempre `CctpForwarder` según Circle;
- una configuración incorrecta de `mintRecipient` o `destinationCaller` puede
  dejar fondos bloqueados;
- dust del séptimo decimal debe tratarse explícitamente.

CCTP no pertenece al contrato de cuenta. Es una ruta versionada y auditada del
Execution Engine con fixtures EVM/Stellar compartidos.

## 4. Frontera de ejecución multiecosistema

No se crea un Stellar Worker separado al inicio. App y Payments mantienen sus
bounded contexts y agregan adapters internos:

```text
NetworkExecutionPort
├─ EvmExecutionAdapter
│  ├─ viem/RPC
│  ├─ ERC-4337/bundler
│  └─ paymaster/self-funded
└─ StellarExecutionAdapter
   ├─ Stellar RPC/Horizon
   ├─ simulate/assemble/submit XDR
   ├─ auth entries/__check_auth
   ├─ fee-bump sponsor
   └─ TTL/restore
```

`ChainExecution` se renombra lógicamente a `NetworkExecution`. Durable Objects
y colas se particionan por `networkId + submittingAccount`, porque Stellar usa
sequence numbers y una fee source que también necesita serialización.

Indexación:

- EVM: logs, receipts, finality y reorgs;
- Stellar: RPC events, transaction result/meta y Horizon cuando corresponda;
- ambos producen un modelo canónico `ExecutionEvidence`;
- ninguna red se marca `confirmed` sólo porque el submit respondió.

Se extrae un tercer Worker únicamente si carga, secretos o disponibilidad de
Stellar justifican una frontera física. La interfaz se diseña desde ahora; el
deploy adicional no.

## 5. Impacto sobre la futura API

La API actual todavía es un prototipo EVM: `chain_id` numérico, addresses `0x`,
tokens ERC-20, router EIP-712 y autorizaciones Solidity. Publicarla así obligaría
a una ruptura al agregar Stellar.

Como todavía estamos en testnet, la recomendación es **reemplazar ahora el
contrato preliminar**, no mantener v1 y v2 por compatibilidad imaginaria.

### 5.1 Primitivas neutrales

```json
{
  "network_id": "stellar:testnet",
  "account": {
    "address": "C...",
    "address_type": "stellar_contract"
  },
  "asset_id": "stellar:testnet/asset:USDC-G...",
  "amount_atomic": "10000000"
}
```

Para EVM:

```json
{
  "network_id": "eip155:421614",
  "account": {
    "address": "0x...",
    "address_type": "evm_contract"
  },
  "asset_id": "eip155:421614/erc20:0x...",
  "amount_atomic": "1000000"
}
```

Cambios necesarios:

| Actual | Objetivo |
|---|---|
| `chain_id: integer` | `network_id: namespaced string` |
| `wallet_address: 0x` | `account.address + address_type` |
| `token: 0x` | `asset_id` + decimals snapshot |
| `RouterAuthorization` único | union `execution_payload` por ecosistema |
| `user_op_hash` obligatorio | `submission_id` + evidencia tipada |
| router Solidity | `route_steps[]` con adapter/generation |
| receipt EVM | `ExecutionEvidence` EVM o Stellar |

`execution_payload` puede ser:

- `evm_user_operation`;
- `evm_transaction`;
- `stellar_transaction_xdr`;
- `stellar_soroban_authorization`.

El SDK oculta XDR/calldata al merchant normal, pero la API los tipa y versiona.

### 5.2 PaymentIntent no cambia conceptualmente

El merchant continúa diciendo qué resultado necesita:

```text
amount + settlement asset + SettlementDestination + constraints
```

Quote, attempt, route, settlement, event y webhook sobreviven. Lo que cambia es
la implementación de sus pasos. Un webhook estable puede incluir:

```json
{
  "type": "payment.succeeded",
  "payment_intent": "pi_...",
  "settlement": {
    "network_id": "stellar:testnet",
    "asset_id": "stellar:testnet/asset:USDC-G...",
    "amount_atomic": "10000000",
    "transaction_id": "...",
    "ledger": 123456
  }
}
```

## 6. Impacto B2B

Stellar amplía B2B sin cambiar el producto base:

- merchant puede liquidar en EVM o Stellar;
- payer puede pagar desde EVM o Stellar;
- intent/quote selecciona ruta local o CCTP;
- dashboard muestra red, asset issuer/contract, fees y evidencia;
- reconciliación entiende transacciones `G...`, `C...`, `M...` y memos;
- API keys, idempotencia, outbox y webhooks siguen iguales.

Primer alcance B2B Stellar recomendado:

1. settlement USDC en Stellar Testnet;
2. payer desde cuenta G o C en Stellar;
3. XLM/USDC visibles, pero Payments acepta sólo USDC confiable;
4. fee sponsorship;
5. CCTP EVM → Stellar después del pago local;
6. Stellar → EVM sólo después de cerrar precisión, forwarder y recovery.

No comenzar con anchors fiat, path payments arbitrarios, DEX, SEP-24/31 y CCTP
bidireccional al mismo tiempo.

## 7. Impacto B2B2C

B2B2C agrega tenant/partner, pero la cuenta sigue perteneciendo al usuario:

```text
Partner/Tenant
├─ branding y onboarding policy
├─ sponsorship budget
├─ límites/compliance del producto
└─ webhooks/API

End user Account Identity
├─ EVM account group
├─ Stellar contract account
└─ recovery independiente del partner y de GatoPago
```

El partner no recibe automáticamente signer, guardian ni autoridad de upgrade.
Si un caso regulado necesita control conjunto, se expresa como política visible
y threshold, nunca como custodia oculta.

La API B2B2C necesitará:

- `tenant_id` y `external_customer_id`;
- `account_identity_id` opaco;
- provisioning idempotente de instancias por network;
- sponsorship policy por tenant;
- recovery policy y disclosures por usuario;
- límites y approvals programables;
- webhooks de `account.instance_ready`, `security.sync_required`,
  `recovery.started/completed` y pagos;
- export/exit que no requiera consentimiento del partner para fondos propios.

Stellar también abre integración futura con anchors. Contract accounts usan
SEP-45 para autenticarse con servicios compatibles; SEP-10 continúa para
cuentas clásicas. Es una fase posterior, no requisito del wallet MVP SCF.

## 8. Dificultad y coste

La cadena es barata; la ingeniería segura no.

| Alcance | Dificultad | Esfuerzo razonable de una persona | Incluye |
|---|---:|---:|---|
| Demo aislada Stellar | 5/10 | 3–5 semanas | passkey C-account, XLM/USDC testnet, sponsor básico |
| MVP SCF integrado | 8/10 | 7–10 semanas | recovery Ed25519, App adapter, indexación, API neutral, pago local y CCTP demo |
| Producción seria | 9/10 | 4–6 meses antes de auditoría externa | hardening, recovery drills, TTL, RPC HA, observabilidad, B2B y runbooks |

Los rangos asumen conocimiento fuerte TypeScript/EVM pero aprendizaje de Rust,
Soroban, XDR, auth entries, Horizon/RPC, TTL y SAC. No incluyen tiempo de una
auditoría externa ni corrección de sus hallazgos.

Costes directos:

- Testnet: casi todo es tiempo de ingeniería; Friendbot y test assets reducen
  coste onchain.
- Mainnet: XLM para fees, fee-bump sponsor, rent/TTL y reservas de cualquier
  cuenta/trustline clásica; RPC/indexación y monitoreo.
- Seguridad: revisión Rust/Soroban y auditoría de account/recovery/CCTP; debe
  presupuestarse por separado y cotizarse cuando el alcance esté congelado.

El riesgo principal no es “aprender otro SDK”. Es implementar correctamente dos
modelos de autorización y reconciliación sin presentar una abstracción falsa.

## 9. Alcance recomendado para SCF

La propuesta no debería ser “agregaremos Stellar porque queremos un grant”. La
tesis defendible es:

> GatoPago lleva a Stellar una cuenta autocustodiada con passkeys, recuperación
> independiente, fee sponsorship y una API de payment intents capaz de aceptar
> y liquidar USDC entre Stellar y EVM sin exponer la infraestructura al usuario.

MVP demostrable:

1. `GatoPagoStellarAccount` en Stellar Testnet;
2. passkey cotidiana + signer Ed25519 independiente;
3. receive/send XLM y USDC mediante SAC;
4. fee sponsorship y fallback self-funded;
5. export package + emergency client mínimo;
6. PaymentIntent con settlement Stellar;
7. pago Stellar local reconciliado y webhook;
8. una ruta CCTP EVM → Stellar con precisión/forwarder correctos;
9. repositorio, tests, demo y métricas públicas.

Según el sitio oficial consultado el 1 de septiembre de 2026, SCF #46 pide
enviar el interés cuanto antes, cierra Build Submission el **8 de noviembre de
2026**, admite Open/Integration/RFP y evalúa product-market fit, uso de Stellar,
plan de integración, readiness y presupuesto/tranches. El proceso publica hitos
MVP, Testnet y Mainnet. Estas fechas deben volver a verificarse antes de enviar.

Con unas nueve semanas hasta esa fecha, el MVP es posible sólo si no se mezcla
con dashboard completo, anchors fiat, mainnet, DEX y B2B2C productivo.

## 10. Secuencia futura, posterior a V3

Esta secuencia empieza únicamente después de que Account V3, recovery y salida
independiente superen sus gates. No es parte del camino crítico actual.

| Semana | Entregable |
|---:|---|
| 1 | ADR Stellar, threat model, fixtures de identidad/network/asset |
| 2–3 | account contract + deterministic deployer + unit/fuzz tests |
| 4 | passkey + Ed25519 recovery + auth-context tests |
| 5 | App adapter, simulation, sponsor/self-funded, TTL/restore |
| 6 | XLM/USDC portfolio, send/receive e indexación |
| 7 | API neutral + payment local Stellar + webhook |
| 8 | CCTP EVM → Stellar + failure/recovery tests |
| 9 | emergency drill, documentación, demo y submission evidence |

Si una etapa crítica se retrasa, CCTP se presenta como milestone posterior y se
prioriza account + payment local + recovery real. Nunca se recorta la salida del
usuario para mostrar más redes.

## 11. Decisiones pendientes

1. Implementación propia mínima frente a adaptar Passkey Kit con fork auditado.
2. Upgradeable Wasm frente a cuenta inmutable con migración explícita.
3. Ed25519 recovery kit, guardians o ambas opciones.
4. Modelo de TTL: usuario, sponsor o servicio permissionless con alertas.
5. RPC/Horizon providers y fallback.
6. Formato canónico de `NetworkRef` mientras CAIP Stellar siga Draft.
7. Stellar settlement directo a `C...` o `G...` del merchant.
8. Dirección/memo/muxed behavior para exchanges.
9. Alcance exacto de CCTP para el MVP SCF.
10. Qué componentes serán public goods/open source para la propuesta.
11. Criterio de promoción `experimental -> enabled -> settlement_eligible`.

## 12. Fuentes oficiales

- [Stellar smart wallets y passkeys](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Contract accounts y `__check_auth`](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [Pagos entre cuentas C y G](https://developers.stellar.org/docs/build/guides/transactions/send-and-receive-c-accounts)
- [Deterministic contract deployer](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/deployer)
- [Fee-bump transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)
- [Sponsored reserves](https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves)
- [Soroban fees y resource metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [State archival y TTL](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [SEP-45 para contract accounts](https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep45)
- [CCTP en Stellar](https://developers.circle.com/cctp/references/stellar)
- [SCF Build Awards](https://communityfund.stellar.org/awards)
- [Radar ERC/EIP de Account V3](./RADAR-EIP-ERC-V3.md)

## 13. Diagramas asociados

- [Soberanía sin GatoPago](./diagrams/21-secuencia-soberania-sin-gatopago.puml)
- [C4 multiecosistema EVM/Stellar](./diagrams/22-c4-multiecosistema-evm-stellar.puml)
- [PaymentIntent EVM/Stellar](./diagrams/23-secuencia-payment-intent-stellar.puml)
- [Decisión de rol de redes](./diagrams/24-decision-network-role-v3.puml)
