import { test, expect } from "../../src/fixtures";
import { LoginPage } from "../../src/pages/LoginPage";
import { DashboardPage } from "../../src/pages/DashboardPage";
import { createSetupClient, createTestUser, createFundedTestAccount } from "../../src/utils/test-data";

const PASSWORD = "Test1234!";

const VALID_EMAIL = "test-ui-transfer-valid@bank.local";
const VALID_SRC_ACCOUNT = "TEST-UI-TRANSFER-VALID-SRC";
const VALID_OPENING_BALANCE_CENTS = 50_000;
const VALID_TRANSFER_AMOUNT_CENTS = 7_500;

const INSUFFICIENT_EMAIL = "test-ui-transfer-insufficient@bank.local";
const INSUFFICIENT_SRC_ACCOUNT = "TEST-UI-TRANSFER-INSUFFICIENT-SRC";
const INSUFFICIENT_OPENING_BALANCE_CENTS = 100;
const INSUFFICIENT_TRANSFER_AMOUNT_CENTS = 999_999;

const STATEMENT_EMAIL = "test-ui-transfer-statement@bank.local";
const STATEMENT_SRC_ACCOUNT = "TEST-UI-TRANSFER-STATEMENT-SRC";
const STATEMENT_OPENING_BALANCE_CENTS = 30_000;
const STATEMENT_TRANSFER_AMOUNT_CENTS = 4_200;

// Cuenta seed usada solo como destino "sink": ningún test de este archivo
// afirma nada sobre su saldo, así que compartirla con otros specs (API,
// otros tests acá) corriendo en paralelo es seguro.
const DESTINATION_ACCOUNT_NUMBER = "ACC-0002";

test.describe("UI transferencias", () => {
  // Cada caso necesita loguearse y ver SU PROPIA cuenta dedicada como la
  // cuenta activa del dashboard (no hay selector de cuenta en la UI, solo
  // se muestra accounts[0]), así que cada uno tiene su propio usuario+cuenta
  // de test, no las cuentas del seed — así no colisiona con los tests de
  // API corriendo en paralelo sobre alice/bob/carol.
  //
  // mode: 'serial' es por el mismo motivo que en tests/api/transfers.spec.ts:
  // beforeAll corre una vez por worker, y con 3 tests fullyParallel podría
  // repartirlos en workers distintos y disparar el INSERT del setup más de
  // una vez (choca contra el UNIQUE de accounts.account_number / users.email).
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const client = createSetupClient();
    await client.connect();

    const validUserId = await createTestUser(client, { email: VALID_EMAIL, password: PASSWORD });
    await createFundedTestAccount(client, {
      ownerUserId: validUserId,
      accountNumber: VALID_SRC_ACCOUNT,
      openingBalanceCents: VALID_OPENING_BALANCE_CENTS,
    });

    const insufficientUserId = await createTestUser(client, { email: INSUFFICIENT_EMAIL, password: PASSWORD });
    await createFundedTestAccount(client, {
      ownerUserId: insufficientUserId,
      accountNumber: INSUFFICIENT_SRC_ACCOUNT,
      openingBalanceCents: INSUFFICIENT_OPENING_BALANCE_CENTS,
    });

    const statementUserId = await createTestUser(client, { email: STATEMENT_EMAIL, password: PASSWORD });
    await createFundedTestAccount(client, {
      ownerUserId: statementUserId,
      accountNumber: STATEMENT_SRC_ACCOUNT,
      openingBalanceCents: STATEMENT_OPENING_BALANCE_CENTS,
    });

    await client.end();
  });

  test("transferencia exitosa: el delta del saldo en la UI es exactamente el monto", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await test.step("login", async () => {
      await loginPage.goto();
      await loginPage.login(VALID_EMAIL, PASSWORD);
      await expect(dashboardPage.root).toBeVisible();
      await expect(dashboardPage.accountNumber).toHaveText(VALID_SRC_ACCOUNT);
    });

    const before = await test.step("capturar el saldo antes de transferir", () => dashboardPage.getBalanceCents());

    await test.step("transferir", async () => {
      await dashboardPage.transfer(DESTINATION_ACCOUNT_NUMBER, VALID_TRANSFER_AMOUNT_CENTS);
    });

    await test.step("verificar el delta exacto en la UI", async () => {
      await expect(dashboardPage.transferSuccess).toBeVisible();
      await expect(dashboardPage.balance).toHaveText(String(before - VALID_TRANSFER_AMOUNT_CENTS));
    });
  });

  test("saldo insuficiente: la UI muestra el error de negocio y el saldo no cambia", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await test.step("login", async () => {
      await loginPage.goto();
      await loginPage.login(INSUFFICIENT_EMAIL, PASSWORD);
      await expect(dashboardPage.root).toBeVisible();
      await expect(dashboardPage.accountNumber).toHaveText(INSUFFICIENT_SRC_ACCOUNT);
    });

    const before = await test.step("capturar el saldo antes de intentar transferir", () =>
      dashboardPage.getBalanceCents()
    );

    await test.step("intentar transferir más de lo disponible", async () => {
      await dashboardPage.transfer(DESTINATION_ACCOUNT_NUMBER, INSUFFICIENT_TRANSFER_AMOUNT_CENTS);
    });

    await test.step("ver el error de negocio y el saldo sin cambios", async () => {
      await expect(dashboardPage.transferError).toBeVisible();
      await expect(dashboardPage.transferError).toHaveText(/insuficiente/i);
      await expect(dashboardPage.balance).toHaveText(String(before));
    });
  });

  test("el extracto refleja el movimiento recién creado, con monto y signo correctos", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await test.step("login", async () => {
      await loginPage.goto();
      await loginPage.login(STATEMENT_EMAIL, PASSWORD);
      await expect(dashboardPage.root).toBeVisible();
      await expect(dashboardPage.accountNumber).toHaveText(STATEMENT_SRC_ACCOUNT);
    });

    const rowsBefore = await test.step(
      "capturar la cantidad de filas del extracto antes de transferir",
      async () => (await dashboardPage.getStatementRows()).length
    );

    await test.step("transferir", async () => {
      await dashboardPage.transfer(DESTINATION_ACCOUNT_NUMBER, STATEMENT_TRANSFER_AMOUNT_CENTS, "pago de test UI");
    });

    await test.step("ver el nuevo movimiento en el extracto, con signo negativo (débito) y el monto correcto", async () => {
      await expect(dashboardPage.statementRows).toHaveCount(rowsBefore + 1);

      const rows = await dashboardPage.getStatementRows();
      const lastRow = rows[rows.length - 1];
      expect(lastRow.amountCents).toBe(-STATEMENT_TRANSFER_AMOUNT_CENTS);
      expect(lastRow.counterpart).toBe(DESTINATION_ACCOUNT_NUMBER);
      expect(lastRow.description).toBe("pago de test UI");
    });
  });
});
