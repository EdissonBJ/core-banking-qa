---
description: Genera un spec de Playwright desde una user story
---

Genera un test de Playwright para esta user story: $ARGUMENTS

Procedimiento obligatorio:

1. Lee CLAUDE.md. Las convenciones de ese archivo no son negociables.
2. Usa el Playwright MCP para navegar al SUT en http://localhost:3000 e
   inspeccionar los elementos reales involucrados en el flujo. No inventes
   locators ni asumas que existen: verifícalos contra la página.
3. Determina la CAPA correcta antes de escribir código. Si la aserción se
   puede validar en API o en DB, no escribas un test de UI. Justifica la
   elección en una línea antes del código.
4. Si el flujo toca una pantalla sin Page Object, propón extender el POM
   existente en src/pages antes de escribir el spec.
5. Escribe el spec siguiendo las convenciones: locators semánticos,
   test.step por fase, deltas en vez de saldos absolutos, validación con
   schemas zod si es API.
6. Corre el test y muéstrame el resultado. Si falla, dime si es bug del SUT
   o del test antes de tocar nada.

El oracle lo defino yo. Tu escribes el código.