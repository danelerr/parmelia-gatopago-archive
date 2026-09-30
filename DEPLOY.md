# Despliegue V3

## Comprobaciones

```sh
pnpm verify:ci
pnpm --filter gatopago-wallet-core deploy --dry-run
```

El dry-run compila y comprueba el paquete; las operaciones financieras realizan
sus propias comprobaciones de red, contratos, simulación y financiación.

## Wallet Core

`gatopago-wallet-core/wrangler.remote.jsonc` publica V3 sobre el Worker existente
**`gatopago-wallet-core`**, en **`https://api.gatopago.com`**. Se renombró el recurso
anterior `server` conservando su identidad, despliegue, secretos y bindings.
La configuración admite únicamente
Arbitrum Sepolia. `GATOPAGO_ENVIRONMENT=production` es el namespace del servicio;
no habilita mainnet. Los orígenes y las redes se suministran como bindings.

El Worker utiliza la base limpia V3 y las colas ya creadas. Sus nombres actuales
incluyen `staging`, pero no constituyen un segundo ambiente ni un segundo Worker.
No aplicar `0001_initial.sql` sobre `parmeliadb`: contiene un esquema distinto.
La configuración remota elimina los dos Durable Objects anteriores mediante
una migración; el runtime no conserva rutas ni bindings de V2.

`PRIVATE_KEY` identifica la EOA que entrega `EntryPoint.handleOps`. Se reutiliza
el secreto ya cargado en `gatopago-wallet-core`; Cloudflare no permite descargar su valor.
La dirección pública se puede comprobar en `/app/v1/health/ready`. Esa EOA
necesita ETH de prueba. El paymaster permanece sin desplegar y el catálogo
mantiene `paymaster: null`; la cuenta necesita prefondo para su operación.

```sh
pnpm --filter gatopago-wallet-core deploy
# Sólo para cargar o cambiar credenciales:
pnpm --filter gatopago-wallet-core deploy --secrets-file /ruta/privada/wallet.json
# Consultar o aplicar migraciones futuras sobre el D1 V3:
pnpm --filter gatopago-wallet-core exec wrangler d1 migrations list WALLET_DB --config wrangler.remote.jsonc --remote
```

El despliegue exige un commit local limpio y no requiere push a GitHub.
El archivo de secretos se mantiene fuera del repositorio. La publicación
conserva los secretos existentes que no aparezcan en él.

`/app/v1/health/live` comprueba vida del Worker. `/app/v1/health/ready` informa
configuración; no acredita una creación ni una transferencia completada.

## Contratos y frontend

Los cinco componentes de Account V3 están desplegados en Arbitrum Sepolia y
verificados con coincidencia exacta en Sourcify. Direcciones y evidencia:
[despliegue Account V3](contracts/deployments/421614/account-v3/README.md).

El frontend se publica manualmente en el proyecto Vercel `gatopago`, con
Root Directory `apps/web`, acceso a los paquetes fuera de esa carpeta y Node 24.
Vercel usa pnpm, la versión de `packageManager` mediante Corepack y las variables
públicas que apuntan a `gatopago.com` y `api.gatopago.com`.
Ejecutar desde la raíz del monorepo para incluir `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `shared/`, `packages/` y los scripts de build:

```sh
vercel --prod --scope danelerrs-projects
```

El proyecto debe tener asignado `gatopago.com` para probar passkeys: ése es el
origen configurado. Desplegar los backends no publica Web.

## Flow

El Worker existente `gatopago-payments-api` se renombró directamente a
`gatopago-flow`, conservando su identificador, secretos, D1, Durable Object,
colas y cron. `gatopago-flow/wrangler.remote.jsonc` publica el runtime actual
sobre ese Worker, con la base limpia V3 ya provisionada y el binding
`WALLET_IDENTITY` hacia `gatopago-wallet-core`. Las colas V3 son distintas de la
cola anterior. El Durable Object existente no contiene objetos almacenados.
Los nombres internos de los recursos incluyen `staging`; no son otro ambiente.

Flow atiende `https://api.gatopago.com/v1/*` y
`https://api.gatopago.com/checkout/v1/*`; Wallet Core conserva `/app/v1/*`.
No se habilitan workers.dev, previews ni pagos mainnet.

```sh
pnpm --filter gatopago-flow deploy:dry-run
pnpm --filter gatopago-flow deploy
```

La publicación conserva los secretos existentes. `/v1/health/live` comprueba
vida y `/v1/health` comprueba D1, signer, colas, scheduler y routers onchain.
