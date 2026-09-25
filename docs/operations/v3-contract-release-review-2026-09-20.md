# Account V3: regularización y cierre local del candidato

> **Revisión histórica anterior a la decisión consumer del mismo día.** Sus
> referencias a recovery, veto, bootstrap y 272 pruebas NO describen el candidato
> actual. Véase [la continuación y evidencia vigente](v3-consumer-authority-2026-09-20.md).
> Se conserva este informe como trazabilidad, no como instrucciones de despliegue.

Fecha: 2026-09-20. Objetivo de release: **Arbitrum Sepolia solamente**.
Estado: **NO completado, NO admitido para despliegue ni pagos**.

Se conserva el candidato Account V3. No se cambiaron autoridades, quorum, layout,
timelocks, inicialización, firmas ni política de veto. No se añadieron capacidades
económicas. Los cambios de comentarios Solidity también pueden cambiar metadata,
bytecode e identidades CREATE2: no reutilizar hashes anteriores automáticamente.

## Resultado por punto de revisión

| Punto | Estado | Evidencia y límite |
|---|---|---|
| Veto | Comportamiento implementado y probado; política pendiente | Un miembro assisted puede cancelar tres recuperaciones sucesivas aprobadas únicamente por los dos miembros independientes. Una passkey SPEND-only también puede emitir tres vetos nuevos. No es replay. |
| Recuperación contrafactual | Decisión pendiente; escenario adversarial reproducido | Dirección con ETH antes de desplegar: autorización inicial expirada falla AA22. Renovar conservando una prueba antigua del signer perdido falla AA13. El código no queda desplegado y los fondos permanecen en la dirección. Cambiar política cambia la dirección. |
| Perfil consumer | Implementado sin evidencia suficiente de admisión | Creación bootstrap WebAuthn, promoción a perfil avanzado y envío del 100% de token ERC20 de seis decimales pasan con la implementación AccountV3 exacta y EntryPoint local. Software P256 NO pasa creación con 496.000 de verification gas. |
| Upgrades | Implementado y probado localmente; cierre externo pendiente | Nueva secuencia: migración mínima → envío ERC20 por EntryPoint → recovery → salida ERC20 directa con nuevos signers. No demuestra ceremonia WebAuthn humana ni kit externo de recuperación. |
| Release | Herramientas locales implementadas; manifiesto de despliegue pendiente | Inventario de seis artefactos y 60 fuentes, compilador/configuración, enlaces e immutables. Declara admitted=false. No sustituye evidencia remota ni revisión independiente. |

## Veto: no cambiar por suposición

`AccountV3Security.veto` admite cualquier miembro actual con firma válida,
independientemente de roles y del indicador assisted. Los nonces impiden replay,
no una firma nueva por cada propuesta. El veto conserva la política antigua;
por ello un signer comprometido que sigue en ella conserva su capacidad de veto.

Beneficio: frenar una recuperación maliciosa con una sola llave legítima.
Coste: assisted o una llave comprometida pueden impedir repetidamente recuperar.
No se ha aprobado una política alternativa. Excluir assisted por sí solo NO
resuelve el caso de passkey comprometida. Las pruebas de caracterización son
evidencia de un bloqueo de release, no una aprobación del comportamiento.

## Contrafactual: límite que debe resolver el producto/protocolo

La inicialización exige posesión de todos los miembros originales dentro de su
ventana firmada. Recovery de una cuenta desplegada no permite saltarse esta
condición. No se añadieron llaves maestras, firmas del backend ni bypasses.

Para cerrar hace falta decidir y verificar una política de recepción: no presentar
direcciones no activadas como listas para recibir, o aprobar otro protocolo de
recuperación contrafactual. Restringir la UI no impide que un tercero envíe a una
dirección calculada; ese límite debe ser explícito. Tampoco basta estar desplegada
en modo bootstrap: aún hay que validar la política recuperable activa.

## Perfil medido (no perfil operativo admitido)

Se reutiliza el perfil avanzado descrito en V3 FUSION §11.7 / incremento 49:

- Bootstrap: una passkey SPEND, sin permiso de gasto hasta activación.
- Activo: passkey SPEND/ADMIN; guardián 1 ADMIN/RECOVERY;
  guardianes 2 y 3 RECOVERY; thresholds 1/2/2; demoras 72 horas; sin assisted.
- Tres guardianes ECDSA de prueba. La independencia humana no la prueba el contrato.
- Verificación WebAuthn/P256 criptográfica real con vector matemático público;
  se fuerza fallback software mediante respuesta nativa vacía, nunca éxito simulado.
- AccountV3 de producción, sin subclase de observación. EntryPoint real en Forge.
- Token sintético de seis decimales, no contrato USDC público ni fondos remotos.

Última medición local de esta serie (contexto caliente de una prueba Forge):

| Tramo | Gas local | Tamaño operación packed ABI |
|---|---:|---:|
| Creación / handleOps | 1.418.490 | 3.392 bytes |
| Activación / prepare | 1.405.642 | No es UserOperation en esta prueba |
| Activación / commit | 684.328 | No es UserOperation en esta prueba |
| Envío / handleOps | 499.738 | 1.952 bytes |

Estas cifras no son el coste de una transacción fría, una estimación RPC ni
verificationGas aislado; tampoco incluyen tarifas L1 de Arbitrum. El techo holgado
de medición es 4M de verification gas y NO configura soporte de bundler.
La prueba negativa separada confirma `AA13 initCode failed or OOG` con 496.000
en creación software P256, sin crear la cuenta ni consumir sus fondos/nonce.
Falta medir/verificar la ruta nativa en la red objetivo y la admisión ERC-7562
del bundler concreto, sin degradar la firma. Referencia:
[ERC-7562](https://eips.ethereum.org/EIPS/eip-7562).

## Evidencia ejecutada

- `node scripts/verify-solidity-dependencies.mjs`: PASS, 546 archivos.
- `node scripts/verify-entrypoint-source.mjs`: PASS, 35 archivos; commit
  `b36a1ed52ae00da6f8a4c8d50181e2877e4fa410`.
- `forge test --match-contract AccountV3`: **272 PASS, 0 FAIL, 0 SKIP, 19 suites**.
  Seis pruebas nuevas: veto assisted, veto WebAuthn, contrafactual,
  upgrade/recovery/salida, recorrido consumer y presupuesto insuficiente.
- `node scripts/v3-storage-layout.mjs`: PASS, compilación aislada, comprobación
  de layout y alteraciones. Runtime AccountV3 19.921 B, Security 19.779 B,
  Upgrade 10.680 B, Factory 9.220 B, Proxy 232 B.
- `node scripts/v3-contract-build-manifest.mjs --self-test`: PASS, seis
  artefactos / 60 fuentes; rechaza compilador diferente, enlaces faltantes y
  metadata que no coincide con las fuentes locales.
- `forge lint --severity high med --deny warnings`: PASS después de explicitar
  máscara de 48 bits y SafeCast en el fixture V3CreationFixture. El primer intento
  detectó dos conversiones preexistentes. No se afirma lint low completamente limpio.
- `forge fmt --check` sobre los cuatro archivos de pruebas tocados: PASS.
- `git diff --check`: PASS; avisos de normalización LF/CRLF.

La suite completa fue anterior al ajuste equivalente del decoder del fixture
V3CreationFixture. Después de ese ajuste, `forge test --match-contract
'AccountV3(Creation|SecurityModule)'` pasó **43 pruebas / 3 suites**, sin fallos ni
omisiones; además la suite Inspection pasó 12 pruebas. No se altera runtime de
cuenta con ese cambio. Foundry advierte que los
directorios vendorizados no son checkouts de sus commits; el guard de contenido
fijado sí pasó. Esto no se presenta como aprobación externa de dependencias.

## Inventario de build y manifiesto real

`node scripts/v3-contract-build-manifest.mjs` imprime JSON por stdout, sin
escribir archivos, contactar RPC, leer secretos ni desplegar. Incluye fuentes
Keccak verificadas contra metadata, SHA-256 de ABI/templates/metadata, referencias
del linker, immutables, configuración y estado Git. No llama runtime-codehash
a un template con placeholders. La identidad de build no es aprobación de seguridad.

Antes del despliegue sigue faltando: artefactos completamente enlazados y sus
direcciones/hash reales, constructor args, receta CREATE2, procedencia de
EntryPoint/SenderCreator/verificador, transacciones/bloques de despliegue y
admisión independiente conforme al esquema existente `shared/v3/deployment-schema.json`.
Identidad/factory/implementación inicial y la implementación actual tras upgrade
deben seguir separadas. `contracts/script/Deploy.s.sol` sigue siendo V2 y NO es
el procedimiento de release V3. Los renombres propuestos aún no se aplicaron.

## Siguiente paso y límites

Resolver explícitamente veto, recepción contrafactual y perfil/bundler antes de
declarar terminados los contratos. Después cerrar el único recorrido local:
crear → enviar USDC → inclusión/finalidad → reconciliar saldo → liberar reserva
con evidencia → comprobante. Debe sobrevivir recarga y pérdida de respuesta de
submit sin duplicar la operación. Ese cierre incluye backend y UI; no se demuestra
con una prueba Solidity. Aquí no se modificaron esas capas.

No hubo commit, push, deploy, migración, cambio de secretos, uso de wallet real,
recepción/envío en testnet pública ni mainnet. No se modificaron los routers,
paymaster ni frontend. No se completó el goal histórico ni se autorizó producción.
