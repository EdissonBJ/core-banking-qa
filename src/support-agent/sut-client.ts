// Cliente HTTP mínimo hacia el SUT real (fetch nativo, sin dependencias
// nuevas). Solo dos llamadas de solo-lectura, siempre con el bearer token
// del usuario autenticado: el SUT mismo es quien decide qué cuentas
// devuelve (GET /api/accounts) y a cuáles se puede acceder
// (GET /api/accounts/:id/statement responde 403 si la cuenta no es del
// usuario del token) — el agente nunca elige un accountId por su cuenta,
// así que no hay forma de que termine consultando una cuenta ajena.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export interface Account {
  id: string;
  accountNumber: string;
  currency: string;
  balanceCents: number;
}

export interface StatementEntry {
  id: string;
  transferId: string;
  amountCents: number;
  description: string | null;
  counterpartAccountNumber: string | null;
  createdAt: string;
}

async function sutGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    // Connection: close a propósito. askSupportAgent hace 2 GET seguidos
    // acá y DESPUÉS llama a claude -p (varios segundos). Si el fetch
    // reutiliza la conexión keep-alive por default, para la próxima
    // pregunta esa conexión ya quedó inactiva más tiempo que el
    // keepAliveTimeout de Express (5s por default en Node, sut/server.ts no
    // lo cambia y no se puede tocar sut/), así que el server ya la cerró y
    // el fetch siguiente revienta con ECONNRESET al intentar reusarla
    // (reproducido de verdad corriendo tests/evals/judge.spec.ts). Pedir
    // una conexión nueva por request es la forma correcta de arreglar esto
    // del lado del cliente sin tocar el SUT.
    headers: { Authorization: `Bearer ${token}`, Connection: "close" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} devolvió ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function fetchAccounts(token: string): Promise<Account[]> {
  return sutGet<Account[]>("/api/accounts", token);
}

export function fetchStatement(token: string, accountId: string): Promise<StatementEntry[]> {
  return sutGet<StatementEntry[]>(`/api/accounts/${accountId}/statement`, token);
}
