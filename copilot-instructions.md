# Copilot instructions

Repo de automatización QA: Playwright + TypeScript, dominio bancario.

Al generar o sugerir código de tests:

- Usa locators semánticos de Playwright (`getByRole`, `getByLabel`, `getByTestId`).
  Nunca CSS por clase ni XPath.
- Nunca `page.waitForTimeout` ni sleeps. Usa auto-waiting y web-first assertions.
- Importa `test` desde `src/fixtures`, no desde `@playwright/test` directamente.
- Valida respuestas de API con schemas zod de `src/schemas`.
- Agrupa pasos de flujos UI con `test.step`.
- Montos monetarios como enteros en centavos. Nunca aritmética de punto flotante.
- Nombra los tests por el comportamiento de negocio esperado.
- No generes aserciones dentro de clases Page Object.