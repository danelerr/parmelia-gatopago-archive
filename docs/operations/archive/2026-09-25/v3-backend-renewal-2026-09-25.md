> Informe histórico. El estado vigente está en [Estado de los backends](../../backend-status.md). Las cifras y limitaciones siguientes corresponden a esa revisión.

# Renovación de backends exclusivamente V3 — 25/09/2026

La sección «Limpieza interna adicional» al final recoge la pasada posterior de refactor y sus verificaciones. Las cifras anteriores corresponden al primer cierre de la renovación.

## Resultado

La instrucción de retirar el producto anterior sustituyó el planteamiento inicial de mantener un backend legacy archivado dentro del proyecto. Ahora hay un único Wallet Core y un Flow independiente. No se mantiene un entrypoint, esquema, export raíz ni adaptador para Account V2. La historia anterior sigue en Git.

No se publicaron Workers, contratos o repositorios, ni se tocaron bases de datos, colas o secretos remotos. Las configuraciones actuales son candidatos locales con D1 sin provisionar.

## Reducción medida

Código TypeScript propio de producción, con comentarios y líneas vacías; excluye tests, dependencias, tipos de plataforma generados y artefactos.

| Backend | Archivos antes → después | Líneas antes → después |
|---|---:|---:|
| Wallet Core | 186 → 86 | 39.080 → 7.757 |
| Flow | 38 → 47 | 5.041 → 4.805 |
| Ambos | 224 → 133 | 44.121 → 12.562 |

Wallet Core reduce un 53,8 % de archivos y un 80,2 % de líneas. Flow reduce un 4,7 % de líneas; tiene nueve archivos más porque las responsabilidades de persistencia y plataforma ahora son explícitas. La reducción combinada es del 71,5 % de líneas. No representa un ahorro equivalente de gas, memoria o latencia: el entrypoint V3 ya excluía buena parte del código histórico.

Se retiraron también las 38 migraciones del backend antiguo, contratos/ABIs de Account V2, su frontend `client`, scripts del cutover, configuración Vite/Playwright/OpenAPI anterior y comandos de compatibilidad. Se conserva `apps/web` como frontend actual. Las pruebas vigentes de vectores EIP-712 de pagos se trasladaron a Flow y las del lector HTTP común se conservaron.

## Arquitectura resultante

Wallet Core se organiza en `auth`, `enrollment`, `accounts`, `creation`, `security`, `transfers`, `portfolio` y `execution`. El único entrypoint es `gatopago-wallet-core/src/index.ts`; los comandos normales usan una sola configuración Wrangler y proyectos TypeScript de runtime/test. No hay comandos `dev:legacy`, `deploy:legacy` ni una segunda suite alternativa.

Flow separa la conexión de plataforma (`index.ts`), composición HTTP (`http.ts`), comandos (`commands.ts`) y mantenimiento periódico (`maintenance.ts`). El repositorio de 958 líneas se dividió en cuentas comerciales, intents/links, quotes, attempts, crosschain, fees, settlement y mapeo de filas. La presentación pública salió de la capa SQL. El grafo de esos módulos se comprobó sin ciclos al extraerlo. Las transacciones económicas y el outbox conservaron sus batches atómicos.

Las versiones anteriores de RPC/colas se rechazan: no hay normalizadores N-1. Los comandos actuales exigen identidad del servicio Wallet Core, identificador explícito de idempotencia y red. Se retiraron los aliases temporales de checkout y el endpoint comercial `/onchain`. El arranque de Flow dejó de depender de un checksum de importación de Parmelia y su esquema no tiene esa tabla de control ni columnas de claims antiguos.

`shared` tiene imports explícitos por dominio. El catálogo `paymentNetworks` contiene sólo capacidades de pagos/Circle; `paymentErrors` conserva 24 códigos vigentes. Los números de Circle CCTP V2 y del protocolo actual de Flow son independientes de la generación de Account y no son adaptadores del producto anterior. Los manifiestos de routers de pago aún referenciados se conservan como evidencia de esos deployments; no se rebautizó una dirección desplegada como si fuera un despliegue nuevo.

## Esquemas iniciales

Las 21 migraciones de Wallet Core V3 y las siete de Flow se consolidaron en un `0001_initial.sql` por backend. Antes de sustituirlas se reconstruyeron en SQLite y se comprobó igualdad exacta del SQL final de tablas, índices y triggers, además de claves foráneas válidas y ausencia de datos iniciales que se pudieran perder. Wallet Core conserva 73 objetos y Flow 66.

La primera serialización alfabética de índices cambió una elección del optimizador en una base vacía. Se detectó con el gate de query plans y se corrigió conservando el orden de creación de índices. Los once caminos de consulta verificados vuelven a usar los índices esperados.

Estos esquemas son para bases vacías. No implementan conversión de cuentas, datos o colas anteriores.

## Verificación

Las verificaciones se ejecutaron en el worktree temporal con tooling fijado, y se comparan sus fuentes contra el árbol de trabajo. Node 24.13.0, TypeScript 6.0.3, Vitest 4.1.11, Wrangler 4.125.0 y Foundry 1.7.1. La suite de workerd usa la fecha de compatibilidad de pruebas existente.

| Comprobación | Resultado |
|---|---|
| Wallet Core unitarias | 715 PASS |
| Wallet Core workerd/D1 | 1.217 PASS, 43 archivos; corrida final con el comando normal y esquema definitivo |
| Flow unitarias, incluidos vectores EIP-712 preservados | 57 PASS |
| Flow workerd/D1, esquema fresco y rutas retiradas | 24 PASS |
| Tests negativos de fronteras AST | 5 PASS |
| Grafo de imports y propiedad de D1/colas | PASS |
| TypeScript y lint de ambos backends | PASS |
| Tipos Wrangler de ambos backends | PASS |
| Builds locales de ambos Workers | PASS, sólo dry-run |
| Query plans Flow | 11 PASS |
| Guards de deployment, fuente y frontera contractual | PASS |
| Lockfile | Actualizado por pnpm; 570 → 554 paquetes; sin versiones nuevas ni cambios de resolución en paquetes conservados |

La suite de Wallet Core se ejecuta con un worker de archivo. Se conserva la concurrencia dentro de los tests, los deadlines financieros y sus assertions. La corrida completa anterior a esta renovación era intermitente; aquí se obtuvieron dos corridas completas verdes, la última sobre el esquema definitivo, sin declarar que ello por sí solo explica todas las causas anteriores.

`pnpm install --lockfile-only` finalizó correctamente con las políticas de supply chain del proyecto. No equivale a una instalación completa desde cero. El worktree de verificación utiliza las dependencias verificadas de la revisión previa. No se certifica aquí `verify:ci` completo ni el frontend Web: su suite no pudo iniciarse en ese worktree por faltar su instalación de Vitest. Las comprobaciones de procedencia/activos y el descriptor Web sí se verificaron. Los logs y comandos están en `output/backend-review/renewal-verification/`.

## Límites funcionales actuales

La renovación elimina y reorganiza código; no completa funcionalidades pendientes de V3. Wallet Core aún necesita composición/admisión de proveedores y redes para operar, y el módulo de seguridad implementa el primer respaldo opcional, no todas las rotaciones que permite el contrato. Flow conserva un owner por merchant; no se implementó un modelo nuevo de organizaciones. No se extrajeron repositorios: siguen existiendo paquetes compartidos que deben empaquetarse para builds autónomos fuera del monorepo.

## Limpieza interna adicional

Se centralizaron los controles de métodos HTTP/CORS de siete rutas y las tres copias de la espera cancelable. Se retiraron tres archivos que sólo reexportaban funciones y el reexport de publicación de jobs de Flow. La validación de endpoints y pares de RPC quedó en `gatopago-wallet-core/src/chainProviders.ts`: portfolio y transferencias ya no dependen del módulo de respaldo para esa infraestructura.

El respaldo opcional usa `backup` en módulos, API, esquema inicial y cliente Web. La ruta vigente es `/app/v1/account-backups`; no hay alias de `/account-activations`. Se actualizaron los consumidores, pruebas, harnesses y estilos asociados. El tag criptográfico `BootstrapAcknowledgementV1(...)` conserva sus bytes: este refactor no cambia los digests de autorización ni el modelo de autoridad contractual. La API del navegador `navigator.userActivation` se conserva.

En Flow, los intentos de checkout requieren su link; se eliminaron las ramas que permitían omitirlo. Los comandos RPC usan validadores directos, sin variables de «normalización» ni validaciones duplicadas, y la preparación de intentos usa control de flujo directo. Se eliminaron los dos casts dobles de producción en la lectura de routers/eventos.

Se corrigió la idempotencia de cuentas de liquidación: un batch D1 registra el payload y la decisión original y aplica la actualización condicionada por versión. Un mismo `commandId` con otros datos devuelve conflicto; un replay idéntico devuelve el resultado original; las versiones no retroceden bajo concurrencia. Las pruebas comprueban también el rollback del registro si falla la escritura de la cuenta. El esquema inicial incorpora los campos necesarios para conservar ese comando completo; continúa siendo exclusivamente para bases vacías.

El consumidor de cola utiliza `PAYMENT_JOBS_QUEUE_NAME` del entorno. El guard comprueba que coincida con productores y consumidores tanto en la configuración normal como en la de pruebas. Una prueba workerd entra por `FlowWorker.queue` con el nombre real del entorno de pruebas y comprueba la finalización persistida del job.

El código de producción de esta pasada queda en 85 archivos/7.712 líneas para Wallet Core y 46 archivos/4.809 líneas para Flow: 131 archivos/12.521 líneas en total. Son dos archivos y 41 líneas netas menos que al comenzar esta pasada, incluyendo las correcciones de persistencia. Las nuevas pruebas no forman parte de esa medida.

Las verificaciones se registran en `output/backend-review/cleanup-verification/`; `final-sources.json` compara 535 archivos de fuente/configuración con el checkout aislado utilizado para verificar. Pasaron TypeScript y lint de ambos backends y Web, los tipos generados de Wrangler, los 11 query plans, los cinco tests negativos de fronteras, los guards y los builds locales de ambos Workers. El descriptor Web es `web-v3-ab917b79a49e5fbf6f91aafd81c6fbd1da0173a7a4e711e9876fb40a3415a64e` (228 entradas).

La suite Web ya pudo ejecutarse completa: 879 pruebas pasan, reemplazando la limitación de instalación registrada en el primer cierre. No se certifica un despliegue, un recorrido con proveedores remotos ni una instalación completa desde cero: la verificación usa el tooling fijado del checkout aislado, completado con paquetes cuyo SHA-512 se comprobó contra el lockfile. No se añadieron dependencias al proyecto.

| Suite final | Resultado |
|---|---:|
| Wallet Core unitarias | 719 PASS |
| Wallet Core workerd/D1 | 1.217 PASS; corrida final de 262,09 s sobre las fuentes definitivas |
| Flow unitarias | 57 PASS |
| Flow workerd/D1 | 34 PASS |
| Web unitarias | 879 PASS |

Total: 2.027 pruebas de backend y 879 de Web, sin fallos. Los cinco tests del guard de fronteras se cuentan por separado. Los límites funcionales descritos arriba siguen pendientes; no hubo despliegues ni cambios en Solidity durante esta pasada.


## Nombres definitivos de los backends

Las carpetas y los paquetes del workspace son `gatopago-wallet-core` y `gatopago-flow`. Se actualizaron los filtros pnpm, importers del lockfile, imports de pruebas y harnesses Web, scripts de build/deploy, controles de fronteras, Knip y documentación vigente. CI usa esos mismos comandos raíz. No hay carpetas ni aliases con los nombres anteriores.

Los Workers locales se identifican como `gatopago-wallet-core-local` y `gatopago-flow-local`; liveness y la caché pública de identidad de Wallet Core usan su nombre actual. Las funciones del guard de Flow y su consumidor de cola usan el vocabulario actual. Los dominios criptográficos y formatos de consentimiento no cambian por un nombre de carpeta. Los manifiestos de despliegues y reportes anteriores conservan sus valores históricos.

El lockfile pasó `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts`. Una comparación estructural confirmó que sólo cambiaron los nombres de importers: ninguna versión, dependencia o resolución. Se regeneraron y comprobaron los tipos Wrangler y el descriptor Web. El diagrama objetivo fue regenerado; los 29 diagramas pasaron la comprobación de fuentes.

El antiguo script de consola suponía un logger retirado y rechazaba los logs estructurados actuales. Su versión renombrada comprueba llamadas con un objeto y evento estático mediante el parser TypeScript; cinco casos de aceptación/rechazo verificaron el control. Durante la verificación se corrigió un reemplazo excesivo de la palabra genérica `server` en una expectativa de SSR del frontend.

Validación posterior al renombrado: Wallet Core **719 unit + 1217 workerd/D1**, Flow **57 unit + 34 workerd/D1**, Web **879 tests**; cero fallos finales. Pasaron TypeScript y lint de los tres paquetes, tipos Wrangler, builds locales de ambos Workers, fronteras, guards de deployment/source y los once planes de consulta. Las pruebas se ejecutaron en la copia aislada con dependencias fijadas usada en la revisión anterior; se compararon por bytes 701 archivos de código/configuración/documentación con el workspace. La instalación de dependencias del workspace original sigue incompleta; no se presenta esta ejecución como una instalación limpia ni un `verify:ci` completo. No hubo despliegue, publicación ni modificación de recursos remotos.
