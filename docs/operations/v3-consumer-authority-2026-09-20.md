# Account V3.0 — autoridad consumer y continuación local

Fecha: 20 de septiembre de 2026. Alcance: candidato para **Arbitrum Sepolia**.
Estado: implementación local parcial de V3, **sin despliegue ni admisión pública**.
Sustituye el perfil contractual de recovery/guardianes del informe anterior del
mismo día; no declara terminada la aplicación ni el objetivo histórico.

## Decisión implementada

- Una passkey inicial: SPEND=1, ADMIN=1. No exige segunda llave ni activación
  posterior con guardianes para tener autoridad contractual después de crearla.
- Respaldos opcionales, equivalentes: 1-de-N para gasto y administración consumer.
  Cualquiera puede gastar, cambiar signers y autorizar upgrades sujetos a sus
  controles. No se promete seguridad multifactor o tolerancia a una llave robada.
- Añadir una llave exige autorización ADMIN de la política actual y prueba de
  posesión de la nueva. Los cambios de rol también exigen consentimiento del
  afectado. El commit exige autorización fresca de la política anterior.
- No se permite una política vacía, sin SPEND/ADMIN alcanzables, con claves físicas
  duplicadas o más de 16 miembros. La última autoridad no puede simplemente borrarse.
- No existen RECOVERY, assisted signer, recuperación por correo/soporte, guardianes
  o veto de un miembro por el mero hecho de ser miembro.
- Cancelar una propuesta concreta exige ADMIN actual y consume su nonce. Un
  SPEND-only no cancela. **Con ADMIN=1, un administrador comprometido sí puede
  cancelar repetidamente y cambiar controles**: tradeoff explícito, no bypass oculto.
- Perder todas las llaves implica perder acceso. GatoPago no puede restablecerlo.

La biblioteca genérica conserva ECDSA, WebAuthn, ERC-1271 y quorums configurables,
con controles de alcance y posesión. No se publica una nueva UI multisig ni se
convierte un antiguo guardián automáticamente en ADMIN. El perfil consumer
construido por shared es WebAuthn 1/1; la app no cambia a 2/N al añadir respaldos.

## Contratos y compatibilidad

Se retiraron del runtime activo los campos, funciones, digests y estados de
recovery/assisted/veto/bootstrap. Sólo quedan propuestas Security y Upgrade,
además de None. Permanecen CREATE2, identidad inicial inmutable, validación de
posesión en creación, ERC-4337, ejecución directa, EIP-712, nonces separados,
versiones, rechazo de replay y reentrancia, freeze irreversible de upgrades,
timelock de upgrade, migración exacta y verificación de bibliotecas enlazadas.

Cambió el dominio EIP-712 a `3.0-consumer`, el encoding de políticas y el layout:
`0xdcd24b64ea3d183f0c8ec0cf5f2f5a3ed15545805791416ab100c3a0ca160f49`.
El snapshot de seguridad reserva la palabra 8 como revisión de wire=1. Ese
marcador **no autentica por sí solo un contrato**: identidad, manifiesto,
implementación, layout, bibliotecas y codehashes deben verificarse juntos.

Es un corte limpio de candidato testnet, **no una migración compatible del
storage anterior**. No reutilizar firmas, ABI, manifests, direcciones calculadas
ni release pins anteriores. CREATE2 no actualiza un contrato por sí mismo.
Inicialización/factory/implementación original y revisión actual siguen separadas.

## Integración realizada y límites

- Shared: políticas, autorizaciones, ABI de inicialización/cambio, inspección,
  firma de transferencias y vectores de paridad actualizados.
- Backend: inspección/proyección de creación reconoce la política inicial activa;
  lecturas y serialización de cambios de seguridad usan el nuevo formato.
- D1: `server/v3/migrations/0007_account_creation_projections.sql` ahora exige
  `active_policy` en el **baseline V3 local no desplegado**. Una base de desarrollo
  con el baseline anterior requiere recreación explícita; no se recreó ninguna
  base persistente ni se ejecutó una migración remota en este trabajo.
- Web: creación ya no encadena guardianes obligatorios. Se retiraron
  `ActivationOperationPanel`, el flujo UI específico de guardianes, su fixture,
  el constructor `independentRecovery` y sus pruebas exclusivas. Son archivos
  versionados recuperables desde Git, no datos del usuario. No se modificaron
  las eliminaciones previas del dashboard ni se deshicieron cambios de Next/Tailwind.
  La pantalla informativa de acceso conserva su ruta y diseño, pero ya no ofrece
  guardianes, reemplazo por soporte ni un periodo de recuperación inexistente.
- La revisión opcional de passkeys es sólo un borrador; **el alta/retiro completo
  desde la UI aún no está integrado**. La prueba contractual sí verifica alta de B
  autorizada por A, retiro de A autorizado sólo por B y posterior envío con B.
- Se conservaron parsers, transporte, commit, persistencia y pruebas de
  idempotencia aplicables. Algunos identificadores internos aún dicen
  `bootstrapActivation`/`activation` y el lifecycle expone `bootstrap` como nombre
  histórico de proyección: no representan otro modo contractual. El compilador
  de primer respaldo sólo opera desde la política inicial/version 1; aún no es
  un gestor genérico de cambios sucesivos de llaves.

La app no debe presentar dirección lista para recibir hasta verificar creación
en esa red. Una dirección contrafactual puede recibir por fuera de la UI; una
autorización expirada más pérdida del signer inicial sigue pudiendo inmovilizar
esos fondos. No se añadió un bypass de inicialización.

## Evidencia local

Comandos ejecutados el 20/09/2026, aproximadamente 19:40–20:05 Bolivia. Cada
fila expresa su alcance, no una validación humana o de producción.

| Comprobación | Resultado |
|---|---|
| `forge test --match-contract AccountV3 --summary` | 254 pruebas, 19 suites, sin fallos ni omisiones; incluye fuzz/invariants |
| `pnpm --filter server exec vitest run test/v3 --reporter=dot` | 712 pruebas / 37 archivos; incluye Anvil local y firmas sintéticas verificadas |
| `pnpm --filter @gatopago/web exec vitest run --reporter=dot` | 879 pruebas / 33 archivos; no equivale a navegador/dispositivo real |
| TypeScript web, server y `typecheck:worker-runtime` | PASS |
| ESLint web | PASS |
| `pnpm --filter @gatopago/web build` | PASS, Next.js; sin sesión ni endpoints operativos |
| `pnpm --filter server build:v3:local` | PASS, Wrangler `--dry-run`; **no despliegue** |
| `forge lint --severity high med low --deny warnings` | PASS; supresiones puntuales justificadas sólo para reloj sintético de tests |
| `node scripts/v3-protocol-vectors.mjs` | PASS, paridad de encoding TypeScript/Solidity |
| `node scripts/v3-storage-layout.mjs` | PASS, layout compilado aislado, alteraciones rechazadas; 546 fuentes/dependencias verificadas |
| `node scripts/v3-contract-build-manifest.mjs --self-test` | PASS, seis artefactos / 60 fuentes; `admitted=false` |
| Schemas y encoding WebAuthn | PASS, validators y bytes ABI coinciden |
| Runtime Worker/D1, cuatro archivos dirigidos | 87 PASS: creación, jobs, commit y proyección de política |
| `pnpm --filter server exec vitest run --config vitest.v3-worker.config.ts --reporter=dot` | **1.217 PASS / 43 archivos**, sin fallos ni omisiones; D1/workerd locales, proveedores sintéticos |

El primer runtime completo detectó fixtures antiguos y el CHECK de D1 obsoleto;
no fue evidencia aprobatoria. Se corrigieron y se volvieron a ejecutar las cuatro
áreas afectadas. El runtime completo final pasó tras actualizar cuatro
expectativas restantes del perfil retirado. Sus avisos de secretos faltantes
corresponden a la configuración base; las pruebas usan bindings sintéticos,
no credenciales de producción ni servicios de autenticación reales.

El inventario de artefactos rechazó inicialmente un output ABI-only sin metadata
dejado por compilaciones auxiliares. Se recompiló con `forge build --force
--extra-output metadata` y pasó el self-test; no se debilitó el verificador.
El descriptor web local se actualizó tras revisar el cambio de entradas:
`web-v3-dd8d4ed2f69f833d3317b68603969f2053a6d5738a186831d915cd2ccd98e853`
(229 entradas normalizadas). Este hash describe el árbol local, no un commit
publicado ni un deploy aprobado.

Se retiraron pruebas de características eliminadas, no se marcaron como omitidas:
las cifras nuevas no son directamente comparables con el candidato previo. Las
pruebas negativas ahora rechazan roles/formatos retirados; siguen existiendo
pruebas de quorum genérico, cancelación ADMIN, upgrades, reentrancia y replay.
Foundry advierte que las carpetas vendorizadas no son checkouts de sus commits;
el guard de integridad de contenido sí pasa. Esto no es auditoría externa.

## Gas y bloqueo de admisión

La prueba consumer usa AccountV3 exacto, EntryPoint real local y WebAuthn con
verificación P256 software real. La firma usa claves matemáticas públicas de
test: **no es una ceremonia iPhone/Android**. El token ERC20 de seis decimales es
sintético, no USDC financiado en Arbitrum Sepolia.

| Operación | Gas `handleOps` local caliente | Packed ABI |
|---|---:|---:|
| Crear con una passkey | 1.413.196 | 3.296 bytes |
| Enviar todo el saldo del token fixture | 490.308 | 1.952 bytes |

No son estimaciones RPC, verificationGas aislado ni coste total de Arbitrum.
La prueba negativa con 496.000 verification gas falla con AA13 en creación
software y revierte sin desplegar ni consumir fondos/nonce. No se aumentaron
límites remotos ni se reemplazó WebAuthn para ocultarlo.

Runtime compilado aislado: Account 19.426 B, Security 17.691 B, Upgrade 10.436 B,
Factory 8.496 B y Proxy 232 B. Tamaño admisible no demuestra admisión ERC-4337.
Faltan P256 nativo en la red objetivo, simulación, aceptación del bundler,
patrocinio y fallback autofinanciado, todo con credenciales reales.

## Qué no queda cerrado

1. Prueba real de creación/envío WebAuthn en Arbitrum Sepolia y admisión de gas.
2. UI de gestión de respaldos y recorrido cross-device; no se copia la clave
   privada ni se infiere independencia de gestores por contar passkeys.
3. Kit de salida usable sin GatoPago/dominio. La ejecución directa existe; una
   passkey ligada al RP no garantiza acceso si desaparece ese dominio. Una firma
   ECDSA genérica en tests tampoco configura esa salida para usuarios consumer.
4. Recorrido de producto completo: crear → enviar USDC → observar inclusión y
   finalidad → reconciliar saldo → liberar reserva con evidencia → comprobante,
   sobreviviendo recarga y respuesta de submit perdida. No lo demuestra Forge.
5. Manifiesto de despliegue enlazado, revisión independiente y pruebas humanas.

Sin commit, push, deploy, DNS, secrets, fondos públicos, migraciones remotas ni
activación mainnet. Los pins de release no se rellenaron. Las guías de Solidity/
OpenZeppelin orientaron los controles conservados y pruebas adversariales;
las de Workers/React, la separación de autoridad y ausencia de ceremonias al
renderizar. No se declaró completo V3.
