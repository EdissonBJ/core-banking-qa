# core-banking-qa

Harness de QA de tres capas (UI, API, DB) sobre un core bancario simplificado.
Proyecto de práctica para entrevista senior QA Automation + AI, dominio BFSI.

## Stack
Playwright Test + TypeScript. Postgres 16 vía Docker. zod para validación de schemas.
SUT: Express + TypeScript + Postgres, en `sut/`.

## Arquitectura de tests

| Capa | Ubicación | Valida |
|------|-----------|--------|
| UI | `tests/ui` | Flujos de usuario end to end |
| API | `tests/api` | Contratos, auth, idempotencia, negativos |
| DB | `tests/db` | Invariantes contables, audit trail, side effects |

Regla de oro: cada aserción vive en la capa más barata que pueda detectar el fallo.
No dupliques en UI lo que ya cubre API.

## Convenciones obligatorias

- Locators semánticos: `getByRole`, `getByLabel`, `getByTestId`. Prohibido CSS
  frágil, XPath y selectores por clase generada.
- Prohibido `waitForTimeout`, `waitForLoadState('networkidle')` y sleeps manuales.
  Usa web-first assertions (`await expect(locator).toBeVisible()`) y `expect.poll`.
- Setup de datos siempre por API o SQL, nunca por UI. La UI solo se usa para
  verificar lo que la UI debe mostrar.
- Todo test usa fixtures de `src/fixtures`. Nada de instanciar clientes dentro del test.
- Todo test UI se estructura con `test.step` por fase del flujo.
- Toda respuesta de API se valida contra un schema zod de `src/schemas`.
- Tests independientes y paralelizables. Cero estado compartido entre specs.
- Dinero: nunca float. Enteros en centavos o decimal de Postgres.
- Nombres de test descriptivos del comportamiento de negocio, no del click.
  Bien: "rechaza transferencia con saldo insuficiente y no altera el ledger".
  Mal: "test transfer 2".

## Page Object Model
Una clase por página en `src/pages`. Exponen acciones de negocio
(`transfer(from, to, amount)`), no acciones de UI (`clickSubmitButton()`).
Los POM no contienen aserciones de negocio.

## Fixtures disponibles
- `authenticatedPage`: page con storageState ya autenticado
- `apiClient`: request context con bearer token
- `dbClient`: conexión pg dentro de transacción, rollback automático en teardown

## Cómo trabajar en este repo
- Antes de crear un archivo, revisa si ya existe algo equivalente.
- Cambios quirúrgicos. No reescribas archivos completos por un ajuste puntual.
- Si una instrucción mía contradice estas convenciones, dímelo antes de ejecutar.
- No agregues dependencias sin justificarlo primero.

## Fuera de alcance (no proponer)
Mobile, performance testing, visual regression, Kubernetes, Terraform.