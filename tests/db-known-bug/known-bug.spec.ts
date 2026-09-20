import { test, expect } from "../../src/fixtures";
import { createSetupClient, getUserIdByEmail, createFundedTestAccount } from "../../src/utils/test-data";

const ACCOUNT_NUMBER = "TEST-DB-KNOWN-BUG-SELF";
const OPENING_BALANCE_CENTS = 10_000;
const SELF_TRANSFER_AMOUNT_CENTS = 2_500;

test.describe("BUG-001: self-transfer descuadra el ledger", () => {
  // Ver sut/BUGS.md. POST /api/transfers con fromAccountId === toAccountId
  // se confirma (201) pero solo inserta el asiento de crédito, sin el
  // débito que lo cancela: la cuenta gana plata de la nada y
  // SUM(ledger_entries.amount_cents) deja de ser cero a nivel GLOBAL, no
  // solo para esta cuenta.
  //
  // Mientras esa fila exista, tests/db/ledger-invariants.spec.ts (que
  // valida justo ese invariante global) fallaría si corriera en paralelo
  // con esto. Por eso este spec vive en su propio directorio
  // (tests/db-known-bug/) mapeado al project "db-known-bug" en
  // playwright.config.ts, con dependencies: ['db']: Playwright no arranca
  // ese project hasta que TODO el project "db" — incluido
  // ledger-invariants.spec.ts — terminó. La serialización que evita la
  // carrera con el resto de la suite es esa dependencia entre projects, no
  // algo dentro de este archivo.
  //
  // Dentro de este describe sigue habiendo dos cosas, por motivos propios:
  //   1. mode: 'serial' — si el día de mañana se agrega otro test acá,
  //      evita que fullyParallel reparta los tests del archivo en workers
  //      distintos y dispare beforeAll más de una vez (ver el mismo
  //      problema documentado en tests/api/transfers.spec.ts). Con un solo
  //      test hoy es un no-op, pero se deja para no volver a pisar el
  //      mismo rastrillo si esto crece.
  //   2. afterAll borra exactamente el transfer y los ledger_entries que
  //      este test generó, devolviendo el invariante global a cero. Esto
  //      sigue siendo necesario aunque ya no haya carrera con otros
  //      projects: sin este cleanup, la fila rota quedaría en la base para
  //      cualquier otra corrida futura que reutilice estos datos sin
  //      resembrar.
  test.describe.configure({ mode: "serial" });

  let accountId: string;
  let transferId: string;

  test.beforeAll(async () => {
    const client = createSetupClient();
    await client.connect();
    const ownerUserId = await getUserIdByEmail(client, process.env.TEST_USER!);
    accountId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: ACCOUNT_NUMBER,
      openingBalanceCents: OPENING_BALANCE_CENTS,
    });
    await client.end();
  });

  test("transferir una cuenta a sí misma suma dinero de la nada y rompe el invariante global", async ({
    apiClient,
    dbClient,
  }) => {
    const response = await apiClient.post("/api/transfers", {
      data: { fromAccountId: accountId, toAccountId: accountId, amountCents: SELF_TRANSFER_AMOUNT_CENTS },
    });

    // El bug es justamente que esto se confirma como si fuera una
    // transferencia sana.
    expect(response.status()).toBe(201);
    transferId = (await response.json()).id;

    const { rows: entryRows } = await dbClient.query("SELECT amount_cents FROM ledger_entries WHERE transfer_id = $1", [
      transferId,
    ]);
    // Debería haber 2 asientos (débito + crédito). El bug deja solo 1.
    expect(entryRows).toHaveLength(1);
    expect(Number(entryRows[0].amount_cents)).toBe(SELF_TRANSFER_AMOUNT_CENTS);

    const { rows: sumRows } = await dbClient.query("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger_entries");
    // Todo transfer legítimo aporta 0 al total global (sus dos asientos se
    // cancelan), así que en cualquier instante el total global es
    // exactamente la suma de los transfers rotos que existan. Como este es
    // el único, el total tiene que ser exactamente el monto de este
    // self-transfer, sin importar cuántos otros specs balanceados corran en
    // paralelo al mismo tiempo.
    expect(Number(sumRows[0].total)).toBe(SELF_TRANSFER_AMOUNT_CENTS);
  });

  test.afterAll(async () => {
    if (!transferId) return;
    const client = createSetupClient();
    await client.connect();
    await client.query("DELETE FROM ledger_entries WHERE transfer_id = $1", [transferId]);
    await client.query("DELETE FROM transfers WHERE id = $1", [transferId]);
    await client.end();
  });
});
