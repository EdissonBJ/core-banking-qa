import { Router } from "express";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth-middleware";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.account_number, a.currency,
            COALESCE((SELECT SUM(amount_cents) FROM ledger_entries WHERE account_id = a.id), 0) AS balance_cents
     FROM accounts a
     WHERE a.user_id = $1
     ORDER BY a.account_number`,
    [req.user!.id]
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      accountNumber: r.account_number,
      currency: r.currency,
      balanceCents: Number(r.balance_cents),
    }))
  );
});

// Resuelve un número de cuenta público a su id, para que el emisor de una
// transferencia pueda indicar el destino sin conocer UUIDs internos.
router.get("/lookup", async (req: AuthedRequest, res) => {
  const accountNumber = typeof req.query.accountNumber === "string" ? req.query.accountNumber : "";
  if (!accountNumber) {
    res.status(400).json({ code: "INVALID_QUERY", message: "accountNumber es requerido" });
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, account_number FROM accounts WHERE account_number = $1",
    [accountNumber]
  );
  const account = rows[0];
  if (!account) {
    res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "No existe una cuenta con ese número" });
    return;
  }

  res.json({ id: account.id, accountNumber: account.account_number });
});

router.get("/:id/statement", async (req: AuthedRequest, res) => {
  const { rows: accountRows } = await pool.query(
    "SELECT id, user_id FROM accounts WHERE id = $1",
    [req.params.id]
  );
  const account = accountRows[0];

  if (!account) {
    res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "La cuenta no existe" });
    return;
  }
  if (account.user_id !== req.user!.id) {
    res.status(403).json({ code: "FORBIDDEN", message: "No sos el dueño de esta cuenta" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT le.id, le.transfer_id, le.amount_cents, le.created_at,
            t.description,
            CASE WHEN t.from_account_id = $1 THEN dest.account_number ELSE src.account_number END AS counterpart_account_number
     FROM ledger_entries le
     JOIN transfers t ON t.id = le.transfer_id
     LEFT JOIN accounts src ON src.id = t.from_account_id
     LEFT JOIN accounts dest ON dest.id = t.to_account_id
     WHERE le.account_id = $1
     ORDER BY le.created_at ASC, le.id ASC`,
    [req.params.id]
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      transferId: r.transfer_id,
      amountCents: Number(r.amount_cents),
      description: r.description,
      counterpartAccountNumber: r.counterpart_account_number,
      createdAt: r.created_at,
    }))
  );
});

export default router;
