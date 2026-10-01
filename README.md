# GatoPago V3

El producto actual tiene tres aplicaciones y una única generación de cuenta: Account V3.

Web, Wallet Core, Flow y contratos poseen lockfiles, CI y comandos propios.
Pueden extraerse a repos separados sin checkouts de carpetas hermanas. Los
comandos de esta raíz son una comodidad de integración, no una dependencia de
los proyectos. Ver [independencia y evidencia local](docs/operations/REPO-INDEPENDENCE-2026-09-30.md).

| Directorio | Responsabilidad |
|---|---|
| `apps/web` | Web Consumer V3 |
| `gatopago-wallet-core` | Wallet Core: identidad, credenciales, cuentas, seguridad, balances y transferencias personales |
| `gatopago-flow` | Flow: comercios, checkout, intents, intentos, liquidación y webhooks |
| `contracts` | Account V3 y contratos de pagos |
| `shared` | Protocolos y utilidades explícitos por dominio |
| `packages/environment` | Perfiles de entorno y admisión de redes |

No hay runtime V2, frontend anterior ni adaptadores para sus solicitudes. Los números de versión de Circle, ERC-4337 o las APIs de Flow son independientes de la generación de Account.

Usar Node 24 y la versión de pnpm indicada en `package.json`. Los builds contractuales requieren Foundry 1.7.1; `install:all` instala las dependencias JS y Solidity fijadas.

```sh
pnpm install:all
pnpm build:contracts
pnpm dev:web
pnpm dev:wallet-core
pnpm dev:flow
```

Para desarrollo local, copiar `apps/web/.env.example` a `apps/web/.env.local` y
`gatopago-wallet-core/.env.example` a `gatopago-wallet-core/.env`. Completar los
identificadores públicos de Firebase en Web y sus credenciales privadas en Wallet
Core. Mantener iguales las variables públicas compartidas. Aplicar el esquema local:

```sh
pnpm --filter gatopago-wallet-core exec wrangler d1 migrations apply WALLET_DB --local
```

Abrir **http://localhost:3000**; Wallet Core escucha en **http://localhost:8787**.
Las passkeys usan `localhost` como RP; `127.0.0.1` es otro origen. Los archivos locales
están ignorados por Git. El registro requiere una invitación emitida con
`pnpm wallet:invites issue --local --issuer daniel --hours 24 --capacity 1`.

Las URLs, proyecto Firebase, redes habilitadas, endpoints RPC y clave de relayer
se configuran por variables. `GATOPAGO_ENVIRONMENT` sólo etiqueta los registros
(`staging` o `production`); no elige dominios. Las direcciones y hashes de contratos
permanecen en los artefactos de despliegue revisados; no se toman de respuestas HTTP.
El paymaster no está desplegado. El relayer utiliza `PRIVATE_KEY` exportada en
la terminal; `.env` permite que Wrangler lea las variables del proceso.
No hace falta copiar la clave al archivo. El Worker remoto reutiliza ese binding
secreto ya cargado en `gatopago-wallet-core`.
Arrancar Wallet Core desde la misma terminal:

```sh
# Con PRIVATE_KEY ya exportada desde tu keystore:
pnpm dev:wallet-core
```

El argumento `--account` es el alias de tu keystore de Foundry. El envío requiere
ETH de prueba para el relayer y fondos para el gas de la cuenta. El login no requiere
esa clave.

`pnpm check:backends` verifica fronteras, tipos, lint, pruebas unitarias y workerd/D1 de ambos backends. `pnpm verify:ci` agrega Web y verificaciones contractuales. No implica despliegue ni certificación de producción.

El arranque local usa D1 y colas locales, sin crear recursos remotos. Wallet Core conecta rutas y jobs desde `src/runtime/catalog.ts`; comparte con Web el perfil del Account V3 desplegado en Arbitrum Sepolia. Su activación requiere habilitar la red y provisionar los proveedores del entorno.

- [Wallet Core](gatopago-wallet-core/README.md)
- [Flow](gatopago-flow/README.md)
- [Build y despliegue](DEPLOY.md)
- [Estado de los backends](docs/operations/backend-status.md)
