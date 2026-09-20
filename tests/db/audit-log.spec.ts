import { test, expect } from "../../src/fixtures";

test.describe("DB audit trail", () => {
  test("audit_log es append-only: UPDATE y DELETE lanzan la excepción del trigger", async ({ dbClient }) => {
    // SAVEPOINT antes de cada intento: un error de Postgres deja la
    // transacción en estado "aborted" hasta el próximo ROLLBACK, así que sin
    // esto el segundo intento (DELETE) fallaría con "current transaction is
    // aborted" en vez del mensaje real del trigger.
    await dbClient.query("SAVEPOINT before_update");
    await expect(dbClient.query("UPDATE audit_log SET action = 'hacked' WHERE true")).rejects.toThrow(
      /append-only/i
    );
    await dbClient.query("ROLLBACK TO SAVEPOINT before_update");

    await dbClient.query("SAVEPOINT before_delete");
    await expect(dbClient.query("DELETE FROM audit_log WHERE true")).rejects.toThrow(/append-only/i);
    await dbClient.query("ROLLBACK TO SAVEPOINT before_delete");
  });
});
