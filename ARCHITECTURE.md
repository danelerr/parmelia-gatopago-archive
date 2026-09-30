# Arquitectura vigente — V3

Dos backends independientes y un frontend Consumer. Account V3 es la única generación de cuenta implementada; no hay runtime, schemas de wallet ni adaptadores de Account V2.

```text
apps/web ──► Wallet Core
                 ├── identidad y credenciales
                 ├── cuentas, creación y seguridad
                 ├── portfolio y transferencias personales
                 └── WALLET_DB + trabajos propios

Checkout / Merchant API ──► Flow
                              ├── intents, quotes y attempts
                              ├── rails onchain y conciliación
                              ├── settlement, ledger y webhooks
                              └── PAYMENTS_DB + trabajos propios
```

Wallet Core no gestiona tablas comerciales. Flow no importa implementaciones de Wallet Core ni accede a su base de credenciales. Checkout anónimo y API keys comerciales operan sin llamar al backend Consumer. Las peticiones con sesión Consumer consultan el entrypoint privado `WalletIdentity` mediante un service binding del mismo entorno; reciben sólo ID interno y vencimiento, sin cachear autorizaciones. Flow expone comandos internos tipados para una integración admitida; esa superficie no implica que la composición financiera de Wallet Core ya la consuma.

## Wallet Core

El código se organiza por capacidades en `gatopago-wallet-core/src`: `auth`, `enrollment`, `accounts`, `creation`, `security`, `transfers`, `portfolio` y `execution`. `runtime` compone HTTP, Cron y Queue con un único catálogo validado por invocación. Los endpoints privados se resuelven mediante bindings; no se aceptan desde solicitudes o mensajes. Sus compiladores y formatos de autorización se importan mediante exports explícitos de `@gatopago/shared`.

La autorización humana, el trabajo persistido, el envío y la evidencia finalizada son etapas distintas. Un timeout de broadcast no permite concluir que no hubo envío. La reconciliación puede continuar cuando expira un permiso; no renueva ese permiso ni autoriza otra transacción. Nonces y reservas de fondos tienen verificaciones atómicas propias.

La creación instala la política ACTIVE contractual. El primer respaldo es opcional. El backend aún no implementa todas las rotaciones que permite Account V3; las integraciones de red/proveedores siguen pendientes de admisión. La separación de código no equivale a disponibilidad de producción.

El respaldo opcional se denomina `backup` en código, API y esquema inicial (`/app/v1/account-backups`). El frontend y los módulos compartidos usan el mismo vocabulario, sin aliases de las rutas anteriores. `chainProviders.ts` valida los endpoints y pares de RPC utilizados por creación, seguridad, balances y transferencias. Los controles HTTP comunes y la espera cancelable se comparten; cada operación conserva sus propias reglas de autorización y persistencia.

## Flow

`index.ts` conecta las entradas de plataforma; `http.ts` compone HTTP, `commands.ts` la integración RPC actual y `maintenance.ts` el trabajo periódico.

La lógica de negocio vive en `services` y `domain`; el SQL sólo en `repositories` y `stores`. Los repositorios se dividen por responsabilidad: cuentas comerciales, intents/links, quotes, attempts, crosschain, fees y settlement. La presentación pública está fuera de la persistencia. Settlement conserva la atomicidad entre estado económico, ledger, evento y outbox.

Un merchant tiene actualmente un propietario. No se introduce un modelo vacío de organización o proyectos para anticipar funciones todavía inexistentes.

Los comandos de cuenta de liquidación conservan su payload y resultado original. Registrar el comando y actualizar la cuenta ocurre en un único batch D1: una versión anterior no reemplaza una posterior, y reutilizar el identificador con otros datos devuelve conflicto. El nombre de la cola procede de la configuración de cada entorno y se comprueba contra sus productores y consumidores, incluido el entorno de pruebas.

## Contratos compartidos y datos

Los imports entre paquetes usan exports explícitos de `@gatopago/shared` y `@gatopago/environment`; se rechazan rutas relativas que crucen sus límites. Los módulos son: `shared/v3`, `paymentContracts`, `paymentAuthorizations`, `paymentNetworks`, `paymentErrors`, `paymentAbis`, `fees` y `http`. No existe un export raíz que mezcle cuentas antiguas y pagos. `@gatopago/test-fixtures` contiene las fixtures comunes de pruebas. Las ABIs de pagos viven en `shared/abis`; CI comprueba su igualdad con las compiladas, mientras Flow puede construir y probar sin `contracts/out`.

Cada backend posee un esquema inicial para una base vacía. Las migraciones acumulativas anteriores fueron consolidadas comprobando igualdad de tablas, índices y triggers. No hay conversión de datos del producto anterior ni una condición de importación para arrancar Flow.

Los formatos de RPC/colas de Flow y Circle CCTP tienen numeraciones propias, independientes de Account V3. Flow sólo acepta su formato vigente; las versiones anteriores se rechazan. Los controles de versión del cliente V3 sirven para admitir una release conocida, no para mantener clientes V2.

## Comprobaciones

`check:backend-boundaries` recorre imports transitivos y valida propiedad separada de D1 y colas, ausencia del producto retirado y ubicación del SQL. Las suites workerd verifican persistencia y transacciones reales sobre D1 local. Los comandos normales ejecutan únicamente la arquitectura actual.
