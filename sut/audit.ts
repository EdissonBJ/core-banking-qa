import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";

export async function recordAudit(
  client: Pool | PoolClient,
  params: { actor: string; action: string; payload: unknown }
): Promise<void> {
  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(params.payload))
    .digest("hex");

  await client.query(
    "INSERT INTO audit_log (actor, action, payload_hash) VALUES ($1, $2, $3)",
    [params.actor, params.action, payloadHash]
  );
}
