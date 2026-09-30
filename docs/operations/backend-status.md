# Estado de los backends

Documento vigente de la regularización V3. Los informes sucesivos del 25/09/2026 están en [archivo](archive/2026-09-25/v3-backend-renewal-2026-09-25.md); sus cifras y pendientes describen revisiones anteriores.

La iteración de passkeys y BD del 28/09 reemplaza parte de ese árbol y pasó
la validación local; falta el smoke integrado de staging. Su estado y evidencia están en [el plan de implementación](../architecture/PLAN-PASSKEY-BD-V3.md).
El `verify:ci` y las cifras de archivos/pruebas de este informe corresponden al
cierre anterior; no certifican los cambios nuevos ni un despliegue de éstos.

## Código actual

Wallet Core (`gatopago-wallet-core`) contiene identidad, credenciales, cuentas, creación, primer respaldo opcional, balances y transferencias personales. Flow (`gatopago-flow`) contiene el dominio comercial y posee su propia base y colas. Ambos usan un único esquema inicial para bases nuevas. No hay runtime ni adaptadores Account V2.

Los comandos, configuración y CI usan los nombres actuales. Se retiraron los aliases del frontend anterior, variables Vite, exclusiones de sus builds y dependencias sin consumidores. Knip y su detector de ciclos forman parte de `verify:ci`.

Las dependencias comunes se importan mediante exports explícitos de `@gatopago/shared` y `@gatopago/environment`. `@gatopago/test-fixtures` reúne las fixtures compartidas; el harness Web accede al verificador de enrollment mediante un export de pruebas declarado. El guard impide dependencias de producción entre backends, imports relativos entre paquetes y acceso a módulos compartidos ajenos a cada dominio.

Flow consume snapshots ABI versionados y puede construir y probar sin `contracts/out`. El gate `check:payment-abis` comprueba que esos snapshots coincidan exactamente con los contratos compilados.

## Runtime de Wallet Core

HTTP, Cron y Queue usan la misma composición de perfiles contractuales, dos observadores RPC, bundler, políticas de finalidad y presupuestos. El catálogo público y los endpoints privados son datos separados. Ya no hay factories vacías en el entrypoint. La configuración y su admisión están descritas en [RUNTIME.md](../../gatopago-wallet-core/RUNTIME.md).

El 26/09 se desplegaron las dos bibliotecas, implementación, factory y verificador de Account V3 en Arbitrum Sepolia; [direcciones y evidencia](../../contracts/deployments/421614/account-v3/README.md). Los cinco componentes tienen código fuente verificado con coincidencia exacta en Sourcify. Wallet Core y Web ahora comparten el perfil de ese despliegue mediante `@gatopago/shared/v3/wallet-release`; el catálogo de staging incluye su configuración de ETH/USDC, gas y finalidad y la activa únicamente cuando la red está habilitada en el entorno.

La inspección real con los adaptadores del backend pasó contra Offchain Labs y Tenderly al mismo checkpoint finalizado. El RPC público de PublicNode se descartó porque no conservaba el estado histórico requerido. Quedan el bundler con soporte EntryPoint v0.9, la selección/configuración de Firebase, recursos y credenciales de Cloudflare, y el smoke de creación y transferencia. No se habilitó el entorno con datos ficticios. Este despliegue contractual no incluye paymaster ni routers de pagos.

La conciliación de transferencias observa los activos reservados por la operación, aunque el catálogo de la red incluya más activos. Conserva la atomicidad y la comprobación de finalidad antes de liberar reservas.

## Verificación

La instalación normal de dependencias del workspace ya funciona con el lockfile y sus políticas de procedencia. `pnpm install:all` instala JavaScript y las revisiones Solidity fijadas; CI usa el mismo comando `install:solidity`. Se requiere Node 24, pnpm declarado en `package.json` y Foundry 1.7.1.

La auditoría de producción detectó cuatro avisos moderados y se corrigieron sin excepciones al gate: Hono pasó de 4.13.3 a 4.13.5; la copia de `baseline-browser-mapping` 2.10.0 usada por Next se sustituyó por 2.11.20, que ya estaba en el lockfile para Browserslist. No cambiaron otras versiones. Las correcciones están descritas en las publicaciones de [Hono](https://github.com/honojs/hono/releases/tag/v4.13.5) y [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv). `pnpm audit --prod` devuelve cero vulnerabilidades conocidas.

El gate de cobertura mantiene sus mínimos para los cuatro contratos de pagos: entre 91,38 % y 98,21 % de líneas, entre 92 % y 100 % de ramas, y 100 % de funciones. La instrumentación LCOV se limita a ese alcance: el optimizador mínimo de Foundry/Solidity 0.8.34 no compila el checkpoint de 16 campos de `AccountV3Upgrade`. No se modificó Solidity ni se redujeron los umbrales para resolverlo. Account V3 conserva todas sus pruebas e invariantes con el compilador de producción; este resultado no certifica un porcentaje de cobertura de Account V3.

`pnpm verify:ci` finalizó con **exit 0** en una copia nueva del árbol de trabajo, con instalación normal mediante lockfile congelado. Se utilizó la caché habitual de pnpm, sin copiar `node_modules` ni artefactos de otro checkout. Las correcciones de dependencias y del gate se incorporaron antes de la corrida final completa. Tooling: Node 24.13.0, pnpm 11.23.0, TypeScript 6.0.3, Vitest 4.1.11, Wrangler 4.125.0 y Foundry 1.7.1.

| Verificación final | Resultado |
|---|---:|
| Wallet Core unitarias | 736 PASS |
| Wallet Core workerd/D1 | 1.224 PASS; 44 archivos, 260,17 s |
| Flow unitarias | 57 PASS |
| Flow workerd/D1 | 34 PASS |
| Web | 879 PASS |
| Contratos, incluidas invariantes | 395 PASS; 4 forks omitidos |
| Casos negativos del guard de fronteras | 6 PASS |
| Tipos, lint, builds Web/Workers, Knip y ciclos | PASS |
| ABIs, vectores, storage layout e integridad de dependencias | PASS |
| Query plans y guards de deployment | PASS |
| Auditoría de producción | 0 vulnerabilidades conocidas |
| Cobertura de pagos, tamaños y lint Solidity | PASS |

También arrancaron los siete harnesses Web, pasó el inventario de build contractual y se verificaron los logs estructurados de Wallet Core. Las pruebas nuevas cubren configuración inválida, sponsor opcional, discrepancia RPC, creación por Cron/Queue con replay y conciliación con catálogos de múltiples activos.

El log completo está en `output/backend-review/final-verify-ci.log`; `final-verification.json` registra el resultado y `fresh-verification.json` compara los 1.164 archivos de la copia y el workspace. Son resultados locales del árbol con cambios, no checks publicados en GitHub sobre `2257fa6`.

El código propio de producción queda en 88 archivos/7.927 líneas para Wallet Core y 46 archivos/4.809 líneas para Flow. La composición del runtime añade tres módulos y 215 líneas netas respecto de la limpieza anterior. Los directorios vacíos y la configuración privada local residual de `client` se apartaron a `output/backend-review/retired-client-local`, fuera del árbol activo y de Git.

## Alcance pendiente

El contrato permite más rotaciones de credenciales que el primer respaldo disponible en la API. Ampliar esas operaciones y conectar al consumidor Wallet Core con los comandos comerciales de Flow son trabajos funcionales separados. Tampoco se extrajeron repositorios ni se publicaron paquetes: los exports explícitos preparan sus fronteras dentro del workspace actual.

### Patrocinio V3 — 26/09/2026

Wallet Core integra el paymaster propio en creación y transferencias mediante
`src/sponsorship`, separado del bundler. El cliente reconstruye los campos
firmados; persistencia, estimación y recibos reconocen el pagador exacto.
El esquema inicial incluye reservas atómicas por usuario interno/día y globales,
con ajuste al coste real únicamente tras confirmación finalizada. La iteración
actual consolidó la migración de patrocinio en `0001_initial.sql` para bases nuevas.
Anvil prueba creación sin ETH de la cuenta y transferencia con sólo el importe
a enviar, usando contratos reales, verificando el débito del depósito del
paymaster y rechazando modificaciones de gas. D1 prueba concurrencia y retries.

Activación pública pendiente: despliegue/fondeo y pin del paymaster, clave de
patrocinio dedicada, bundler compatible y entorno provisionado. El catálogo de
Sepolia conserva `paymaster: null`; no se ha hecho un smoke público patrocinado.
