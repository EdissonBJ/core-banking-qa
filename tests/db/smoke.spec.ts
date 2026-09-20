import { test, expect } from "../../src/fixtures";

test.describe("DB smoke", () => {
  test("el ledger es consultable y devuelve una suma numérica de amount_cents", async ({ dbClient }) => {
    const { rows } = await dbClient.query("SELECT SUM(amount_cents) AS total FROM ledger_entries");

    expect(rows).toHaveLength(1);
    const total = Number(rows[0].total ?? 0);
    expect(Number.isFinite(total)).toBe(true);
  });
});
