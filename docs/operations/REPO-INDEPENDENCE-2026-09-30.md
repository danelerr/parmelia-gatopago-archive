# Independencia de proyectos — 30 de septiembre de 2026

## Resultado y alcance

Web, Wallet Core, Flow y contratos pueden instalarse, compilarse y probarse con
su propia carpeta como raíz de un repositorio. Se comprobó fuera del workspace,
en carpetas temporales sin fuentes, builds, `node_modules` ni secretos de los
otros proyectos. No se crearon repositorios remotos ni se publicó nada.

No se reescribió el producto ni se añadieron servicios. Landing y consumer siguen
en un solo Next.js, `apps/web`. Se preservaron los cambios locales anteriores
de autenticación, seguimiento del relayer y copy de onboarding.

## Qué se retiró

- `workspace:*` y enlaces vivos a productores compartidos en los tres consumidores.
- La dependencia de build/deploy de Wallet Core sobre una build concreta de Web.
- El `pretest` del backend que obligaba a compilar Solidity en otra carpeta.
- Lecturas de `../../contracts/out` desde las pruebas del backend.
- La importación del verificador del backend desde el harness de Web.
- Remapping de EntryPoint y lectura de vectores fuera de `contracts`.
- El bloqueo de deploy por modificaciones de proyectos ajenos.
- CI obligatoria que exigía instalar y validar todo el workspace para cualquier
  proyecto. La CI raíz ahora verifica cuatro copias aisladas, en jobs separados.

Los checks de integración de la raíz siguen disponibles como herramientas
opcionales. Ningún build, test, verify o deploy propio los necesita.

## Qué posee cada proyecto

| Proyecto | Entradas propias | Verificación propia |
|---|---|---|
| `apps/web` | Next.js, Tailwind, assets, configuración pública, snapshots `vendor/`, `release.json` | lint, tipos, 898 pruebas, build |
| `gatopago-wallet-core` | fuentes, migraciones Wallet D1, jobs, Wrangler, tipos generados, snapshots de protocolo/artefactos | tipos Wrangler/TS, lint, índices, logs, unitarias, workerd/D1, dry-run |
| `gatopago-flow` | fuentes, migraciones Payments D1, scheduler/colas, Wrangler, tipos generados, snapshots de protocolo/ABI | tipos Wrangler/TS, lint, índices, unitarias, workerd/D1, dry-run |
| `contracts` | Solidity, Foundry, dependencias fijadas, vectores propios y archivos históricos de deployment | integridad de dependencias, build, tests, tamaños y lint |

Cada carpeta tiene `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`.gitignore` y `.github/workflows/ci.yml` propios. Al extraer una carpeta, su
workflow queda en la raíz del nuevo repo. No necesita un checkout de los otros.

Requisitos: Node 24 y pnpm 11.23.0. Contratos necesita Foundry 1.7.1; Wallet Core
necesita Anvil de Foundry para sus pruebas locales de bytecode, pero no compilar
ni descargar el proyecto Solidity.

```sh
# Desde la raíz de cualquiera de los cuatro proyectos:
pnpm install --frozen-lockfile
# Sólo contratos, para instalar bibliotecas Solidity fijadas:
pnpm install:solidity
# Luego, en el proyecto elegido:
pnpm verify
```

Web requiere su configuración pública para build/dev. Wallet Core y Flow requieren
sus propios bindings/secretos para funcionamiento real; sus pruebas usan fixtures.
No se transfirieron secretos a los snapshots ni a las copias aisladas.

## Dependencias versionadas, no carpetas compartidas

Los paquetes seleccionados están en `vendor/*.tgz`, fijados como dependencias
`file:vendor/...` y registrados por nombre, versión, procedencia y SHA-256 en
`vendor/manifest.json`. El lockfile conserva además la integridad de instalación.
`check-vendor.mjs` rechaza bytes alterados, paquetes ausentes, archivos extra y
referencias `workspace:`/`link:`. No necesita un registro npm privado.

Son snapshots pequeños de código/assets públicos y fixtures sintéticos. No son
`node_modules`, caches o bundles de producción. El snapshot de artefactos de
pruebas contiene diez ABIs/bytecodes mínimos y ocupa aproximadamente 90 KB
comprimido; no incluye todo `contracts/out`. Brand ocupa aproximadamente 1 MB.

`shared` y `packages/*` siguen siendo los productores, no fuentes vivas del
build consumidor. Cambiarlos no modifica automáticamente una Web o un Worker.
Una versión nueva requiere entrega y revisión explícitas por consumidor.

La herramienta opcional `pnpm release:vendor` prepara/promueve snapshots en este
workspace. No corre durante build/test/deploy, no publica a npm y rechaza cambiar
bytes de una versión existente. `--replace-candidate` es únicamente para un
candidato local todavía NO publicado. Después de publicar, cambiar versión y
actualizar manifiesto/lockfile explícitamente. Los paquetes de esta entrega siguen
siendo candidatos privados `3.1.0`, no releases publicados.

## Compatibilidad y comunicación

`wallet-client-v3.1` identifica la revisión de wire/consent, no el hash de la UI.
Un cambio de copy, CSS o componente no obliga a redesplegar el backend.
`apps/web/release.json` registra procedencia del build exclusivamente dentro de
Web. Wallet Core ya no lo lee ni lo genera.

Se conservan allowlist, revocación, expiración, versión API, ambiente y pareja
generación/manifiesto contractual. Ninguno de estos campos es autenticación:
siguen siendo obligatorias firmas, permisos, nonces y evidencia monetaria.
Cambiar la semántica financiera sí exige una revisión de protocolo compatible.

La primera publicación de este candidato debe coordinar Web/Wallet por el cambio
de identificador respecto al hash antiguo. No se acepta a ciegas el cliente
antiguo ni se prometen reanudaciones de operaciones firmadas bajo otra revisión.
Esto no obliga a sincronizar builds posteriores que mantengan el mismo protocolo.

Web habla por HTTP con servicios configurados. Flow llama a `WalletIdentity`
por binding privado sólo cuando recibe una sesión Consumer; checkout anónimo y
API keys comerciales no dependen de esa sesión. Es una dependencia de servicio
del mismo entorno, no de repositorio o build. No se duplicó verificación Firebase,
no se compartió D1 y no se convirtió un fallo de identidad en acceso anónimo.

## Despliegue

Los Workers poseen `scripts/deploy.mjs`. Admiten dry-run y staging sin leer fuentes
de otro proyecto. El deploy real exige HEAD y árbol limpio sólo de ese proyecto,
integridad de snapshots, configuración/nombres previstos y D1 explícita.
Staging mantiene admisión del snapshot de entorno y secret file explícito.
Flow mantiene `PAYMENT_LIVE_ENABLED=false`.

```sh
pnpm deploy:dry-run
pnpm deploy:dry-run --staging
```

Un deploy real se invoca con `pnpm run deploy`, después de autorización separada.
No usar Wrangler directo para evadir los controles. Las credenciales y recursos
Cloudflare/Vercel actuales no se crearon, rotaron ni modificaron en este trabajo.

## Evidencia ejecutada

Comandos desde copias aisladas el 30/09/2026, aproximadamente 08:41–09:10 Bolivia:

| Área | Evidencia | Resultado |
|---|---|---|
| Web | frozen install, `test`, lint, tipos y build Next | 898 pruebas; build/tipos/lint correctos |
| Wallet Core | frozen install, `test:unit` | 755 correctas, una prueba de RPC real omitida |
| Wallet Core | `test:worker-runtime` | 1.308 correctas, 54 archivos; 476 segundos |
| Wallet Core | tipos Wrangler/TS, lint, índices/logs, build y staging deploy dry-run | correctos |
| Flow | frozen install, `test` | 60 unitarias + 42 runtime correctas |
| Flow | tipos Wrangler/TS, lint, 13 consultas, build y staging deploy dry-run | correctos |
| Contratos | frozen install, instalación Solidity, build y `test` | 395 correctas, cuatro forks omitidos |
| Contratos | tamaños y lint | correctos; Account V3 19.426 B de runtime |
| Seguridad dependencias | `pnpm audit --prod` en los tres consumidores | ninguna vulnerabilidad conocida |
| Integración opcional | ocho regresiones de independencia, ocho de fronteras, guards de deploy, Knip/ciclos, layout y vectores | correctos |

El verificador de perfil sigue confirmando los cinco artefactos del deployment
archivado. La comparación de ABI conserva la igualdad de contenido y permite
sólo normalización CRLF/LF, no cambios semánticos. Los tipos generados conservan
LF y se identifican como tales para no tratarlos como código manual.

No se ejecutó nuevamente toda `verify:ci` agregada del monorepo. Las piezas de
verificación anteriores fueron ejecutadas por área; los workflows nuevos no han
corrido en GitHub porque no hubo push. Cambios finales posteriores a las suites
completas fueron scripts/CI/documentación/tipos generados, sin cambiar reglas
monetarias o Solidity; esos auxiliares se verificaron de forma dirigida.

## Límites y continuidad

El remapping local de EntryPoint puede modificar metadata/bytecode y futuras
direcciones CREATE2. No equivale a actualizar el deployment existente. Los
archivos archivados de `contracts/deployments/421614/account-v3` se conservaron
sin cambios y siguen siendo la referencia para reproducir el despliegue del
26/09. No se cambió ninguna implementación o policy onchain.

No hubo commit, push, creación de repos, publicación de paquetes, deploy real,
migración remota, activación de mainnet, pruebas monetarias remotas ni validación
de usuario real en esta separación. No se declara completado el recorrido
consumer por pasar estos checks. Las copias de prueba quedaron en TEMP, sin
secretos, para inspección; no forman parte del repo ni de la entrega.

Siguiente paso, sólo con autorización: versionar este candidato y extraer cada
proyecto a su repo conservando todo su contenido propio (incluidos vendor,
lockfile, CI, migraciones y documentación). No volver a introducir enlaces a
carpetas hermanas al hacerlo.
