# Radar ERC/EIP para GatoPago Account V3

> **Snapshot de procedencia (2 de septiembre de 2026).** El diseño vigente y
> su orden de implementación están en [V3 FUSION revisión 2](./V3-FUSION.md).
> Este archivo conserva la fuente original; sus referencias a autoridad,
> prioridades, API futura y migración no prevalecen sobre la revisión 2.

**Fecha:** 2 de septiembre de 2026  
**Estado:** decisión arquitectónica; no implementado ni desplegado  
**Precedencia:** complementa
[`ARQUITECTURA-OBJETIVO-V3.md`](./ARQUITECTURA-OBJETIVO-V3.md).  
**Objetivo:** usar estándares para reducir lock-in, mejorar seguridad y abrir
integraciones sin convertir la cuenta en un laboratorio de Drafts.

## 1. Veredicto

GatoPago no debe contar ERC como si fueran funciones comerciales. Debe separar:

1. **implementado por la cuenta:** bytecode e interfaces que Account V3 ofrece;
2. **perfil de conformidad:** reglas que el stack debe cumplir o probar;
3. **compatibilidad de integración:** estándares que SDK, router o adapters
   consumen cuando el activo/proveedor los soporta;
4. **piloto:** interfaz opcional y revocable que todavía puede cambiar;
5. **observado o descartado:** tecnología interesante que no justifica riesgo.

El inventario candidato de V3 es:

- **14 estándares/perfiles base** de cuenta, firma, deployment, proxy,
  recepción y capacidad P-256; ERC-1822 entra porque UUPS ya fue decidido;
- **10 compatibilidades** de pagos e infraestructura;
- **12 candidatos** en piloto/observación;
- ningún módulo Draft con poder irrestricto o storage irreversible.

Eso no significa desplegar 23 contratos. Varios estándares son interfaces,
formatos RPC o reglas de conformidad. La métrica útil es interoperabilidad
probada, no cantidad anunciada.

Después de revisar necesidad y madurez, el **release inicial recomendado** se
limita a 20 estándares/perfiles: 14 base y 6 adapters esenciales. Los otros
cuatro adapters y todos los pilotos se posponen hasta que exista un caso de uso
o madurez suficiente. Ningún estándar Draft obtiene autoridad esencial en el
account core.

## 2. Base de Account V3: adoptar

| Estándar | Estado oficial al corte | Capa | Decisión y valor |
|---|---|---|---|
| ERC-4337 | Final | account + bundler | núcleo de UserOperations, batching, sponsorship y validación programable |
| EIP-712 | Final | firmas | mensajes tipados y domain separation; siempre con nonce, validez y anti-replay propios |
| ERC-1271 | Final | account | firma verificable de una smart account para login, órdenes y autorizaciones |
| ERC-7913 | Final | validators | representa passkeys P-256, hardware u otras llaves sin address EVM |
| EIP-7951 | Final | chain capability | precompile secp256r1/P-256; si no existe se usa verifier canónico con el mismo formato, nunca una address asumida |
| ERC-6492 | Final | SDK/verifier | verifica firmas contrafactuales antes de desplegar Account V3 |
| ERC-165 | Final | introspección | permite descubrir de forma explícita interfaces soportadas |
| ERC-1967 | Final | proxy | slots transparentes para implementación UUPS controlada por el usuario |
| ERC-7201 | Final | storage | namespaces que reducen colisiones en upgrades y módulos |
| ERC-5267 | Final | firmas/introspección | publica el dominio EIP-712 usado por la cuenta |
| EIP-1014 | Final | factory | CREATE2 para dirección determinística y despliegue contrafactual |
| ERC-1822 | Stagnant | upgrade | perfil UUPS elegido con OpenZeppelin; su estatus obliga a conformance y revisión, no a una implementación propia improvisada |
| ERC-721 receiver | Final | recepción | evita que NFTs enviados con `safeTransferFrom` queden rechazados |
| ERC-1155 receiver | Final | recepción | recibe tokens multi-activo de forma estándar |

### 2.1 Lo que significa “adoptar”

- `supportsInterface` sólo declara lo que una suite de conformidad demostró.
- ERC-6492 se implementa en el validador/SDK; no se acepta ejecutar init code no
  confiable dentro de un contexto que pueda producir efectos laterales.
- ERC-7913 identifica cada signer por `(verifier, key)` y fija address,
  runtime-codehash, curva y formato de firma en el Security Manifest.
- EIP-7951 se declara por chain capability. La validación debe ser equivalente
  con precompile o verifier fallback y cubrir diferencias de gas; nunca se
  detecta una precompile sólo porque una llamada devuelve bytes.
- EIP-712 no aporta anti-replay por sí solo: cada mensaje incluye chain,
  verifying contract, nonce, deadline, action y security version.
- ERC-1967/7201 no autorizan upgrades. El threshold del usuario y el
  `UpgradeManifest` siguen siendo la autoridad.
- EIP-1014 sólo deriva la address; la factory todavía valida manifest, proof,
  init code y runtime codehash.
- ERC-1822 entra por la decisión UUPS de V3.0. Upgrade usa autoridad `admin`,
  timelock, manifest, veto y freeze; no comparte el threshold cotidiano.
- ERC-721/1155 receiver sólo reciben; no añaden enumeración, marketplace ni
  lógica comercial al account core.

## 3. Pagos e infraestructura: soportar mediante adapters

| Estándar | Estado | Uso en GatoPago | Límite |
|---|---|---|---|
| ERC-20 | Final | transferencia y lectura defensiva de tokens fungibles | metadata y retornos no se consideran confiables |
| ERC-2612 | Final | `permit` cuando el token exacto lo soporta | nunca se asume soporte por ser ERC-20 |
| ERC-3009 | Draft | `transferWithAuthorization`, especialmente en integraciones compatibles | no aplica directamente al smart account y se versiona por token |
| ERC-681 | Final | URI/QR interoperable para solicitudes EVM simples | el monto es sugerido; checkout verifica intención y evidencia |
| ERC-4361 | Final | SIWE para wallets externas y partners | debe validar ERC-1271 y no reemplaza Firebase de la App personal |
| EIP-5792 | Final | `wallet_sendCalls`, estado y capabilities en el SDK | siempre ofrece fallback compatible |
| EIP-7702 | Final | payer EOA externo con batching/sponsorship | compatibilidad externa; no sustituye Account V3 |
| ERC-7677 | Review | interfaz estándar de paymaster web service | adapter versionado; fallback self-funded obligatorio |
| ERC-7769 | Draft | RPC común para bundlers ERC-4337 | pin de versión, conformance y múltiples proveedores |
| ERC-7562 | Draft | reglas de validación y DoS que bundlers esperan | test de conformidad; no lógica comercial |

La política de paymaster queda detrás de:

```text
SponsorshipPort
├─ Erc7677PaymasterAdapter
├─ GatoPagoPaymasterAdapter
├─ PartnerPaymasterAdapter
└─ SelfFundedAdapter
```

Cambiar de proveedor no cambia la cuenta, sus signers ni el PaymentIntent. Cada
fallback reconstruye, reestima y vuelve a solicitar autorización sobre los
campos definitivos; nunca reutiliza una firma contra fees o paymaster distintos.

### 3.1 Corte recomendado para el primer release

Adapters esenciales para V3 inicial:

- ERC-20 y ERC-2612 para activos y approvals compatibles;
- EIP-5792 para batching/capabilities del wallet;
- ERC-7677 para reemplazar paymasters sin cambiar cuenta;
- ERC-7769 y ERC-7562 como perfil de bundler/validación ERC-4337.

Se posponen ERC-3009, ERC-681, ERC-4361 y EIP-7702. Son valiosos para payer
externo, links interoperables, autenticación de partners y EOAs inteligentes,
pero no son requisito para que la cuenta personal V3 custodie, reciba y pague.

## 4. Vanguardia útil: pilotos y observación

### 4.1 Modularidad: laboratorio futuro, no V3.0

| Estándar | Estado | Decisión |
|---|---|---|
| ERC-7579 | Draft | candidato preferido para un laboratorio aislado; no se instala en Account V3.0 |
| ERC-7484 | Draft | observar registry/attestations; no convertir una registry externa en autoridad única |
| ERC-6900 | Draft | alternativa más amplia; no se implementa junto con 7579 |
| ERC-7821 | Draft | observar su batch executor; Account V3 mantiene batch interno estable hasta madurez |

Antes de siquiera promover ERC-7579 desde laboratorio:

- los módulos permitidos están allowlisted por address, codehash y versión;
- `DELEGATECALL` permanece deshabilitado por defecto;
- validator, executor, fallback y hook tienen permisos distintos;
- instalar/desinstalar requiere el threshold de seguridad;
- un módulo que revierte no puede bloquear recovery, upgrade freeze ni salida;
- existe un modo de emergencia para revocar todos los módulos no esenciales.

### 4.2 Firmas legibles

| Estándar | Estado | Decisión |
|---|---|---|
| ERC-7739 | Draft | pilotar defensive rehashing compatible, sin prometer estabilidad de ABI |
| ERC-7730 | Draft | publicar metadata de clear signing para GatoPagoAccount, Router e intents |

Ambos son valiosos porque la persona debe confirmar “pagar 100 USDC a X”, no
bytes. Pero metadata legible nunca reemplaza simulación ni verificación del
calldata real.

### 4.3 Dinero programable y agentes

| Estándar | Estado | Decisión |
|---|---|---|
| ERC-7710 | Draft | prototipo de capabilities delegadas detrás de un módulo revocable |
| ERC-7715 | Draft | prototipo de solicitud/revocación de permisos desde wallets |

Casos futuros: suscripciones, límites diarios, comercios permitidos, sesiones,
agentes que sólo pueden pagar proveedores concretos y aprobaciones B2B. Ningún
permiso puede instalar otro validator, cambiar recovery, hacer upgrade o
ampliarse a sí mismo. Todo permiso incluye:

- asset, target y selector permitidos;
- monto por operación y acumulado;
- ventana temporal y expiración;
- chain scope;
- nonce/replay domain;
- revocación inmediata;
- eventos y receipt entendible.

### 4.4 Intents y direcciones multiecosistema

| Estándar | Estado | Decisión |
|---|---|---|
| ERC-7930 | Review | candidato para serialización binaria de chain + address, incluso no EVM |
| ERC-7683 | Draft | adapter futuro para solvers; el PaymentIntent interno no depende de él |

La API usa desde ahora `network_id`, `address_type` y `asset_id` namespaced. Si
ERC-7930/CAIP maduran, se añade una representación interoperable sin cambiar los
campos canónicos. ERC-7683 sólo entra cuando exista un mercado de solvers y un
resolver auditado; no es requisito para routing controlado por GatoPago.

### 4.5 Earn y activos financieros

| Estándar | Estado | Decisión |
|---|---|---|
| ERC-4626 | Final | integrar vaults externos verificados cuando exista producto Earn |
| ERC-7540 | Final | integrar vaults asíncronos/RWA sólo con lifecycle y riesgos explícitos |

GatoPago no crea su propio vault inicialmente. Account V3 sólo puede llamar a
integraciones externas a través de adapters, allowlists, simulación y límites.

## 5. Estándares que no deben entrar al núcleo

| Estándar/patrón | Decisión | Motivo |
|---|---|---|
| ERC-2535 Diamonds | no | multiplica facets, selectors, storage y riesgo de upgrade sin necesidad |
| ERC-2771 como gas path principal | no | ERC-4337 ya cubre meta-ejecución; un trusted forwarder agrega confianza |
| ERC-1167 clones para Account V3 | no | complica la estrategia de dirección/upgrade universal; puede usarse fuera del account core |
| ERC-1363 callbacks obligatorios | no | callbacks de tokens agregan reentrancy y baja compatibilidad |
| ERC-777 como activo privilegiado | no | hooks y operator model amplían superficie; tratarlo como token no confiable |
| ERC-6551 token-bound account | no | no resuelve identidad, payments ni recovery de GatoPago |
| ERC-7579 + ERC-6900 simultáneos | no | dos modelos de módulos crean ambigüedad y duplican auditoría |
| módulos arbitrarios desde UX normal | no | un módulo tiene poder equivalente a código de wallet |

“No” significa fuera del account core. Un activo compatible puede llegar a la
address; el Asset Registry decide cómo mostrarlo y qué operaciones habilitar.

## 6. Arquitectura resultante

```text
GatoPagoAccountV3
├─ ERC-4337 validation/execution
├─ SignerRegistry
│  ├─ ERC-7913 P-256/passkey verifier
│  ├─ ECDSA verifier
│  └─ ERC-1271 verifier
├─ ERC-1271 + 6492 counterfactual support
├─ EIP-712 + ERC-5267 domains
├─ CALL + stable batch interface
├─ ERC-165 + ERC-721/1155 receivers
├─ EIP-1014 deterministic factory
├─ ERC-1967 proxy slots
├─ ERC-1822 UUPS con admin threshold + timelock + freeze
└─ ERC-7201 namespaced storage

Future audited adapters (ausentes en V3.0)
├─ ERC-7579 compatibility
├─ delegated permissions 7710/7715
├─ clear signing 7730/7739
└─ emergency revocation

Offchain/network adapters
├─ bundler 7769 / validation 7562
├─ paymaster 7677 / self-funded
├─ wallet calls 5792 / EOA 7702
├─ token auth 2612/3009
└─ intents 7930/7683
```

## 7. Gate para aceptar un estándar

Cada candidato necesita una ADR que responda:

1. qué problema concreto del usuario resuelve;
2. estado oficial y riesgo de cambio;
3. implementación de referencia y soporte de librerías auditadas;
4. impacto sobre storage, bytecode, gas y validación ERC-4337;
5. nuevas autoridades, callbacks o `delegatecall`;
6. cómo se revoca, desinstala o reemplaza;
7. efecto si GatoPago y el proveedor desaparecen;
8. compatibilidad con más de un bundler/paymaster/wallet;
9. conformance tests, fuzz, invariants y casos adversariales;
10. auditoría requerida antes de mainnet.

Regla de madurez:

- **Final:** puede ser base si pasa threat model y pruebas;
- **Review:** adapter versionado, fallback y sin storage irreversible;
- **Draft:** prototipo opt-in en Testnet; no promesa comercial ni autoridad
  esencial;
- **Stagnant/Withdrawn:** no se adopta sin una ADR excepcional.

## 8. Orden de implementación

| Incremento | Entregable | Estándares principales |
|---|---|---|
| EVM-1 | núcleo mínimo, signers, factory, proxy, receivers | 4337, 712, 1271, 7913, 7951, 6492, 165, 1967, 1822, 7201, 5267, 1014, 721, 1155 |
| EVM-2 | bundlers y sponsorship portable | 7562, 7769, 7677 |
| EVM-3 | SDK de pagos externos y batches | 20, 2612, 3009, 681, 4361, 5792, 7702 |
| EVM-4 | módulo Testnet de permisos | 7579, 7484, 7710, 7715, 7739 |
| EVM-5 | intents/solvers y clear signing | 7730, 7930, 7683 |
| Producto posterior | Earn/RWA mediante integración | 4626, 7540 |

Los incrementos EVM-4/5 no bloquean la App personal. Se promueven sólo después
de que Account V3 base, recovery, salida independiente y pagos simples estén
cerrados.

## 9. Evidencia mínima

- suites de conformidad para interfaces declaradas;
- differential tests contra una implementación de referencia;
- fuzz/invariants de signers, nonces, thresholds, upgrades y módulos;
- pruebas de replay entre accounts, chains, EntryPoints y security versions;
- token adversarial: sin retorno, retorno falso, fee-on-transfer, rebasing,
  callback/reentrancy y metadata maliciosa;
- bundler/paymaster A → B → self-funded sin perder fondos ni reusar firmas;
- módulo malicioso que revierte, reentra o intenta ampliar permisos;
- emergency drill sin frontend, Worker, bundler ni paymaster GatoPago;
- revisión externa antes de cualquier autorización mainnet.

## 10. Fuentes oficiales

- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712)
- [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-7913](https://eips.ethereum.org/EIPS/eip-7913)
- [EIP-7951](https://eips.ethereum.org/EIPS/eip-7951)
- [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492)
- [ERC-165](https://eips.ethereum.org/EIPS/eip-165)
- [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967)
- [ERC-7201](https://eips.ethereum.org/EIPS/eip-7201)
- [ERC-5267](https://eips.ethereum.org/EIPS/eip-5267)
- [EIP-1014](https://eips.ethereum.org/EIPS/eip-1014)
- [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822)
- [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)
- [ERC-7484](https://eips.ethereum.org/EIPS/eip-7484)
- [ERC-6900](https://eips.ethereum.org/EIPS/eip-6900)
- [ERC-7821](https://eips.ethereum.org/EIPS/eip-7821)
- [ERC-7739](https://eips.ethereum.org/EIPS/eip-7739)
- [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730)
- [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710)
- [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715)
- [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792)
- [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-7677](https://eips.ethereum.org/EIPS/eip-7677)
- [ERC-7769](https://eips.ethereum.org/EIPS/eip-7769)
- [ERC-7562](https://eips.ethereum.org/EIPS/eip-7562)
- [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612)
- [ERC-3009](https://eips.ethereum.org/EIPS/eip-3009)
- [ERC-681](https://eips.ethereum.org/EIPS/eip-681)
- [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)
- [ERC-7930](https://eips.ethereum.org/EIPS/eip-7930)
- [ERC-7683](https://eips.ethereum.org/EIPS/eip-7683)
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626)
- [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540)

## 11. Diagramas asociados

- [Radar de estándares](./diagrams/25-radar-eip-erc-v3.puml)
- [Arquitectura objetivo V3](./ARQUITECTURA-OBJETIVO-V3.md)
- [Stellar, soberanía y API multirail](./STELLAR-SOBERANIA-API-V3.md)
