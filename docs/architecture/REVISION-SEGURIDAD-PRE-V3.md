# Revisión de seguridad y refinamiento preimplementación V3

> **Snapshot de procedencia (2 de septiembre de 2026).** El diseño vigente y
> su orden de implementación están en [V3 FUSION revisión 2](./V3-FUSION.md).
> Este archivo conserva la fuente original; sus referencias a autoridad,
> prioridades, API futura y migración no prevalecen sobre la revisión 2.

**Fecha:** 2 de septiembre de 2026  
**Estado:** evaluación local; V3 no está implementada ni aprobada para mainnet  
**Severidad:** agresiva por diseño; una duda sobre control de fondos falla
cerrado  
**Alcance:** contratos, passkeys, recovery, multichain, App Worker, Payments
Worker, datos, proveedores, pagos, B2B, supply chain, operación y salida.

## 1. Veredicto ejecutivo

La dirección V3 es viable, pero **no debe comenzar como una reescritura rápida
de Account V2**. El código actual demuestra componentes útiles; no demuestra
todavía una arquitectura mainnet-grade.

Los cuatro riesgos que más importan son:

1. que una autoridad de backend, recovery o upgrade pueda convertirse en llave
   maestra;
2. que la abstracción multichain o una route mutable haga firmar al usuario algo
   diferente de lo que cree;
3. que GatoPago prometa soberanía cuando passkey, dominio, bundler o gas todavía
   hacen indispensable a GatoPago;
4. que gates verdes oculten rutas no analizadas, pruebas omitidas o artefactos
   no reproducibles.

La respuesta no es agregar más contratos ni 35 estándares. Es reducir el
número de autoridades, cerrar las decisiones esenciales y hacer que cada claim
comercial tenga una prueba destructiva.

**Conclusión de release:** se puede iniciar el diseño detallado y las properties
de V3. No se debe escribir el contrato definitivo hasta cerrar los bloqueos P0
de la sección 5. No hay autorización ni base técnica para mainnet.

## 2. Qué se revisó

### Evidencia local ejecutada

- lectura de Account V2, factory, paymaster y routers;
- lectura de límites App/Payments, bindings, D1, Queues, Durable Objects,
  configuración Wrangler y documentación operativa;
- `forge test --summary`: suites actuales sin fallos; los fork smokes continúan
  omitidos cuando no existe RPC real;
- `pnpm audit --prod`: sin CVE conocida en dependencias de producción;
- Semgrep `p/default`: un hallazgo en un script de deploy por `RegExp`
  construido dinámicamente; el nombre proviene hoy de una lista interna, pero
  se debe eliminar la ambigüedad;
- Slither 0.11.6: detectó observaciones conocidas, pero no logró producir IR
  para partes de `MultiSignerERC7913`/ERC-7821. Ese hueco invalida cualquier
  afirmación de cobertura completa aunque el filtro de severidad termine verde;
- verificación de Wrangler 4.125.0 y schemas locales presentes;
- contraste con especificaciones ERC/EIP y guías oficiales.

### Lo que esta revisión no prueba

- ceremonias reales de passkey en la matriz completa iOS/Android/desktop;
- lifecycle B firma → A se retira → B vuelve a pagar;
- recovery y salida con toda infraestructura GatoPago apagada;
- bytecode V3 porque todavía no existe;
- forks reales, reorgs, paymaster/bundler failover o carga sostenida;
- estado de secrets remotos ni ausencia de secretos históricos en todo Git;
- auditoría independiente o garantía de ausencia de vulnerabilidades.

### Controles actuales que conviene conservar

- App y Payments ya tienen D1/Queue separados y Service Binding para el cruce
  interno; no hace falta recombinar los dominios;
- JWT Firebase valida issuer y audience; el body limit global es acotado;
- la lógica monetaria falla cerrada ante RPC no confiable y los caches globales
  observados conservan resultados resueltos, no Promises de request;
- routers de pago usan `ReentrancyGuard` y transferencias OpenZeppelin; warnings
  automáticos de reentrancy deben revisarse, no contarse sin contexto;
- intents actuales ya incorporan capability, prueba del payer, receipt/event
  verification e idempotencia; V3 debe preservar las properties sin copiar el
  esquema histórico;
- el repositorio tiene CI separado para gitleaks, Semgrep, Slither y CodeQL,
  aunque su cobertura todavía requiere los endurecimientos de esta revisión;
- los deploy guards, checksum semántico y estado `PAYMENT_LIVE_ENABLED=false`
  son límites operativos útiles y deben sobrevivir al reset.

## 3. Activos y propiedades que protegemos

### Activos críticos

1. capacidad de mover fondos y NFTs;
2. conjunto de validadores, thresholds y recovery;
3. implementación y storage de la cuenta;
4. consentimiento exacto del usuario;
5. destino, monto y finality de un settlement;
6. claves operativas de routers, relayers y sponsorship;
7. identidad de merchant, API keys y webhooks;
8. disponibilidad de salida aunque fallen proveedores o GatoPago;
9. manifests, bytecodes y artefactos reproducibles;
10. privacidad de correo, UID, direcciones y actividad financiera.

### Propiedades no negociables

- **No custodia unilateral:** ninguna clave/sesión de GatoPago mueve fondos.
- **No sustitución:** lo mostrado y lo firmado describen la misma ejecución.
- **No replay inesperado:** dominio, chain, EntryPoint, cuenta, nonce, deadline y
  policy scope son explícitos.
- **No inicialización ajena:** la dirección contrafactual sólo acepta el
  compromiso de seguridad autorizado.
- **No recovery instantáneo:** recuperar cambia autoridad tras timelock; no
  transfiere ni actualiza en el mismo paso.
- **No estado económico inventado:** finality viene de evidencia onchain.
- **No proveedor obligatorio:** existe sustitución y salida self-funded.
- **No compatibilidad eterna:** una generación retirada no entra en operaciones
  nuevas.
- **No secreto en cliente/log:** secrets no llegan a Vite ni a telemetría.
- **No claim sin drill:** “sobrevive sin GatoPago” requiere simulacro real.

## 4. Modelo de amenazas

| Adversario/falla | Objetivo | Impacto | Control V3 exigido |
|---|---|---:|---|
| XSS o dependencia frontend comprometida | cambiar calldata/destino o robar sesión | crítico | CSP estricta, Trusted Types cuando sea viable, preview/digest verificable, no secrets cliente, supply-chain gate |
| sesión Firebase robada | iniciar recovery, leer datos, engañar UX | alto | Firebase sólo identidad; step-up WebAuthn; rate limits; ninguna autoridad onchain |
| App Worker comprometido | falsificar portfolio o preparar operaciones | crítico | usuario firma UserOp final; simulación independiente; manifests verificables; sin llave maestra |
| Payments Worker comprometido | alterar quote, fee, route o webhook | crítico | bounds firmados, SettlementDestination inmutable, receipt/finality, idempotencia y reconciliación |
| signer operativo filtrado | patrocinar/autorizar rutas fraudulentas | crítico | roles separados, KMS/MPC, límites onchain, allowlist, rotación ensayada y pausa acotada |
| bundler/paymaster malicioso | censurar, inflar gas o cambiar payload | alto | múltiples adapters, reestimación, firma final posterior, fallback self-funded |
| RPC malicioso o atrasado | balance/nonce/receipt falso | alto | quorum por operación crítica, block hash/finality, proveedores independientes y fail closed |
| factory/deployer equivocado | tomar dirección contrafactual | crítico | CREATE2 commitment, addresses/codehashes canónicos, init atómico y proof de validadores |
| implementación/proxy malicioso | tomar todas las cuentas | crítico | sin admin global, build reproducible, manifest, auditoría, threshold+timelock de usuario |
| verifier ERC-7913 mutable | aceptar firmas inválidas | crítico | verifier stateless, sin upgrade, codehash fijado y conformance P-256 |
| guardian o soporte abusivo | reemplazar signers | crítico | threshold independiente, timelock, avisos, veto, GatoPago insuficiente |
| token hostil | reentrar, mentir balance, agotar gas | alto | Asset Registry, SafeERC20, delta checks, cuarentena y fixtures adversariales |
| adapter DeFi/bridge hostil | approvals o llamadas amplias | crítico | fuera del core, target/selector/amount/deadline, allowance temporal y pausa del adapter |
| replay de Queue/webhook | duplicar pago/efecto | alto | idempotency key persistente, outbox transaccional, HMAC, timestamp y delivery ledger |
| reorg/finality falsa | marcar pago inexistente | alto | estado `observed` distinto de `finalized`, profundidad por chain y reversión determinista |
| D1 corrupta o restore parcial | perder asociación/estado operativo | alto | backup/restore, checksums semánticos, constraints, reconciliation y cadena como autoridad económica |
| supply chain/CI comprometido | publicar bytecode o bundle diferente | crítico | pins por hash, lockfile, SBOM, provenance, deploy desde commit limpio y artefacto firmado |
| dominio GatoPago perdido | impedir passkey y salida | crítico | signer independiente probado, emergency tooling y paquete portable |
| GatoPago desaparece | censurar o perder servicios | crítico | RPC/gas externo, manifests públicos, recovery/sweep independiente y mirrors |

## 5. Hallazgos y bloqueos

### P0 — Bloquean implementar el contrato definitivo

#### P0.1 Authority model todavía no está expresado como máquina de estados

Account V2 combina firma cotidiana, administración UUPS y un guardian único
operado desde backend. Aunque tenga timelock, una sola autoridad operativa capaz
de iniciar reemplazo total es un blast radius excesivo.

**Corrección:** separar nonces y thresholds de `spend`, `admin` y `recovery`;
guardian set N-of-M; GatoPago opcional y siempre insuficiente; recovery sólo
propone una nueva configuración, con 72h, veto y sin movimiento/upgrade en el
mismo paso.

Una cuenta con una sola passkey empieza `BOOTSTRAP`: puede recibir y agregar un
factor independiente con prueba de ambos, pero no hacer upgrades, delegar
permisos ni entrar a adapters de alto riesgo. La promoción atómica a `ACTIVE`
instala thresholds separados. Así no se inventa un 2-of-N antes de que el
usuario posea realmente dos factores.

**Prueba de cierre:** model checking de todas las transiciones más invariants
que demuestren que ningún actor de GatoPago, por sí solo, alcanza spend/admin.

#### P0.2 No existe aún una specification firmable del consentimiento

“Enviar 100 USDC” no basta si route, fee, calldata o paymaster pueden cambiar
después. El frontend y el Worker no pueden ser la única fuente de significado.

**Corrección:** definir `ExecutionIntent` y `ExecutionPlan` canónicos. El plan
incluye chain, EntryPoint, account, calls, assets, min/max amount, fee cap,
slippage, deadline, nonce, policy version, paymaster y digest de preview. Si
cambia cualquier campo, se invalida la autorización y se vuelve a simular.

El preview web no es un trusted display: WebAuthn confirma el origen, no muestra
el calldata. Por eso admin, recovery, upgrades y límites altos requieren factor
independiente, timelock/veto o ambas cosas. Un frontend comprometido continúa
siendo un riesgo residual explícito aun con EIP-712 correcto.

**Prueba de cierre:** differential test UI/TypeScript/Solidity del digest y
tests de substitution para target, selector, chain, fee, amount y paymaster.

#### P0.3 El modelo de upgrade necesita controles más fuertes que spend

UUPS resuelve bugs corregibles, pero también es la ruta más corta a perder toda
la cuenta si `authorizeUpgrade` o el implementation target son débiles.

**Corrección:** aplicar ADR-003: admin threshold independiente, 72h, veto,
manifest encadenado, storage diff, codehash, simulación y freeze irreversible.
V3.0 no instala módulos ni ejecuta `DELEGATECALL` arbitrario.

**Prueba de cierre:** ataques de upgrade no autorizado, implementation sin
UUPS, storage collision, selfdestruct/delegatecall, replay cross-chain y brick;
además, rollback únicamente si estaba preautorizado, nunca por admin GatoPago.

#### P0.4 La dirección multichain todavía depende de artefactos futuros

La intención de una misma dirección es correcta, pero no está probada hasta
fijar compiler, dependencias, init code, deployer y codehash en cada chain.

**Corrección:** manifest generado desde build reproducible, bootstrap deployer
canónico, proxy creation code constante e init commitment. Base Sepolia,
Arbitrum Sepolia y Fuji son la matriz inicial; cada una debe producir la misma
dirección para fixtures aleatorios y el mismo runtime codehash. Monad entra
cuando pase exactamente el mismo gate.

**Prueba de cierre:** comparación automática source→artifact→CREATE2→deployed
code, no copy/paste de direcciones.

#### P0.5 El gate Slither tiene un falso sentido de cobertura

El filtro actual bloquea severidades, pero una ejecución observada no construyó
IR para rutas heredadas de firma/batch. Un scanner que no entendió una función
no la declaró segura.

**Corrección:** el gate debe fallar si hay `compilation_errors`, funciones sin
IR del first-party inheritance graph o porcentaje de cobertura inferior a
100%. Si la versión de Slither no soporta la dependencia, aislar el wrapper o
añadir una segunda herramienta (por ejemplo, semántica/invariants dedicados)
hasta cerrar la ruta.

**Prueba de cierre:** informe machine-readable con cero rutas críticas omitidas,
no sólo cero findings altos.

#### P0.6 No existe aún continuidad independiente del RP ID

Una passkey sincronizada sigue ligada al RP ID. Que GatoPago no conozca la
private key no demuestra que el usuario pueda utilizarla sin dominio/App.

**Corrección:** estado `sovereign_ready` sólo tras registrar y usar ECDSA,
ERC-1271 o guardians independientes. Publicar y probar emergency client/CLI.

**Prueba de cierre:** apagar dominio, Firebase, Workers, bundler y paymaster de
GatoPago; recuperar y barrer en todas las chains con infraestructura externa.

### P1 — Bloquean testnet pública V3 o cualquier manejo de valor real

#### P1.1 Private keys crudas y roles reutilizables

El runtime actual acepta varias private keys y permite fallbacks testnet. Eso es
conveniente para prototipo, no para mainnet.

**Corrección:** signer service/KMS/MPC, roles únicos, allowlists y budgets;
separar deployer, sponsor, router, relayer y voto de recovery. Ningún runtime de
request recibe material exportable.

#### P1.2 Manifests y registro de redes todavía son manuales

Una dirección pegada en `shared/networks.ts` puede divergir del bytecode real.

**Corrección:** generar SDK/config desde manifests firmados y artefactos; el
deploy preflight lee codehash onchain y rechaza drift. Configuración manual sólo
puede deshabilitar, nunca promover.

#### P1.3 Falta lifecycle real de passkeys y recovery

Unit tests y D1 no demuestran que otra credencial firme después de retirar la
primaria ni que el flow sobreviva navegadores reales.

**Corrección:** matriz iOS Safari/PWA, Android Chrome/gestor, desktop y llave
física. Probar cancelación, timeout, credential existente, user gesture,
`allowCredentials` y errores `InvalidStateError` sin bucles.

#### P1.4 Provider trust todavía no está modelado por operación

Health global no equivale a confianza para balance, nonce, simulación, receipt
y finality. Un único RPC puede mentir de manera coherente.

**Corrección:** política por clase: lectura no crítica puede usar cache; firma y
settlement requieren proveedores independientes/quorum o verificación de block
hash; liveness y readiness separados; circuit breaker con último estado sólo
para UX, nunca para autorización monetaria.

#### P1.5 Seguridad multichain no es atómica

Una chain no sabe que otra retiró una llave. Mientras una instancia no reciba el
nuevo manifest, el anterior sigue siendo autoridad onchain y un signer
comprometido puede usarlo directamente aunque la App muestre “bloqueado”.

**Corrección:** cambios planificados con `prepare/commit` y acknowledgement de
todas las chains; emergencia con freeze/recovery broadcast por múltiples
relayers; estado `needs_security_sync` visible y prohibición de nuevos flows
App/Payments. La indisponibilidad de una chain se documenta como riesgo
residual, no como atomicidad ficticia.

#### P1.6 Activos “EVM genéricos” pueden ser hostiles

Soportar cualquier address no permite tratarlo como dinero seguro.

**Corrección:** tiers de confianza, balance delta, decimals/metadata no
autoritativos, límites de gas, cuarentena y adapters exactos. Unknown nunca
entra automáticamente en fiat total, fee calculation, routing o approvals.

#### P1.7 Pago, intent y webhook requieren properties de concurrencia

La implementación local ya avanza hacia attempts concurrentes y winner
onchain, pero V3 debe especificar la propiedad, no heredar tablas históricas.

**Corrección:** varias autorizaciones pueden coexistir; el contrato decide
atómicamente el primer settlement válido; D1 converge por receipt/evento;
idempotency y finality impiden dobles efectos; intent expira sin bloquear el
link.

`SettlementDestination` debe estar aprobada por el merchant mediante firma de
su account/wallet o ceremonia B2B de step-up. El route signer sólo autoriza la
ruta y nunca puede escoger otra destination. Cambiar la revisión invalida
quotes pendientes y genera aviso/timelock según riesgo.

#### P1.8 Observabilidad puede filtrar o amplificar datos

El 100% de invocation logs explica ruido y aumenta riesgo/coste. Paths, UID,
wallet, hashes y errores pueden correlacionar actividad financiera.

**Corrección:** taxonomía de datos, redacción central, sampling por entorno,
eventos de seguridad separados, retención mínima y prohibición explícita de
authorization, capabilities, raw signatures, email y calldata sensible.

#### P1.9 API B2B necesita aislamiento tenant-first

Separar Worker no basta si keys, idempotency, merchants o webhooks no tienen
scope de tenant.

**Corrección:** claves hasheadas y versionadas, scopes, expiry, rate/budget,
`tenant_id` en constraints, idempotency namespace por tenant, SSRF-safe webhook
egress, firma HMAC con rotation ID y replay window.

#### P1.10 Un cliente PWA obsoleto puede preparar semántica retirada

El service worker puede conservar JavaScript anterior mientras backend,
EntryPoint o manifests avanzan. Un build antiguo no debe iniciar una ceremonia
de fondos sólo porque todavía carga.

**Corrección:** cada mutación declara `client_release_id`, generation y
manifest version. El backend publica `minimum_mutating_release`; una versión
retirada sólo lee y exige actualización. El refresh nunca ocurre a mitad de
WebAuthn/UserOperation y N/N-1 tiene deadline y telemetría.

#### P1.11 La procedencia Solidity local no está demostrada

`foundry.lock` fija revisiones de `forge-std` y OpenZeppelin, pero en este
checkout los directorios `contracts/lib/*` no conservan metadata Git. Foundry
advirtió que esperaba los commits fijados y, al buscar hacia arriba, reportó el
HEAD del repositorio padre. El código compiló; eso no demuestra que el contenido
local corresponde a los commits declarados.

**Corrección:** instalación limpia desde revisiones fijadas en CI y entorno
local reproducible, más manifest de hashes de contenido/artefactos. El build de
release falla —no advierte— ante dependencia ausente, dirty o con checksum
distinto. El hash de dependencia entra al Deployment Manifest y provenance.

### P2 — Deuda que debe resolverse antes del release candidate

- fijar pragma exacto en todo first-party Solidity; hoy conviven `^0.8.27`,
  `^0.8.34` y `0.8.34` aunque Foundry fija compilador;
- unificar Semgrep local/CI; hoy requirements y workflow fijan versiones
  diferentes;
- reemplazar el `RegExp` dinámico del guard de deploy por parseo JSONC o claves
  literales, aunque el input actual sea interno;
- hacer que gitleaks sea reproducible localmente además de CI;
- estabilizar Redocly/Node en Windows: `pnpm verify` validó OpenAPI pero una
  ejecución terminó por assertion de libuv; el lint aislado con telemetría y
  update notifier desactivados sí terminó en cero;
- SBOM, provenance y firma de artefactos de contratos/Workers/frontends;
- límites y eviction explícitos para caches globales de datos resueltos;
- revisar cada `waitUntil`: sólo side effects idempotentes y no esenciales para
  la respuesta económica;
- documentar RTO/RPO, backup/restore, DLQ, reorg, key compromise y domain loss;
- definir criterios medibles para extraer un tercer Worker o shard D1, sin
  anticipar microservicios.

## 6. Arquitectura de confianza resultante

```text
Dispositivo / passkey
  firma consentimiento final
          |
          v
Frontend no confiable ── Firebase: identidad de producto, no fondos
          |
          +── App Worker ── App D1 / App Queue
          |       └── ChainExecutionPort
          |
          └── Payments Worker ── Payments D1 / Outbox / Queue
                  └── Route / Settlement ports

Puertos reemplazables
  RPC | bundler | paymaster | signer service | indexer | bridge | swap
          |
          v
Account V3 / Routers versionados
  única autoridad económica: reglas onchain + firma válida + evidencia final
```

El frontend, Firebase, Workers, D1, Queue y proveedores son componentes que
pueden fallar o ser hostiles. Ayudan a preparar, retransmitir y explicar; no
obtienen autoridad implícita sobre la cuenta.

## 7. Protocolo seguro de una operación

1. El usuario expresa un resultado: destinatario y monto/activo.
2. El Worker obtiene balances/nonces desde la política RPC apropiada.
3. Quote Engine construye alternativas y límites, no una autorización.
4. Policy Engine elimina routes/assets/providers no permitidos.
5. Se fija `ExecutionPlan`, incluyendo fee/paymaster y deadline.
6. Simulación independiente devuelve efectos esperados y riesgo legible.
7. El cliente verifica digest y pide gesto WebAuthn sobre el plan definitivo.
8. Bundler sólo transmite; si rechaza o cambia el paymaster, se vuelve al paso 5.
9. Receipt se observa y después alcanza finality según chain.
10. D1 y outbox convergen idempotentemente; webhook no precede a la evidencia.

Para `useMax`, el usuario no introduce un número fabricado por la UI. Firma una
intención acotada; el backend resuelve balance exacto en un bloque, reserva gas
nativo cuando corresponde, fija monto final y vuelve a mostrar/simular antes de
la firma.

## 8. Recovery y upgrades: máquina de estados mínima

```text
ACTIVE
  ├─ proposeRecovery -> RECOVERY_QUEUED
  │      ├─ cancel por signer/guardian -> ACTIVE
  │      └─ timelock + threshold -> RECOVERY_READY
  │             └─ activate sólo signers -> ACTIVE
  └─ proposeUpgrade -> UPGRADE_QUEUED
         ├─ cancel/veto -> ACTIVE
         └─ timelock + admin threshold + manifest -> ACTIVE(new impl)
```

Reglas:

- no existe una transición `recovery + transfer` ni `recovery + upgrade`;
- cada propuesta tiene nonce, predecessor, validez y scope;
- un signer retirado no autoriza versiones posteriores;
- una chain atrasada se marca `needs_security_sync`; la UI no la oculta;
- la cuenta conserva una ruta core para cancelar, salir y congelar aunque un
  adapter externo esté pausado o roto.

Entre chains, `prepare/commit` reduce la ventana para cambios planificados pero
no crea una transacción atómica global. En emergencia se intenta congelar todas
las instancias en paralelo; una chain caída conserva el manifest previo hasta
que acepte la actualización.

## 9. DeFi sin contaminar la cuenta

V3 deja la puerta abierta porque una smart account puede ejecutar `CALL`, no
porque integre lending desde el día uno. Una integración futura debe pasar:

1. adapter sin `DELEGATECALL`;
2. protocolo/chain/contract/codehash explícitos;
3. selectors y assets mínimos;
4. approval exacto o temporal, revocado al terminar cuando sea posible;
5. slippage/deadline/health/oracle modelados;
6. simulación de entradas, salidas y posición residual;
7. tests de protocolo pausado, insolvente, upgradeado y token hostil;
8. disclosure: riesgo DeFi no es riesgo de custodia GatoPago;
9. kill switch del adapter que nunca bloquea retiro directo desde la cuenta;
10. auditoría separada antes de promoverlo desde laboratorio.

## 10. Properties de seguridad que preceden al código

Estas propiedades se convierten en unit tests, fuzz/invariants y, donde sea
posible, verificación formal. No se consideran satisfechas por una revisión
visual:

1. **Execution authorization:** ningún `CALL` cambia estado salvo desde el
   EntryPoint/self y con threshold `spend` válido para el digest exacto.
2. **Domain separation:** una firma válida para otra chain, EntryPoint, account,
   generation, nonce space o deadline nunca valida.
3. **Initialization uniqueness:** para un `accountId`, sólo el Initial Manifest
   comprometido puede inicializar la address y sólo una vez.
4. **Verifier permanence:** cambiar registry/backend no cambia el código o
   semántica de un signer existente.
5. **Recovery non-spending:** ninguna transición recovery ejecuta calls,
   transfiere activos o actualiza implementación.
6. **Upgrade isolation:** `spend` por sí solo nunca actualiza; admin threshold,
   timelock, predecessor y codehash son necesarios.
7. **Core liveness:** fallo/pausa de adapter, router, paymaster, bundler o
   GatoPago no elimina ejecución self-funded ni salida autorizada.
8. **Manifest monotonicity:** version y predecessor no retroceden ni saltan;
   replay aplicado no cambia estado.
9. **Batch semantics:** V3.0 es atómico; si una call falla, todas revierten. No
   existe `allowFailure` implícito.
10. **Fee bound:** fee efectiva nunca excede la policy/quote/maximum firmada y
    fee cero no puede convertirse en positiva por configuración tardía.
11. **Settlement at-most-once:** un intent acepta como máximo un settlement
    final; attempts fallidos o concurrentes no bloquean ni duplican el efecto.
12. **Evidence before effects:** webhook, balance disponible y `completed` no
    preceden receipt/event/finality requeridos.
13. **No hidden chain authority:** ninguna instancia EVM puede cambiar otra;
    sync parcial se reporta, no se interpreta como commit global.
14. **Exit independence:** existe una secuencia finita para retirar asistencia,
    revocar permisos y barrer usando signer/gas/RPC externos.

## 11. Gates de implementación y release

### Gate A — Antes de escribir Account V3 definitivo

- [ ] interfaces de spend/admin/recovery y state machines aprobadas;
- [ ] structs/digests EIP-712 y replay domains congelados;
- [ ] storage layout/namespaces y upgrade/freeze specification;
- [ ] deterministic deployment proof diseñado;
- [ ] formal properties e invariants enumerados;
- [ ] threat model revisado independientemente.

### Gate B — Antes de integrar la App

- [ ] misma dirección/codehash en Base Sepolia, Arbitrum Sepolia y Fuji;
- [ ] counterfactual receive + first spend por chain;
- [ ] passkey A/B y signer independiente reales;
- [ ] provider A→B→self-funded;
- [ ] asset fixtures hostiles;
- [ ] Security Manifest sync y divergencia visible.

### Gate C — Antes de Payments/B2B

- [ ] digest compartido TypeScript/Solidity;
- [ ] concurrent attempts y winner onchain;
- [ ] local/cross-chain success, revert, timeout, reorg y retry;
- [ ] fee zero/default y fee acotada sin cambio de cuenta;
- [ ] webhook SSRF, HMAC, replay, ordering e idempotency;
- [ ] aislamiento tenant/rate/budget demostrado.

### Gate D — Antes de cualquier mainnet

- [ ] cero critical/high; cada medium tiene aceptación, owner y fecha;
- [ ] auditoría externa de account/factory/verifier/recovery/upgrade y de routers;
- [ ] Slither/segunda herramienta sin rutas first-party omitidas;
- [ ] fuzz, invariants, differential, fork y chaos sin skips;
- [ ] keys crudas eliminadas y roles/KMS ensayados;
- [ ] deploy reproducible, verified source, SBOM y provenance;
- [ ] migración RP ID terminada y rollback probado;
- [ ] emergency exit drill en cada chain con GatoPago apagado;
- [ ] incident response, pause scope, RTO/RPO y comunicaciones ensayados;
- [ ] autorización explícita para mainnet.

## 12. Pruebas obligatorias

### Contratos

- invariants de saldo, nonce, threshold, signers y manifest predecessor;
- replay entre chain IDs, EntryPoints, accounts, generations y security versions;
- WebAuthn/P-256 malleability, malformed ABI, AAGUID/credential edge cases;
- ERC-1271 y ERC-7913 verifier mutable/reentrante/revert/gas bomb;
- init front-run, CREATE2 collision, duplicate initialization;
- upgrade storage collision, unauthorized implementation y freeze;
- malicious receiver/token callbacks y batches parcialmente fallidos;
- paymaster validation/postOp griefing y depleted deposit.

### Workers y datos

- auth bypass, IDOR, mass assignment, body/JSON bombs y rate limit;
- D1 concurrent writers, retry, partial failure, restore y semantic checksum;
- Queue at-least-once, out-of-order, poison message y DLQ replay;
- RPC stale/malicious, quorum disagreement, finality y reorg;
- egress SSRF/DNS rebinding para webhooks;
- logs sin PII/secrets en éxito y error;
- rollback N/N-1 con deadline, sin doble escritura indefinida.

### Producto real

- passkey A/B en dispositivo y gestor distintos;
- pérdida de sesión, dispositivo y dominio;
- 100% de saldo nativo/ERC-20 con gas reserve correcto;
- usuario cancela cada ceremonia sin loops ni side effects;
- balance pendiente/observado/finalizado sin falsas confirmaciones;
- payment link atacado por visitantes concurrentes;
- merchant recibe exactamente el settlement acordado;
- salida independiente y borrado offchain sólo al final.

## 13. Criterios de escalabilidad

La arquitectura escala primero separando ownership y trabajo asíncrono, no
contando Workers:

- App y Payments escalan independientemente;
- Durable Object serializa únicamente claves que de verdad requieren exclusión;
- Queue absorbe reconciliación/indexación/webhooks;
- D1 se particiona por tenant o dominio sólo al alcanzar tamaño, hot-key o
  throughput medido; nunca se promete una transacción entre shards;
- puertos permiten extraer `ChainExecution`, `WebhookDelivery` o `Indexer` sin
  cambiar API ni account;
- un tercer deployment requiere SLO/blast-radius/compliance/ownership medible,
  no preferencia estética.

## 14. Estado honesto después de esta revisión

| Afirmación | Estado |
|---|---|
| Dirección V3 coherente | sí, con ADRs cerradas en `DECISIONES-BASE-V3.md` |
| Contrato V3 implementado | no |
| Account V2 apta como V3 | no; sirve como evidencia/prototipo, no como base a conservar |
| DeFi posible después | sí, por adapters; fuera de V3.0 |
| Stellar bloquea V3 | no |
| Mainnet autorizado/listo | no |
| Cero vulnerabilidades | afirmación imposible; existen gates y riesgos residuales |

## 15. Fuentes primarias

- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7913](https://eips.ethereum.org/EIPS/eip-7913)
- [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492)
- [ERC-7201](https://eips.ethereum.org/EIPS/eip-7201)
- [EIP-7951](https://eips.ethereum.org/EIPS/eip-7951)
- [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579)
- [OpenZeppelin Accounts](https://docs.openzeppelin.com/contracts/5.x/accounts)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [FIDO Credential Exchange specifications](https://fidoalliance.org/specifications-credential-exchange-specifications/)

## 16. Documentos vinculados

- [Decisiones base V3](./DECISIONES-BASE-V3.md)
- [Arquitectura objetivo V3](./ARQUITECTURA-OBJETIVO-V3.md)
- [Radar ERC/EIP](./RADAR-EIP-ERC-V3.md)
- [Stellar futuro, soberanía y API](./STELLAR-SOBERANIA-API-V3.md)
- [Threat model visual](./diagrams/26-threat-model-v3.puml)
