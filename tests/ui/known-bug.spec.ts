import { test, expect } from "../../src/fixtures";

test.describe("UI bugs conocidos", () => {
  test("FINDING-002: page.reload() no mantiene la sesión autenticada", async ({ authenticatedPage }) => {
    test.fail(
      true,
      "FINDING-002: sut/public/app.js guarda el JWT solo en una variable de estado JS en memoria del cliente " +
        "(no localStorage ni cookies), así que page.reload() la pierde y la app vuelve a mostrar el login. Este " +
        "test documenta el defecto a propósito: mientras exista, la aserción de abajo falla como se espera y la " +
        "suite queda en verde. El día que alguien lo corrija, esa aserción empieza a pasar y Playwright reporta " +
        "esto como 'unexpected pass' (rojo), obligando a actualizar este test junto con el fix."
    );

    await test.step("recargar la página estando autenticado", async () => {
      await authenticatedPage.reload();
    });

    await test.step("se espera que la sesión se mantenga (hoy no ocurre)", async () => {
      await expect(authenticatedPage.getByTestId("dashboard-view")).toBeVisible();
    });
  });
});
