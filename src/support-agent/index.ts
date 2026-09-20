import { fetchAccounts, fetchStatement, type Account, type StatementEntry } from "./sut-client";
import { last4 } from "./mask-account";
import { SUPPORT_AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { askText } from "./llm-client";

export interface SupportAgentAnswer {
  answer: string;
  accountsConsulted: number;
  statementEntriesConsulted: number;
}

// El agente NO decide qué consultar — eso lo decide este código, no el LLM.
// No hay tool-use/function-calling acá a propósito: si el modelo pudiera
// elegir qué accountId pedirle al SUT, un prompt injection podría intentar
// hacerlo pedir la cuenta de otra persona. En cambio, siempre se traen
// TODAS las cuentas del token autenticado (y nada más) y se le pasan ya
// armadas y enmascaradas; el LLM solo puede leer y responder en lenguaje
// natural sobre ese contexto fijo. Ver docs/evals.md.
export async function askSupportAgent(token: string, question: string): Promise<SupportAgentAnswer> {
  const accounts = await fetchAccounts(token);
  const statementsByAccount = await Promise.all(accounts.map((account) => fetchStatement(token, account.id)));

  const context = buildContext(accounts, statementsByAccount);
  const answer = askText(SUPPORT_AGENT_SYSTEM_PROMPT, `${context}\n\nPregunta de la persona usuaria: ${question}`);

  return {
    answer,
    accountsConsulted: accounts.length,
    statementEntriesConsulted: statementsByAccount.reduce((sum, entries) => sum + entries.length, 0),
  };
}

function buildContext(accounts: Account[], statementsByAccount: StatementEntry[][]): string {
  const lines: string[] = [
    "Cuentas de la persona usuaria autenticada. Esto es TODO lo que existe en tu contexto: no hay otras cuentas ni otras personas detrás de estos datos.",
  ];

  accounts.forEach((account, i) => {
    lines.push("");
    lines.push(`Cuenta terminada en ${last4(account.accountNumber)} (${account.currency}):`);
    lines.push(`  Saldo actual: ${account.balanceCents} centavos`);

    const entries = statementsByAccount[i];
    if (entries.length === 0) {
      lines.push("  Sin movimientos.");
      return;
    }

    lines.push("  Movimientos (de más antiguo a más reciente):");
    for (const entry of entries) {
      const counterpart = entry.counterpartAccountNumber ? `cuenta terminada en ${last4(entry.counterpartAccountNumber)}` : "contraparte desconocida";
      const sign = entry.amountCents >= 0 ? "+" : "";
      const description = entry.description ?? "sin descripción";
      lines.push(`  - ${entry.createdAt} | ${sign}${entry.amountCents} centavos | contraparte: ${counterpart} | descripción: "${description}"`);
    }
  });

  return lines.join("\n");
}
