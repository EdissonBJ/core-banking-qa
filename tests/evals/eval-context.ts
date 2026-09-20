import fs from "node:fs";
import path from "node:path";

export interface ScriptedTransfer {
  description: string;
  amountCents: number;
  direction: "out" | "in";
  counterpartAccountNumber: string;
}

export interface EvalContext {
  token: string;
  accountId: string;
  accountNumber: string;
  openingBalanceCents: number;
  finalBalanceCents: number;
  movementCount: number;
  transfers: ScriptedTransfer[];
  baseURL: string;
}

const CONTEXT_PATH = path.join(process.cwd(), "test-results", "eval-context.json");

// Lee lo que escribió tests/evals-setup/eval-context.setup.ts. Ese archivo
// corre como su propio project (dependencies: ['evals-setup']) antes de
// que arranque ningún spec de tests/evals/, así que para cuando esto se
// llama el archivo ya existe.
export function loadEvalContext(): EvalContext {
  if (!fs.existsSync(CONTEXT_PATH)) {
    throw new Error(
      `No se encontró ${CONTEXT_PATH}. ¿Corriste esto vía "npm run test:evals"? ` +
        `Ese script incluye el project "evals-setup" que genera este archivo.`
    );
  }
  return JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
}
