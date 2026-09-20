import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import {
  createSetupClient,
  createTestUser,
  createFundedTestAccount,
  getAccountIdByNumber,
  getAccountBalanceCents,
} from "../../src/utils/test-data";

// Cuenta dedicada, con un historial de movimientos 100% conocido de
// antemano, para que golden.json pueda tener criterios de evaluación
// precisos ("el saldo debe ser X", "el total gastado debe ser Y") en vez de
// vagos. account_number sigue el formato real del SUT (ACC-\d{4}) a
// propósito: guardrails.spec.ts y prompt-injection.spec.ts chequean con
// regex que ese patrón completo nunca aparezca en una respuesta, y con un
// prefijo distinto (p. ej. "TEST-EVALS-...") ese chequeo no probaría nada
// sobre el formato real de cuenta.
const EVAL_EMAIL = "eval-agent@bank.local";
const EVAL_PASSWORD = "EvalAgent1!";
const EVAL_ACCOUNT_NUMBER = "ACC-9001";
const OPENING_BALANCE_CENTS = 200_000;

const CONTEXT_PATH = path.join(process.cwd(), "test-results", "eval-context.json");

interface ScriptedTransfer {
  description: string;
  amountCents: number;
  direction: "out" | "in";
  counterpartAccountNumber: string;
}

// Guionado a mano así el saldo final y cada total parcial son un número
// exacto y conocido (ver docs/evals.md y los criteria de golden.json):
//   200000 - 15000 - 5000 + 30000 - 2500 = 207500
const SCRIPTED_TRANSFERS: ScriptedTransfer[] = [
  { description: "Pago de alquiler", amountCents: 15_000, direction: "out", counterpartAccountNumber: "ACC-0002" },
  { description: "Cena con amigos", amountCents: 5_000, direction: "out", counterpartAccountNumber: "ACC-0002" },
  { description: "Devolución préstamo", amountCents: 30_000, direction: "in", counterpartAccountNumber: "ACC-0002" },
  { description: "Suscripción streaming", amountCents: 2_500, direction: "out", counterpartAccountNumber: "ACC-0002" },
];

setup("siembra la cuenta determinística que usan los evals del agente de soporte", async ({ request, baseURL }) => {
  const client = createSetupClient();
  await client.connect();

  const ownerUserId = await createTestUser(client, {
    email: EVAL_EMAIL,
    password: EVAL_PASSWORD,
    fullName: "Usuario Eval Agent",
  });
  const accountId = await createFundedTestAccount(client, {
    ownerUserId,
    accountNumber: EVAL_ACCOUNT_NUMBER,
    openingBalanceCents: OPENING_BALANCE_CENTS,
  });
  const bobAccountId = await getAccountIdByNumber(client, "ACC-0002");

  const evalLogin = await request.post("/api/auth/login", { data: { email: EVAL_EMAIL, password: EVAL_PASSWORD } });
  const { token: evalToken } = await evalLogin.json();

  const bobLogin = await request.post("/api/auth/login", { data: { email: "bob@bank.local", password: "Passw0rd!" } });
  const { token: bobToken } = await bobLogin.json();

  for (const [i, tx] of SCRIPTED_TRANSFERS.entries()) {
    const isOutgoing = tx.direction === "out";
    const response = await request.post("/api/transfers", {
      headers: { Authorization: `Bearer ${isOutgoing ? evalToken : bobToken}`, "Idempotency-Key": `eval-seed-${i}` },
      data: {
        fromAccountId: isOutgoing ? accountId : bobAccountId,
        toAccountId: isOutgoing ? bobAccountId : accountId,
        amountCents: tx.amountCents,
        description: tx.description,
      },
    });
    if (!response.ok()) {
      throw new Error(`Seed de eval falló en la transferencia "${tx.description}": ${response.status()} ${await response.text()}`);
    }
  }

  // Cross-check contra la base real en vez de confiar ciegamente en la
  // aritmética de SCRIPTED_TRANSFERS: si algún día se edita esa lista y el
  // cálculo de abajo no se actualiza en docs/evals.md / golden.json, esto
  // lo avisa acá en vez de dejar que los evals fallen en silencio con
  // criterios desactualizados.
  const expectedBalance =
    OPENING_BALANCE_CENTS +
    SCRIPTED_TRANSFERS.reduce((sum, tx) => sum + (tx.direction === "in" ? tx.amountCents : -tx.amountCents), 0);
  const realBalance = await getAccountBalanceCents(client, accountId);
  if (realBalance !== expectedBalance) {
    throw new Error(
      `Saldo real de la cuenta de eval (${realBalance}) no coincide con el esperado (${expectedBalance}). ` +
        `Revisar SCRIPTED_TRANSFERS en este archivo y los criteria en tests/evals/golden.json.`
    );
  }

  await client.end();

  fs.mkdirSync(path.dirname(CONTEXT_PATH), { recursive: true });
  fs.writeFileSync(
    CONTEXT_PATH,
    JSON.stringify(
      {
        token: evalToken,
        accountId,
        accountNumber: EVAL_ACCOUNT_NUMBER,
        openingBalanceCents: OPENING_BALANCE_CENTS,
        finalBalanceCents: realBalance,
        movementCount: SCRIPTED_TRANSFERS.length + 1, // +1 por el movimiento de apertura
        transfers: SCRIPTED_TRANSFERS,
        baseURL,
      },
      null,
      2
    )
  );
});
