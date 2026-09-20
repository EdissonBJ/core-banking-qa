# core-banking-qa

Harness de QA de tres capas (UI / API / DB) sobre un core bancario
simplificado. Playwright + TypeScript + Postgres. Dominio BFSI: ledger de
doble partida, idempotencia, audit trail append-only.

## Quick start

```bash
cp .env.example .env
npm i
npm run db:up
npm test
```

Verificado desde cero (`docker compose down` + `.env` recién copiado):
23 tests, ~8-9 segundos. `npm test` levanta el SUT solo (Playwright
`webServer`, ver `playwright.config.ts`) y migra + siembra la base antes de
correr nada (project `setup`, ver `tests/setup/`) — no hace falta ningún
paso manual además de los cuatro comandos de arriba.

## Capas

| Capa | Ubicación | Valida | Project de Playwright |
|------|-----------|--------|------------------------|
| UI | `tests/ui` | Login, transferencias y extracto desde la pantalla real | `ui` |
| API | `tests/api` | Contratos, auth, idempotencia, negativos, concurrencia | `api` |
| DB | `tests/db` | Invariantes contables, audit trail, idempotencia a nivel de fila | `db` |
| DB (bug conocido) | `tests/db-known-bug` | Reproduce BUG-001 de forma aislada (ver Hallazgos) | `db-known-bug` |

`tests/setup/` (project `setup`) no es una capa de negocio: migra, siembra y
confirma que el SUT responde antes de que corra cualquier otro project.
Todos los demás dependen de él (`dependencies: ['setup']` en
`playwright.config.ts`); `db-known-bug` además depende de `db` para no
coincidir en el tiempo con el invariante global (ver el comentario en
`tests/db-known-bug/known-bug.spec.ts`).

Ver [`docs/traceability.md`](docs/traceability.md) para la matriz completa:
una fila por cada uno de los 23 tests, con el requisito de negocio y el
riesgo que cubre.

## Cómo correr cada project

```bash
npm test              # todo: setup → ui, api, db (en paralelo) → db-known-bug
npm run test:ui        # solo UI
npm run test:api       # solo API
npm run test:db        # solo DB (sin el bug conocido)
npm run test:known-bug # solo la reproducción de BUG-001
npm run report          # abre el último reporte HTML
```

`fullyParallel: true`: ningún test asume saldos absolutos ni reutiliza las
cuentas del seed cuando muta estado — cada uno crea sus propias cuentas por
SQL en `beforeAll` (`src/utils/test-data.ts`) y verifica deltas.

## Sistema bajo prueba

`sut/` — Express + TypeScript + Postgres + una UI mínima en HTML/vanilla JS,
servido en `http://localhost:3000`. Contrato completo de endpoints, modelo
de datos y comandos (`sut:migrate`, `sut:seed`, `sut:dev`) en
[`sut/README.md`](sut/README.md).

## Hallazgos

- **BUG-001** — una transferencia con cuenta de origen y destino iguales se
  confirma (201) pero solo inserta el asiento de crédito, sin el débito que
  lo cancela: la cuenta gana saldo de la nada y rompe el invariante contable
  global. Detalle en [`sut/BUGS.md`](sut/BUGS.md), reproducido en
  `tests/db-known-bug/known-bug.spec.ts`.
- **FINDING-002** — el JWT vive solo en una variable de estado en memoria
  del lado del cliente (`sut/public/app.js`), nunca en `localStorage` ni en
  una cookie: un `page.reload()` estando autenticado vuelve al login.
  Documentado con `test.fail()` en `tests/ui/known-bug.spec.ts`, así que la
  suite queda verde mientras el defecto exista y se pone roja sola el día
  que alguien lo corrija sin tocar el test.
- **FINDING-003** — la UI no tiene selector de cuenta: `GET /api/accounts`
  puede devolver varias, pero `sut/public/app.js` siempre toma
  `accounts[0]` (la primera por `account_number`) y esa es la única que se
  puede operar desde la pantalla. Un usuario con más de una cuenta no puede
  ver ni transferir desde las demás vía UI. Encontrado al escribir
  `tests/ui/transfers.spec.ts`: cada caso necesitó su propio usuario de
  test con una única cuenta, en vez de agregar cuentas extra a un mismo
  usuario, justamente para sortear esta limitación.

## CI

- `.github/workflows/ci.yml` — GitHub Actions, Postgres como service
  container, 2 shards en paralelo, publica `playwright-report/` y
  `blob-report/` como artifacts.
- `azure-pipelines.yml` — equivalente en Azure Pipelines: stages `Setup` y
  `Test`, 2 jobs paralelos por shard, `PublishTestResults@2` (JUnit) y
  `PublishBuildArtifacts@1` (HTML), con un paso comentado de
  `AzureKeyVault@2` mostrando cómo se inyectarían las credenciales en un
  entorno real. No corre contra Azure de verdad — es YAML demostrativo.

Ninguno de los dos hardcodea credenciales: todo sale de secrets/variables
del pipeline, con el mismo contrato de variables que `.env.example`.

## Convenciones para generación de código con IA

Viven en `CLAUDE.md` y `.github/copilot-instructions.md`.
