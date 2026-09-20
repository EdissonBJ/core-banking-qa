import { test, expect } from "../../src/fixtures";
import {
  createSetupClient,
  getUserIdByEmail,
  getAccountIdByNumber,
  createFundedTestAccount,
  getAccountBalanceCents,
} from "../../src/utils/test-data";
import { transferResponseSchema, errorResponseSchema } from "../../src/schemas";

const VALID_SRC = "TEST-API-TRANSFERS-VALID-SRC";
const VALID_DST = "TEST-API-TRANSFERS-VALID-DST";
const INSUFFICIENT_SRC = "TEST-API-TRANSFERS-INSUFFICIENT-SRC";
const CONCURRENCY_SRC = "TEST-API-TRANSFERS-CONCURRENCY-SRC";

const VALID_TRANSFER_AMOUNT_CENTS = 12_345;
const CONCURRENCY_TRANSFER_AMOUNT_CENTS = 1_000;
const CONCURRENCY_REQUEST_COUNT = 10;
const CONCURRENCY_AFFORDABLE_COUNT = 5;

test.describe("API transferencias", () => {
  // beforeAll corre una vez por worker que ejecute algún test de este
  // archivo, no una vez por archivo: bajo fullyParallel: true, Playwright
  // puede repartir los 3 tests de este describe en workers distintos, y
  // cada uno dispararía su propio beforeAll, chocando contra el UNIQUE de
  // account_number. mode: 'serial' fuerza todo el archivo a un solo worker
  // (un solo beforeAll). No es por dependencia de datos entre los tests —
  // cada uno ya usa su propia cuenta dedicada y podrían correr en paralelo
  // sin pisarse — es solo para que el setup se ejecute una única vez.
  test.describe.configure({ mode: "serial" });

  // Cada caso que muta saldo tiene su propia cuenta dedicada (creada acá,
  // una sola vez para todo el archivo) para poder afirmar deltas exactos
  // bajo fullyParallel: true sin que otro spec corriendo al mismo tiempo
  // contamine el resultado. El destino "sink" (ACC-0002, bob) sí se
  // comparte entre casos porque ninguno de ellos afirma nada sobre su
  // saldo.
  let validSrcId: string;
  let validDstId: string;
  let insufficientSrcId: string;
  let concurrencySrcId: string;
  let sharedDstId: string;

  test.beforeAll(async () => {
    const client = createSetupClient();
    await client.connect();
    const ownerUserId = await getUserIdByEmail(client, process.env.TEST_USER!);

    validSrcId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: VALID_SRC,
      openingBalanceCents: 100_000,
    });
    validDstId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: VALID_DST,
      openingBalanceCents: 0,
    });
    insufficientSrcId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: INSUFFICIENT_SRC,
      openingBalanceCents: 100,
    });
    concurrencySrcId = await createFundedTestAccount(client, {
      ownerUserId,
      accountNumber: CONCURRENCY_SRC,
      openingBalanceCents: CONCURRENCY_AFFORDABLE_COUNT * CONCURRENCY_TRANSFER_AMOUNT_CENTS,
    });
    sharedDstId = await getAccountIdByNumber(client, "ACC-0002");

    await client.end();
  });

  test("transferencia válida devuelve 201 y el delta es exactamente el monto, con signo opuesto en cada cuenta", async ({
    apiClient,
    dbClient,
  }) => {
    const srcBefore = await getAccountBalanceCents(dbClient, validSrcId);
    const dstBefore = await getAccountBalanceCents(dbClient, validDstId);

    const response = await apiClient.post("/api/transfers", {
      data: { fromAccountId: validSrcId, toAccountId: validDstId, amountCents: VALID_TRANSFER_AMOUNT_CENTS },
    });

    expect(response.status()).toBe(201);
    transferResponseSchema.parse(await response.json());

    const srcAfter = await getAccountBalanceCents(dbClient, validSrcId);
    const dstAfter = await getAccountBalanceCents(dbClient, validDstId);

    expect(srcAfter - srcBefore).toBe(-VALID_TRANSFER_AMOUNT_CENTS);
    expect(dstAfter - dstBefore).toBe(VALID_TRANSFER_AMOUNT_CENTS);
  });

  test("saldo insuficiente devuelve 422 con INSUFFICIENT_FUNDS y el saldo de origen no cambia", async ({
    apiClient,
    dbClient,
  }) => {
    const before = await getAccountBalanceCents(dbClient, insufficientSrcId);

    const response = await apiClient.post("/api/transfers", {
      data: { fromAccountId: insufficientSrcId, toAccountId: sharedDstId, amountCents: 999_999 },
    });

    expect(response.status()).toBe(422);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.code).toBe("INSUFFICIENT_FUNDS");

    const after = await getAccountBalanceCents(dbClient, insufficientSrcId);
    expect(after - before).toBe(0);
  });

  test("10 transferencias concurrentes desde la misma cuenta: el delta y el conteo en DB coinciden con las respuestas 201", async ({
    apiClient,
    dbClient,
  }) => {
    const before = await getAccountBalanceCents(dbClient, concurrencySrcId);

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY_REQUEST_COUNT }, (_, i) =>
        apiClient
          .post("/api/transfers", {
            headers: { "Idempotency-Key": `concurrency-${CONCURRENCY_SRC}-${i}` },
            data: {
              fromAccountId: concurrencySrcId,
              toAccountId: sharedDstId,
              amountCents: CONCURRENCY_TRANSFER_AMOUNT_CENTS,
            },
          })
          .then(async (response) => ({ status: response.status(), body: await response.json() }))
      )
    );

    const accepted = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 422);
    expect(accepted.length + rejected.length, `respuestas inesperadas: ${JSON.stringify(results)}`).toBe(
      CONCURRENCY_REQUEST_COUNT
    );

    for (const r of accepted) transferResponseSchema.parse(r.body);
    for (const r of rejected) {
      errorResponseSchema.parse(r.body);
      expect(r.body.code).toBe("INSUFFICIENT_FUNDS");
    }

    const after = await getAccountBalanceCents(dbClient, concurrencySrcId);

    // Anti lost-update #1: el delta real tiene que coincidir exactamente con
    // lo que las respuestas 201 dicen que se aceptó.
    expect(before - after).toBe(accepted.length * CONCURRENCY_TRANSFER_AMOUNT_CENTS);

    // Anti lost-update #2: la cuenta se fondeó para exactamente
    // CONCURRENCY_AFFORDABLE_COUNT transferencias. Si el locking de
    // POST /api/transfers tuviera una carrera (lectura de saldo sin
    // FOR UPDATE), más de esa cantidad podría colarse y el saldo terminaría
    // negativo.
    expect(after).toBeGreaterThanOrEqual(0);

    const { rows } = await dbClient.query("SELECT COUNT(*) AS count FROM transfers WHERE from_account_id = $1", [
      concurrencySrcId,
    ]);
    expect(Number(rows[0].count)).toBe(accepted.length);
  });
});
