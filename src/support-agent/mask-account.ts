// Últimos 4 caracteres de un número de cuenta (p. ej. "ACC-0001" -> "0001").
// Se usa para construir el contexto que recibe el LLM: el número completo
// nunca se arma ni se le pasa, así que estructuralmente no lo puede filtrar
// sin importar cómo se lo pidan (ver docs/evals.md).
export function last4(accountNumber: string): string {
  return accountNumber.slice(-4);
}
