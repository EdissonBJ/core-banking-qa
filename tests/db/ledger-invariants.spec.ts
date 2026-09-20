import { test, expect } from "../../src/fixtures";

test.describe("DB invariantes de ledger", () => {
  test("invariante global: la suma de todos los movimientos es cero", async ({ dbClient }) => {
    const { rows } = await dbClient.query("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger_entries");
    expect(Number(rows[0].total)).toBe(0);
  });

  test("doble partida: toda transferencia tiene exactamente 2 asientos que suman cero", async ({ dbClient }) => {
    const { rows } = await dbClient.query(`
      SELECT transfer_id, COUNT(*) AS entry_count, SUM(amount_cents) AS total
      FROM ledger_entries
      GROUP BY transfer_id
      HAVING COUNT(*) <> 2 OR SUM(amount_cents) <> 0
    `);

    // Si esto falla, el mensaje lista los transfer_id infractores en vez de
    // un simple true/false, para no tener que ir a buscarlos a mano.
    expect(rows, `transferencias con doble partida rota: ${JSON.stringify(rows)}`).toEqual([]);
  });
});
