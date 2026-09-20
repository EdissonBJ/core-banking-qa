import { test, expect } from "../../src/fixtures";
import {
  createSetupClient,
  getUserIdByEmail,
  getAccountIdByNumber,
  createFundedTestAccount,
} from "../../src/utils/test-data";

const SRC_ACCOUNT_NUMBER = "TEST-DB-IDEMPOTENCY-SRC";
const IDEMPOTENCY_KEY = "test-db-idempotency-key";

let srcAccountId: string;
let dstAccountId: string;

test.beforeAll(async () => {
  const client = createSetupClient();
  await client.connect();
  const ownerUserId = await getUserIdByEmail(client, process.env.TEST_USER!);
  srcAccountId = await createFundedTestAccount(client, {
    ownerUserId,
    accountNumber: SRC_ACCOUNT_NUMBER,
    openingBalanceCents: 20_000,
  });
  dstAccountId = await getAccountIdByNumber(client, "ACC-0002");
  await client.end();
});

test.describe("DB idempotencia", () => {
  test("dos requests con la misma Idempotency-Key dejan 1 fila en transfers y 2 en ledger_entries", async ({
    apiClient,
    dbClient,
  }) => {
    const payload = { fromAccountId: srcAccountId, toAccountId: dstAccountId, amountCents: 500 };

    const first = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      data: payload,
    });
    expect(first.status()).toBe(201);

    const second = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      data: payload,
    });
    expect(second.status()).toBe(201);

    const { rows: transferRows } = await dbClient.query("SELECT id FROM transfers WHERE idempotency_key = $1", [
      IDEMPOTENCY_KEY,
    ]);
    expect(transferRows).toHaveLength(1);

    const { rows: ledgerRows } = await dbClient.query("SELECT id FROM ledger_entries WHERE transfer_id = $1", [
      transferRows[0].id,
    ]);
    expect(ledgerRows).toHaveLength(2);
  });
});
