> Informe histórico. El estado vigente está en [Estado de los backends](../../backend-status.md). Las cifras y limitaciones siguientes corresponden a esa revisión.

# Backends exclusivamente V3: alcance y ahorro medido

La instrucción del usuario es eliminar el producto V2 y toda su compatibilidad, no conservar un backend legacy ejecutable. Esta decisión sustituye la propuesta anterior de archivar ese backend dentro del árbol actual. La historia permanece en Git; no se necesita reescribirla.

Este documento mide y concreta ese cambio de alcance. No declara ejecutadas las eliminaciones ni terminada la regularización.

## Medición del árbol actual

Archivos TypeScript de producción, incluyendo comentarios y líneas vacías; excluye dependencias, pruebas, tipos de plataforma generados y artefactos compilados.

| Área | Archivos | Líneas |
|---|---:|---:|
| `server/src` completo | 186 | 39.080 |
| `server/src/v3` | 86 | 7.757 |
| `server/src` fuera de V3, candidatos a eliminación | 100 | 31.323 |
| `payments-worker/src` | 38 | 5.041 |

Conservar el V3 actual y retirar el árbol histórico representa un 53,8 % menos de archivos y un 80,2 % menos de líneas en `server/src`. Sobre ambos backends combinados, ese mismo bloque equivale al 71,0 % de las líneas. No es una predicción del diff final: las simplificaciones, utilidades conservadas y divisiones de módulos cambiarán esos valores. Tampoco equivale a un ahorro del 80 % de memoria, latencia o infraestructura: el entrypoint V3 ya excluía el router histórico.

Existen además 38 migraciones históricas de server, frente a 21 migraciones V3 independientes. Pruebas, scripts, configuraciones, ABIs y documentos ejecutables del producto anterior se incluyen en la retirada, pero no se suman al porcentaje anterior. Algunas pruebas genéricas deben conservarse cambiando su propietario; no se borran sólo porque no comiencen con `v3`.

Inventario reproducible de rutas y conteos: `output/backend-review/v3-only-scope-inventory.json`.

## Eliminación y simplificaciones propuestas

1. **Un solo Wallet Core.** Retirar el entrypoint, rutas, servicios, configuración, bindings, comandos de despliegue, migraciones y pruebas exclusivamente históricos. Promover la configuración V3 a la ubicación normal. Eliminar `dev:legacy`, `deploy:legacy` y la duplicación de proyectos de herramientas. Mantener sólo utilidades usadas por el producto vigente, con un propietario explícito.

2. **Eliminar Account V2 de todo el árbol propio.** Retirar sus contratos archivados, ABIs, exports, manifestaciones de despliegue y herramientas de build/validación sin consumidores vigentes. Actualizar los scripts que hoy exigen la existencia del backend histórico; sustituir esas comprobaciones por ausencia de imports/rutas/exports V2. No dejar un barrel o una ruta antigua como fallback. No reescribir commits ni borrar recursos remotos.

3. **Simplificar Wallet Core por casos de uso.** Organizar creación, seguridad, transferencias y portfolio, con separación explícita entre rutas, autorización, persistencia y proveedores. Revisar repetición de validación de filas, tiempo, leases y transporte para extraer sólo lógica idéntica. Mantener explícitos los distintos consentimientos, nonces, estados inciertos y requisitos de finalidad: creación, cambio de política y transferencia no son la misma operación. Sustituir la semántica de activación obligatoria por respaldo opcional donde corresponda al contrato actual. Una rotación general nueva es una capacidad funcional adicional, no algo que se obtiene renombrando un módulo.

4. **Eliminar compatibilidad histórica de Flow.** Retirar normalizadores RPC N-1, conversión de mensajes antiguos y aliases HTTP expresamente marcados como temporales. Revisar el RPC que atendía al antiguo App: conservar sólo operaciones con consumidores y finalidad vigentes. Eliminar la obligación de importar Parmelia para arrancar una instalación nueva de Flow. Su disponibilidad debe depender de su propio esquema y configuración actual, no de un checksum de migración legacy. Conservar controles actuales de signer, rutas, base de datos y procesamiento. No desplegar esta ruptura sobre las colas o bases remotas actuales como parte de la limpieza local.

5. **Refactor interno de Flow.** `repositories/payments.ts` concentra 958 líneas con merchants, links/intents, quotes/attempts, crosschain, fees, settlement y serialización pública. Separarlo por esas responsabilidades; colocar la serialización fuera del SQL. Separar el despacho y los handlers de reconciliación por rail y dejar pequeño el entrypoint HTTP/RPC/Queue/Cron. Conservar la atomicidad de settlement, ledger y outbox: dividir archivos no debe dividir transacciones.

6. **Compartidos y verificación.** Exports específicos por dominio; ninguna dependencia de implementaciones entre backends. Una configuración de herramientas por backend y guard de ausencia de V2 en el producto. Probar instalación del esquema desde cero, interfaces actuales y rechazo de protocolos retirados; mantener pruebas de autorización, replays, concurrencia y finalidad. Resolver la corrida completa workerd V3 todavía inestable antes de declarar terminada la regularización.

## Qué significa cero compatibilidad

El producto no acepta ni convierte cuentas, solicitudes, mensajes o rutas retirados del producto anterior. Sus recursos y scripts no hacen falta para compilar, probar o iniciar V3. Un grep por el texto `v2` no demuestra eso: Circle CCTP V2, versiones actuales del protocolo propio de pagos y formatos de cifrado tienen numeraciones independientes de Account V2. Se retira compatibilidad por su semántica y consumidores, no cambiando esos números arbitrariamente.

## Cómo evaluar la mejora

El ahorro principal está en la superficie mantenida de Wallet Core. En Flow se espera una reducción menor; el refactor puede aumentar el número de archivos al separar responsabilidades. El criterio es una única implementación por caso de uso, un único formato vigente por interfaz, ausencia de adaptadores históricos, arranque independiente y módulos con límites transaccionales claros. No se asigna un porcentaje inventado a la calidad arquitectónica.
