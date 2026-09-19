import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth-middleware";
import { recordAudit } from "../audit";

const router = Router();
router.use(requireAuth);

const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  description: z.string().max(280).optional(),
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: "INVALID_BODY",
      message: parsed.error.issues.map((i) => i.message).join(", "),
    });
    return;
  }
  const { fromAccountId, toAccountId, amountCents, description } = parsed.data;
  const idempotencyKey = req.header("idempotency-key") ?? undefined;
  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(parsed.data))
    .digest("hex");

  if (idempotencyKey) {
    const { rows } = await pool.query(
      "SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1",
      [idempotencyKey]
    );
    const existing = rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) {
        res.status(409).json({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "La Idempotency-Key ya se usó con un payload distinto",
        });
        return;
      }
      res.status(existing.response_status).json(existing.response_body);
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: fromRows } = await client.query(
      "SELECT id, user_id FROM accounts WHERE id = $1 FOR UPDATE",
      [fromAccountId]
    );
    const fromAccount = fromRows[0];
    if (!fromAccount) {
      await client.query("ROLLBACK");
      res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "La cuenta de origen no existe" });
      return;
    }
    if (fromAccount.user_id !== req.user!.id) {
      await client.query("ROLLBACK");
      res.status(403).json({ code: "FORBIDDEN", message: "No sos el dueño de la cuenta de origen" });
      return;
    }

    const { rows: toRows } = await client.query(
      "SELECT id FROM accounts WHERE id = $1 FOR UPDATE",
      [toAccountId]
    );
    if (!toRows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "La cuenta de destino no existe" });
      return;
    }

    const { rows: balanceRows } = await client.query(
      "SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM ledger_entries WHERE account_id = $1",
      [fromAccountId]
    );
    const balanceCents = Number(balanceRows[0].balance);

    if (balanceCents < amountCents) {
      await client.query("ROLLBACK");
      res.status(422).json({
        code: "INSUFFICIENT_FUNDS",
        message: "Saldo insuficiente para completar la transferencia",
      });
      return;
    }

    const { rows: transferRows } = await client.query(
      `INSERT INTO transfers (from_account_id, to_account_id, amount_cents, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [fromAccountId, toAccountId, amountCents, description ?? null, idempotencyKey ?? null]
    );
    const transfer = transferRows[0];

    // Movimientos de doble partida: débito en origen, crédito en destino.
    const movements = [
      { accountId: fromAccountId, amountCents: -amountCents },
      { accountId: toAccountId, amountCents },
    ];
    for (const movement of movements) {
      // Si origen y destino son la misma cuenta, el débito y el crédito se
      // cancelan entre sí: evitamos insertar el movimiento neutro.
      if (fromAccountId === toAccountId && movement.amountCents < 0) {
        continue;
      }
      await client.query(
        "INSERT INTO ledger_entries (transfer_id, account_id, amount_cents) VALUES ($1, $2, $3)",
        [transfer.id, movement.accountId, movement.amountCents]
      );
    }

    await recordAudit(client, {
      actor: req.user!.email,
      action: "transfer.create",
      payload: { transferId: transfer.id, fromAccountId, toAccountId, amountCents },
    });

    const responseBody = {
      id: transfer.id,
      fromAccountId,
      toAccountId,
      amountCents,
      description: description ?? null,
      createdAt: transfer.created_at,
    };

    if (idempotencyKey) {
      await client.query(
        "INSERT INTO idempotency_keys (key, request_hash, response_status, response_body) VALUES ($1, $2, $3, $4)",
        [idempotencyKey, requestHash, 201, JSON.stringify(responseBody)]
      );
    }

    await client.query("COMMIT");
    res.status(201).json(responseBody);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
