> Informe histórico. El estado vigente está en [Estado de los backends](../../backend-status.md). Las cifras y limitaciones siguientes corresponden a esa revisión.

# Regularización y evaluación de backends — 25/09/2026

## Dictamen

Conservar dos dominios: Wallet Core y Flow. La propuesta de no dividir `server/` a ciegas es correcta. La propuesta de considerar Flow casi terminado mediante naming y extraer cada subdirectorio con `git filter-repo` es insuficiente: hay contratos compartidos, configuración, artefactos compilados, migraciones y semánticas históricas que no desaparecen al renombrar.

No se necesita una reescritura ni otro servicio preventivo. Primero deben quedar inequívocos el runtime activo, las dependencias permitidas y qué pruebas lo verifican. Este incremento regulariza esas fronteras; no completa el cutover remoto ni elimina físicamente todo el archivo histórico.

| Dominio | Responsabilidades | Dependencias que no debe adquirir |
|---|---|---|
| Wallet Core | Identidad Consumer, credenciales, cuentas, política, portfolio, transferencias personales, ejecución y finalidad | Tablas/rutas de merchant, settlement comercial o implementaciones de Flow |
| Flow | Merchant, links, intents, quotes, attempts, settlement, conciliación, eventos/webhooks | Llaves del usuario, implementación Account V3, tablas o disponibilidad de Wallet Core |
| Módulos compartidos | DTO/versiones, ABI del dominio correspondiente, compiladores puros y utilidades técnicas pequeñas | Repositorios D1, orquestadores de dominio o un barrel que mezcle todo |

## Hallazgos contrastados con el código

1. **Dos runtimes dentro de `server`, no dos mitades por repartir.** `server/src/v3` tenía 86 archivos / 7.757 líneas; el árbol completo tenía 186 archivos / 39.137 líneas. V3 ya tiene un entrypoint que no monta las rutas antiguas. Pero `dev` y `deploy` seleccionaban el runtime histórico, y el chequeo TypeScript V3 incluía sus fuentes y bindings. La separación de código existía; las herramientas no la reflejaban.

2. **Acoplamientos accidentales reales.** Diecisiete módulos V3 importaban `server/src/services/http.ts`. Tres módulos productivos de Flow importaban `shared/index.ts`, que reexporta Account V2, EntryPoint y UserOperations además de pagos. La corrección consiste en compartir la utilidad técnica y usar imports específicos, no copiar servicios históricos.

3. **Una lectura supuestamente acotada no estaba acotada durante el consumo.** `payments-worker/src/services/http.ts` utilizaba `response.arrayBuffer()` antes de comprobar el tamaño. Sin `Content-Length`, podía consumir todo el body. Ahora reutiliza el lector streaming, conserva el límite de Flow de 64 KiB y libera/cancela el stream. Hay regresiones para el body sin longitud, longitud declarada, UTF-8 y cancelación por deadline.

4. **Flow tiene una base clara, pero no es sólo un cambio de nombre.** Al inicio de la revisión tenía 38 archivos / 5.051 líneas, SQL concentrado en repositories/stores, adapters onchain, outbox, leases y reconciliación propios. Sin embargo, `Merchant.ownerUid` y las rutas de administración usan un propietario Firebase; no implementan todavía el modelo Organization/Membership/Project/Customer descrito para Flow/Platform. Checkout externo puede ser independiente de Wallet Core sin que toda la gestión empresarial esté implementada. Es una diferencia respecto del diseño futuro, no una razón para reescribir el checkout actual.

5. **Parte de lo llamado histórico sigue siendo comportamiento activo.** `paymentsWriteAvailability` exige bootstrap desactivado y prueba de importación D1; se aplica a HTTP, RPC, Queue y Cron. Las versiones anteriores de mensajes/RPC también son compatibilidad explícita. Borrarlas por nombre cambiaría disponibilidad y procesamiento de mensajes. Deben retirarse mediante una decisión de corte y evidencia, no una limpieza textual.

6. **El gestor de política del backend aún es limitado.** `shared/v3/bootstrapActivation.ts` exige la policy inicial, `securityVersion = 1` y conservar la llave original. Es un flujo de primer respaldo opcional, no rotación general ni retiro de llave perdida. La capacidad contractual es más amplia que la API/UI actual. Renombrar `activation` a `security` no implementaría lo que falta; requiere otro cambio funcional con sus casos de autorización y replay.

7. **La extracción propuesta perdería piezas esenciales.** Wallet Core depende de `shared/v3`, `shared/http`, `packages/environment`, fixtures y scripts; Flow depende de contratos compartidos, redes, ABIs generadas y scripts de validación/deploy. Ninguno es autónomo hoy mediante sólo `--subdirectory-filter`. Además, los scripts raíz de CI aún arrastran tareas frontend históricas; no se declara verde el monorepo completo.

8. **`v1.routes.ts` no significa Account V1.** En Flow es la versión de una API comercial activa. La versión HTTP, la versión del contrato RPC y la generación de la wallet son conceptos diferentes; no se elimina una ruta por compartir un número con contratos retirados.

## Cambios de este incremento

- Utilidad común `shared/http.ts`; la ruta legacy queda como re-export para preservar sus consumidores. Flow conserva su presupuesto menor mediante un wrapper pequeño.
- Módulo `shared/paymentAbis.ts` y eliminación del barrel histórico en fuentes/pruebas de Flow.
- Comprobación AST de imports transitivos, incluidos re-exports, import types, imports dinámicos literales y alias de paquetes del workspace. Verifica también propiedad separada de D1/Queues/DLQ. Incluye pruebas negativas y se integra al guard existente, sin quitar los controles del cutover histórico.
- Proyectos TypeScript y suite unitaria propios de V3; runtime types generados desde su Wrangler. Flow deja de incluir todo `shared/` por glob: TypeScript sigue sus dependencias reales.
- `server dev` selecciona V3; `dev:legacy` selecciona el App histórico. `server deploy` acepta únicamente el build local `--dry-run`; `deploy:legacy` conserva el wrapper y controles anteriores. `server test` ejecuta ambos runtimes, de modo que las pruebas V3 ya no quedan fuera del comando normal.
- README de Wallet Core y referencia legacy separados; documentación de Flow y del despliegue histórico aclarada.
- Descriptor Web regenerado mediante el script existente porque el hash de release incluye las fuentes compartidas y el package raíz. No cambia por sí mismo ningún cliente publicado ni autoriza un deployment.

## Mantenibilidad y próximo orden de trabajo

**Wallet Core:** conservar los módulos pequeños y la separación entre consentimiento, delivery y evidencia finalizada. Agrupar eventualmente `wallets/` en creación, política, transferencias y portfolio cuando se retire el árbol legacy; no renombrar decenas de módulos y rutas durante una corrección financiera. La composición explícita de providers/admission sigue vacía y el runtime devuelve `ready:false`: eso es un estado pendiente de integración, no un servicio listo para producción.

**Flow:** mantener el dominio actual y los adapters. Sus puntos de concentración son `repositories/payments.ts` (958 líneas), `services/reconciliation.ts` (504) e `index.ts` (352). La próxima división útil es por caso de uso y transacción: intents/links, attempts, settlement y proyecciones/eventos. No repartir un `D1.batch` entre servicios independientes: sus escrituras y outbox deben conservar atomicidad. El tamaño por sí solo no demuestra un defecto de ejecución.

Orden recomendado:

1. Estabilizar la corrida completa workerd de V3 y mantener verdes las fronteras y suites específicas introducidas aquí. No compensar fallos con timeouts mayores ni sumar reintentos hasta declararla verde.
2. Inventariar consumidores, recursos y mensajes del App histórico; archivar sus fuentes, pruebas, migraciones y herramientas como un conjunto coherente. Eliminar sólo el código confirmado fuera del camino activo.
3. Cerrar el gestor general de cambios de política de Wallet Core y sus integraciones admitidas; mantener personal transfer separado de PaymentIntent.
4. Implementar el modelo empresarial de Flow cuando se habilite ese producto; conservar mientras tanto el modelo owner actual de forma explícita.
5. Fijar paquetes versionados de contratos API/configuración y artefactos Solidity, con tests de compatibilidad y build autónomo.
6. Recién entonces extraer los repositorios con todas sus dependencias/historia pertinentes y verificar un checkout limpio de cada uno. No se ejecutó `filter-repo`.

No se modificaron D1, colas, recursos remotos, claves, contratos Solidity de producción ni nombres de recursos desplegados. La configuración raíz `server/wrangler.jsonc` permanece histórica: Wrangler directo sin `--config` aún la selecciona. Los comandos de paquete son la entrada V3 explícita mientras se completa el archivo histórico.

## Verificación

| Comprobación | Resultado |
|---|---|
| Unitarias `server`, V3 e históricas | 1.000 PASS, 81 archivos |
| Suite unitaria V3 aislada | 712 PASS, 37 archivos; subconjunto de las 1.000 anteriores |
| Runtime App histórico en workerd/D1 | 29 PASS |
| Flow unitarias, incluidas cuatro regresiones HTTP nuevas | 56 PASS |
| Flow workerd/D1 | 23 PASS |
| AST/fronteras negativas | 5 PASS; guard real recorre 123 archivos Wallet Core y 48 Flow |
| Typegen y TypeScript de ambos runtimes | PASS; también pasa el proyecto histórico completo de server |
| Inventario de proyectos TypeScript | V3 y Flow no arrastran fuentes legacy ni del otro backend |
| Lint Wallet Core y Flow | PASS, sin warnings |
| Builds locales Wallet Core y Flow | PASS, sólo `--dry-run` |
| Guards de deployment y descriptor Web | PASS |
| `git diff --check` | PASS |
| **Suite V3 completa en workerd** | **No certificada: última corrida 1.212 PASS / 5 FAIL de 1.217** |
| Reejecución aislada de esos cinco casos | 5 PASS / 160 omitidos por filtro; no sustituye una corrida completa |

La primera corrida workerd V3 produjo 27 fallos; las siguientes, con un solo worker, produjeron 6 y 5 en casos diferentes. Se observaron timeouts y expiraciones de leases/finalidad; algunos fixtures terminaron intentando leer una proyección que no se había creado. Los cinco últimos casos pasan aislados en 23 segundos. Esto sugiere sensibilidad temporal/de ejecución del harness, pero no se atribuyen todos los fallos al entorno sin una comparación controlada del baseline. No se cambiaron deadlines financieros, assertions ni timeouts para obtener un PASS.

Los logs, comandos, códigos de salida y corridas fallidas se conservan localmente en `output/backend-review/verification/`. Se usó un worktree temporal con los mismos archivos de código y versiones fijadas por el lockfile: Node 24.13.0, TypeScript 6.0.3, Vitest 4.1.11, Wrangler 4.125.0 y Foundry 1.7.1 para los artefactos de pruebas. La suite workerd conserva la fecha de compatibilidad de pruebas existente; no demuestra equivalencia con un despliegue remoto.

La instalación pnpm completa sufrió errores de descarga. Los paquetes de tooling que faltaban se descargaron al entorno temporal y sus SHA-512 se comprobaron contra el lockfile; el inventario está en `tooling-packages.json`. Para los builds locales se utilizó el aviso de dependencias desincronizadas de pnpm, evitando que cada comando disparara otra instalación del monorepo; los guards de integridad Solidity y EntryPoint sí se ejecutaron y pasaron. No se declara aprobada una instalación completa del monorepo.

El mayor bloque del diff es `server/v3/bindings.d.ts`: tipos de plataforma generados por Wrangler para que Wallet Core no dependa del archivo generado del App histórico. Sólo se normalizó whitespace final; `wrangler types --check` pasa.

Referencia de plataforma consultada: [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), incluidos límites de lectura, bindings y separación del trabajo asíncrono. Los hallazgos anteriores se sustentan en el código del repositorio, no en nombres de carpetas.
