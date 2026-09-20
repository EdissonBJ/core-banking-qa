import { Client } from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const BANK_EQUITY_ACCOUNT_NUMBER = "ACC-0000";

// Cliente pg "crudo" para setup/teardown en beforeAll/afterAll. No se usa el
// fixture dbClient acá a propósito: dbClient envuelve cada test en
// BEGIN...ROLLBACK y muere con el test, pero beforeAll/afterAll necesitan
// escribir datos que sobrevivan (se comprometan) durante todos los tests del
// archivo.
export function createSetupClient(): Client {
  return new Client({ connectionString: DATABASE_URL });
}

export async function getUserIdByEmail(client: Client, email: string): Promise<string> {
  const { rows } = await client.query("SELECT id FROM users WHERE email = $1", [email]);
  if (!rows[0]) {
    throw new Error(`No existe el usuario seed ${email}. ¿Corrió tests/setup?`);
  }
  return rows[0].id;
}

// Crea un usuario de test propio, con contraseña hasheada como lo hace
// sut/routes/auth.ts (bcrypt), para poder loguearlo por la UI real. Se usa
// en vez de reutilizar el user_id de un usuario del seed cuando el test
// necesita loguearse y ver SU cuenta dedicada como la cuenta activa: la UI
// (sut/public/app.js) solo muestra accounts[0] — la primera por
// account_number — y no tiene selector de cuenta, así que un usuario con
// una sola cuenta propia es la única forma de garantizar cuál se ve.
export async function createTestUser(
  client: Client,
  params: { email: string; password: string; fullName?: string }
): Promise<string> {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const { rows } = await client.query(
    "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id",
    [params.email, passwordHash, params.fullName ?? "Usuario de test"]
  );
  return rows[0].id;
}

export async function getAccountIdByNumber(client: Client, accountNumber: string): Promise<string> {
  const { rows } = await client.query("SELECT id FROM accounts WHERE account_number = $1", [accountNumber]);
  if (!rows[0]) {
    throw new Error(`No existe la cuenta ${accountNumber}`);
  }
  return rows[0].id;
}

// Crea una cuenta propia del spec y, si se pide saldo inicial, la fondea con
// una transferencia real desde la cuenta de patrimonio del banco (misma
// lógica que sut/seed.ts) para no romper el invariante global de doble
// partida que valida tests/db/ledger-invariants.spec.ts.
export async function createFundedTestAccount(
  client: Client,
  params: { ownerUserId: string; accountNumber: string; openingBalanceCents: number }
): Promise<string> {
  const { rows: accountRows } = await client.query(
    "INSERT INTO accounts (user_id, account_number) VALUES ($1, $2) RETURNING id",
    [params.ownerUserId, params.accountNumber]
  );
  const accountId: string = accountRows[0].id;

  if (params.openingBalanceCents > 0) {
    const bankEquityId = await getAccountIdByNumber(client, BANK_EQUITY_ACCOUNT_NUMBER);
    const { rows: transferRows } = await client.query(
      `INSERT INTO transfers (from_account_id, to_account_id, amount_cents, description)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [bankEquityId, accountId, params.openingBalanceCents, "Fondeo de cuenta de test"]
    );
    const transferId = transferRows[0].id;
    await client.query(
      `INSERT INTO ledger_entries (transfer_id, account_id, amount_cents) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [transferId, bankEquityId, -params.openingBalanceCents, accountId, params.openingBalanceCents]
    );
  }

  return accountId;
}

export async function getAccountBalanceCents(client: Client, accountId: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger_entries WHERE account_id = $1",
    [accountId]
  );
  return Number(rows[0].total);
}
