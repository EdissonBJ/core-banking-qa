import { test, expect } from "../../src/fixtures";

test.describe("UI smoke", () => {
  test("la pantalla de login se muestra al entrar", async ({ page }) => {
    await test.step("abrir la app", async () => {
      await page.goto("/");
    });

    await test.step("ver el formulario de login", async () => {
      await expect(page.getByTestId("login-form")).toBeVisible();
      await expect(page.getByTestId("login-email")).toBeVisible();
      await expect(page.getByTestId("login-password")).toBeVisible();
      await expect(page.getByTestId("login-submit")).toBeVisible();
    });
  });
});
