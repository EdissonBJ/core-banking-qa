import { test, expect } from "../../src/fixtures";
import { LoginPage } from "../../src/pages/LoginPage";
import { DashboardPage } from "../../src/pages/DashboardPage";

test.describe("UI login", () => {
  // page cruda a propósito, no authenticatedPage: estos dos tests validan
  // el flujo de login en sí mismo (éxito y falla), así que no pueden partir
  // de una página que el fixture ya logueó.
  test("login con credenciales válidas muestra el dashboard con el número de cuenta", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await test.step("ir al login e ingresar credenciales válidas", async () => {
      await loginPage.goto();
      await loginPage.login(process.env.TEST_USER!, process.env.TEST_PASSWORD!);
    });

    await test.step("ver el dashboard con el número de cuenta", async () => {
      await expect(dashboardPage.root).toBeVisible();
      await expect(dashboardPage.accountNumber).toHaveText("ACC-0001");
    });
  });

  test("login con password incorrecto muestra el mensaje de error y no navega fuera del formulario", async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);

    await test.step("ir al login e ingresar una contraseña incorrecta", async () => {
      await loginPage.goto();
      await loginPage.login(process.env.TEST_USER!, "password-incorrecta");
    });

    await test.step("ver el error y seguir en el formulario de login", async () => {
      await expect(loginPage.errorMessage).toBeVisible();
      await expect(loginPage.errorMessage).toHaveText(/incorrectos/i);
      await expect(loginPage.form).toBeVisible();
      await expect(page.getByTestId("dashboard-view")).toBeHidden();
      await expect(page).toHaveURL(`${process.env.BASE_URL}/`);
    });
  });
});
