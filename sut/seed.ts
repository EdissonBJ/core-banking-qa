import bcrypt from "bcryptjs";
import { pool } from "./db";
import { recordAudit } from "./audit";

interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  accountNumber: string;
  openingBalanceCents: number;
}

// Cuenta de patrimonio del banco: contrapartida de doble partida para los
// saldos de apertura. Sin ella el ledger global no cerraría en cero.
const BANK_EQUITY = {
  email: "bank-equity@core.local",
  password: "not-a-login-account",
  fullName: "Bank Equity",
  accountNumber: "ACC-0000",
};

const USERS: SeedUser[] = [
  {
    email: "alice@bank.local",
    password: "Passw0rd!",
    fullName: "Alice Alvarez",
    accountNumber: "ACC-0001",
    openingBalanceCents: 500_000,
  },
  {
    email: "bob@bank.local",
    password: "Passw0rd!",
    fullName: "Bob Benitez",
    accountNumber: "ACC-0002",
    openingBalanceCents: 250_000,
  },
  {
    email: "carol@bank.local",
    password: "Passw0rd!",
    fullName: "Carol Cortez",
    accountNumber: "ACC-0003",
    openingBalanceCents: 100,
  },
];

async function createUserWithAccount(
  client: import("pg").PoolClient,
  user: { email: string; password: string; fullName: string; accountNumber: string }
) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const { rows: userRows } = await client.query(
    `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
    [user.email, passwordHash, user.fullName]
  );
  const userId = userRows[0].id;

  const { rows: accountRows } = await client.query(
    `INSERT INTO accounts (user_id, account_number) VALUES ($1, $2) RETURNING id`,
    [userId, user.accountNumber]
  );
  return { userId, accountId: accountRows[0].id };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reseed determinístico: limpiar en orden de dependencias.
    await client.query("TRUNCATE audit_log, idempotency_keys, ledger_entries, transfers, accounts, users");

    const bankEquity = await createUserWithAccount(client, BANK_EQUITY);

    for (const user of USERS) {
      const { accountId } = await createUserWithAccount(client, user);

      const { rows: transferRows } = await client.query(
        `INSERT INTO transfers (from_account_id, to_account_id, amount_cents, description)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [bankEquity.accountId, accountId, user.openingBalanceCents, "Apertura de cuenta"]
      );
      const transferId = transferRows[0].id;

      await client.query(
        `INSERT INTO ledger_entries (transfer_id, account_id, amount_cents) VALUES
           ($1, $2, $3),
           ($1, $4, $5)`,
        [
          transferId,
          bankEquity.accountId,
          -user.openingBalanceCents,
          accountId,
          user.openingBalanceCents,
        ]
      );

      await recordAudit(client, {
        actor: "seed-script",
        action: "transfer.create",
        payload: { transferId, fromAccountId: bankEquity.accountId, toAccountId: accountId, amountCents: user.openingBalanceCents },
      });

      console.log(`- ${user.email} (${user.accountNumber}): saldo inicial ${user.openingBalanceCents} centavos`);
    }

    await client.query("COMMIT");
    console.log("Seed completo.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
