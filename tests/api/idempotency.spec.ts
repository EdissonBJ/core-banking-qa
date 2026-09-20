import { test, expect } from "../../src/fixtures";
import {
  createSetupClient,
  getUserIdByEmail,
  getAccountIdByNumber,
  createFundedTestAccount,
} from "../../src/utils/test-data";
import { transferResponseSchema, errorResponseSchema } from "../../src/schemas";

const SRC_ACCOUNT_NUMBER = "TEST-API-IDEMPOTENCY-SRC";

test.describe("API idempotencia", () => {
  // Ver el comentario equivalente en transfers.spec.ts: beforeAll corre una
  // vez por worker, y con 2 tests en este describe fullyParallel podría
  // repartirlos y disparar el INSERT del setup dos veces. serial evita eso.
  test.describe.configure({ mode: "serial" });

  let srcAccountId: string;
  let dstAccountId: string;

  test.beforeAll(async () => {
    const client = createSetupClient();
    await client.connect();
    const ownerUserId = await getUserIdByEmail(client, process.env.TEST_USER!);
    srcAccountId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: SRC_ACCOUNT_NUMBER,
      openingBalanceCents: 50_000,
    });
    dstAccountId = await getAccountIdByNumber(client, "ACC-0003");
    await client.end();
  });

  test("replay con la misma Idempotency-Key y el mismo payload devuelve el mismo id de transferencia", async ({ apiClient }) => {
    const key = "test-api-idempotency-replay";
    const payload = { fromAccountId: srcAccountId, toAccountId: dstAccountId, amountCents: 1_000 };

    const first = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": key },
      data: payload,
    });
    expect(first.status()).toBe(201);
    const firstBody = transferResponseSchema.parse(await first.json());

    const second = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": key },
      data: payload,
    });
    expect(second.status()).toBe(201);
    const secondBody = transferResponseSchema.parse(await second.json());

    // La respuesta cacheada sale de una columna JSONB: Postgres no preserva
    // el orden de claves ahí. Por eso comparamos los objetos ya parseados
    // con toEqual (igualdad estructural) y nunca el JSON serializado como
    // string, que sí sería sensible a ese reordenamiento.
    expect(secondBody).toEqual(firstBody);
    expect(secondBody.id).toBe(firstBody.id);
  });

  test("reusar la Idempotency-Key con un payload distinto devuelve 409 IDEMPOTENCY_KEY_REUSED", async ({ apiClient }) => {
    const key = "test-api-idempotency-conflict";
    const original = { fromAccountId: srcAccountId, toAccountId: dstAccountId, amountCents: 1_000 };
    const conflicting = { ...original, amountCents: 2_000 };

    const first = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": key },
      data: original,
    });
    expect(first.status()).toBe(201);

    const second = await apiClient.post("/api/transfers", {
      headers: { "Idempotency-Key": key },
      data: conflicting,
    });
    expect(second.status()).toBe(409);
    const body = errorResponseSchema.parse(await second.json());
    expect(body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
