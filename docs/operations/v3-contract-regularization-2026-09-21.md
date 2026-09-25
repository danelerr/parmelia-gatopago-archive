# Regularización contractual V3 — 21 de septiembre de 2026

Estado: candidato local, **no release público ni V3 completa**. Esta continuación
abarca Account V3 y los contratos reutilizables, no sólo el cambio de nombres.
No se ejecutaron commit, push, despliegues, migraciones, cambios de secretos ni
transacciones con fondos. La única consulta pública fue una prueba RPC de lectura
del verificador P256 en Arbitrum Sepolia.

## Inventario y decisiones

| Antes | Ahora | Decisión |
|---|---|---|
| AccountWebAuthnV2 / AccountFactoryV2 | `contracts/legacy/src/` | Archivados con pruebas, fuera del build/deploy activo |
| ERC7913WebAuthnVerifier histórico | `contracts/legacy/src/` | No se reutiliza como verificador V3 |
| ParmeliaPaymentRouter (facturas V1) | `contracts/legacy/src/` | Retirado del camino activo |
| ParmeliaPaymentRouterV2 | `GatoPagoPaymentRouter` | Router USDC reutilizado y probado con Account V3 |
| ParmeliaPaymaster | `GatoPagoPaymaster` | Patrocinio finito, acotado y separado del control de fondos |
| ParmeliaCctpPaymentRouter | `GatoPagoCctpPaymentRouter` | Burn de checkout; no acredita recepción en destino |
| ParmeliaCrosschainRouter | `GatoPagoCrosschainRouter` | Burn saliente con identificador aislado por pagador |
| AccountV3 y bibliotecas | `contracts/src/v3/` | Nombres de protocolo conservados; no wrappers ni aliases V2 |

Los ABIs V2 congelados de `contracts/legacy/abi/` sirven únicamente al Worker
histórico que todavía existe en el repositorio. No exigen compilar V2, ni
convierten sus endpoints en V3. El guardia `v3-contract-boundary.mjs` verifica el
código de contratos, scripts, shared V3, Worker V3 y web. No se borraron los
manifiestos históricos ni se reasignaron sus direcciones a contratos nuevos.

Las versiones de dominio EIP-712 de los routers (`2` y `1`) se conservan: son
versiones de su formato de autorización, no generaciones de smart account.
Sus nuevos nombres/bytecodes implican nuevas direcciones; el dominio también
liga cada firma a chain y dirección. El alias TS activo es `paymentRouterAbi`.

## Cambios funcionales

- Paymaster: rechaza header de otro contrato, `validUntil=0` y ventanas
  invertidas y flags de rango por bloque. Una firma incorrecta sigue devolviendo SIG_VALIDATION_FAILED;
  no se debilita la validación ERC-4337. Se conservan límites, owner de dos pasos,
  separación de sponsor y ciclo completo de depósito/stake/retiro.
- Cross-chain: `usedOpId(sender, opId)` sustituye al bloqueo global por `opId`.
  Otro pagador ya no puede consumir el identificador ajeno. El mismo pagador
  sigue sin poder repetirlo. El evento conserva sender e identificador.
- Los dos routers CCTP revocan la allowance residual al messenger al terminar.
  El cálculo de fee saliente usa `Math.mulDiv`, sin multiplicación intermedia
  que desborde. Se mantienen topes, destinos permitidos y reversión atómica.
- Checkout: conserva el primer pago ganador por intent, firma del resultado
  económico, payer obligatorio y fee separado. La nueva integración prueba
  approval + pago desde Account V3 y rollback del lote ante replay.
- No se añadió cobro por defecto, custodia, autoridad de soporte, recovery,
  redes nuevas ni funciones de producto adicionales.

La implementación respeta el perfil aprobado el 20/09: una passkey inicial
puede gastar y administrar; respaldos opcionales equivalentes 1-de-N. No es un
perfil ADMIN 2-de-N. Añadir una llave requiere ADMIN actual y posesión de la
nueva. Perder todas las credenciales significa perder acceso.

## Despliegue reproducible: dos fases explícitas

`DeployV2` ya no existe en los scripts activos. `DeployV3.s.sol` usa keystore de
Foundry, nunca claves privadas de entorno, y rechaza cualquier chain distinta
de Arbitrum Sepolia. El helper `V3Deployment` es el mismo que ejecutan las nuevas
pruebas de construcción y Consumer.

1. Construir con Solidity 0.8.34, via-IR, Cancun, optimizer=200 y dependencias
   verificadas por contenido. Ejecutar guardia, pruebas, lint y layout.
2. Generar inventario con `scripts/v3-contract-build-manifest.mjs`. Cubre diez
   artefactos y 81 fuentes, incluidas las dos bibliotecas enlazadas. Verifica
   metadatos, compilador, links y fuentes obsoletas. **`admitted=false`**.
3. Simular `DeployV3Libraries`: despliega determinísticamente Security y Upgrade
   mediante el CREATE2 deployer prevalidado. Imprime direcciones, init-code hashes
   y runtime hashes. Rechaza reutilización silenciosa de una dirección ocupada.
4. Sólo con autorización remota, ejecutar esa fase y conservar recibos reales.
   Una simulación NO permite afirmar que esas direcciones ya tengan código.
5. Compilar/simular `DeployV3` con ambos links explícitos y sus hashes revisados.
   Verifica dirección y código de cada biblioteca; no admite las bibliotecas
   implícitas que Foundry pudiera desplegar automáticamente.
6. Desplegar y verificar implementación, factory y verificador sólo después de
   aprobar la simulación. Se comprueban las tres predicciones CREATE2.
7. Recoger transacciones, bloques canónicos, fuente verificada, código runtime y
   constructor args. Admitir el manifiesto de red sólo tras revisión independiente.
   Los pins actuales no se rellenan con direcciones de simulación.

Ejemplo PowerShell de **simulación**, desde `contracts/`:

```powershell
forge script script/DeployV3.s.sol:DeployV3Libraries `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --account <keystore> --sender <deployer>

# Las siguientes variables son direcciones/hashes públicos revisados, no secretos.
# GATOPAGO_V3_SECURITY_LIBRARY / GATOPAGO_V3_UPGRADE_LIBRARY
# GATOPAGO_V3_SECURITY_LIBRARY_CODEHASH / GATOPAGO_V3_UPGRADE_LIBRARY_CODEHASH
forge script script/DeployV3.s.sol:DeployV3 `
  --libraries "src/v3/AccountV3Security.sol:AccountV3Security:$($env:GATOPAGO_V3_SECURITY_LIBRARY)" `
  --libraries "src/v3/AccountV3Upgrade.sol:AccountV3Upgrade:$($env:GATOPAGO_V3_UPGRADE_LIBRARY)" `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --account <keystore> --sender <deployer>
```

Estos comandos no se ejecutaron contra la red. No añadir `--broadcast` sin
autorización y release revisado. Los rails auxiliares están en `Deploy.s.sol`:
`DeployPaymaster`, `DeployPaymentRouter`, `DeployCctpPaymentRouter` y
`DeployCrosschainRouter`. No son un requisito para desplegar la cuenta; CCTP no
entra en el primer recorrido Consumer de Arbitrum Sepolia.

Identidad inicial y estado actual son distintos: factory + implementación
inicial + proxy initCode definen la creación. Un upgrade no modifica esa
identidad. La implementación actual se inspecciona por cuenta con su manifiesto
admitido, layout y hashes de bibliotecas. CREATE2 no actualiza contratos viejos.

## Evidencia local y pública

21/09, aproximadamente 07:25–07:27 Bolivia:

- `forge test --summary`: **379 pasaron, 0 fallaron, 4 forks omitidos**, 31 suites.
  Incluye fuzz/invariantes, upgrade con migración mínima y uso posterior,
  seguridad, P256 software, EntryPoint local y rails reutilizados.
- `AccountV3ConsumerProfileTest`: 8 pruebas, incluidas creación patrocinada sin
  ETH, cambio de paymaster, fallback autofinanciado, checkout atómico, ambos burns
  CCTP y retirada de llave seguida de salida directa.
- `AccountV3DeploymentTest`: 3 pruebas de predicciones/composición/identidad,
  rechazo de reuso y rechazo de mainnet.
- `pnpm --filter server exec vitest run test/v3 --reporter=dot`: **712**, 37 archivos.
- TypeScript Payments y prueba dirigida `reconciliationEvidence.test.ts`: **6**.
  La suite completa de unidades Payments también pasó: **52 pruebas**, 13 archivos.
- Web: **879 pruebas**, 33 archivos, y TypeScript sin errores. Server TypeScript
  también pasó; no son pruebas humanas ni un despliegue del frontend.
- Tras endurecer el bit de rango temporal del paymaster se repitieron sus **19**
  pruebas y las **8** de integración Consumer: todas pasaron.
- Lint Foundry, guardia V3, integridad de dependencias y vectores TS/Solidity:
  pasaron. El paymaster conserva el layout anterior; V3 tiene su guardia propio.
- La primera ejecución de TS durante la reconstrucción limpia falló por artefactos
  `out/` todavía ausentes. Se repitió después de compilar y pasó. No era evidencia
  válida de integración hasta terminar la compilación.

Revisión estática con Slither 0.11.5 (la CI fija 0.11.6): 45 observaciones,
ninguna alta. Se revisaron 14 medias: 11 escalares con inicialización cero de
Solidity y 3 retornos diagnósticos/de validación intencionalmente descartados.
`contracts/slither-reviewed.json` registra cada excepción exacta, explicación y
hash de fuente normalizado. El gate rechaza cambios de fuente, nuevos hallazgos
y cualquier alto; sus pruebas de alteración pasan. No es una auditoría
independiente ni un permiso para ignorar warnings futuros. Las observaciones
bajas incluyen ventanas temporales deliberadas, código assembly acotado,
guardas de reentrancia ya presentes y nombres de constantes.

Consulta pública **sólo de lectura** `v3-p256-capability.mjs`, 11:23:48 UTC:
chain 421614, bloque `0x128c7bd2`, hash
`0xaf8cd273704d1f20ede917118dcaa468ebbedde3a058da43b8a8ce1e8d5d865c`.
Precompile `0x100`: firma válida aceptada y digest alterado rechazado.
Estimación RPC de esa llamada: **31.938 gas**. Es un fixture Chromium público,
no una ceremonia nueva ni el coste de crear/enviar desde Account V3.

La medición local software-P256 sigue siendo ~1.413.196 gas para `handleOps` de
creación y ~493.608 para envío (contexto local caliente, no sólo validation gas).
La prueba negativa de creación con techo 496k sigue fallando correctamente.
Disponibilidad de P256 nativo no equivale a admisión pública ERC-4337.

Referencia normativa para datos de validación:
[ERC-4337](https://ercs.ethereum.org/ERCS/erc-4337). La política del producto
prohíbe aquí la ventana infinita que el estándar permite expresar con cero.

## No confundir con cierre de V3

Siguen pendientes el manifiesto desplegado/admitido, simulación y aceptación del
bundler público, UserOperation patrocinada real y fallback real. Ningún contrato
se ha desplegado con estos cambios y no hay evidencia de pagos con fondos.

Tampoco se afirma que este trabajo complete la UI de administración de passkeys,
enrolamiento Android/iOS, kit de salida independiente del dominio ni el recorrido
Consumer completo con recarga/respuesta perdida, reconciliación, liberación de
reserva y comprobante. Las pruebas de contratos no sustituyen esos incrementos
ni las pruebas humanas. La salida directa contractual no elimina por sí sola
la dependencia RP ID de las passkeys.

Los archivos nuevos/renombrados y snapshots deben incluirse juntos en el próximo
commit autorizado. No publicar sólo los `.sol`: faltarán ABIs, scripts y pruebas.
