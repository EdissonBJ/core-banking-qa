import { test, expect } from "@playwright/test";
import { askSupportAgent } from "../../src/support-agent";
import { loadEvalContext } from "./eval-context";
import { judgeAnswer, type GoldenCase, type JudgeScore } from "./judge";
import goldenCasesJson from "./golden.json";

const goldenCases = goldenCasesJson as GoldenCase[];

// Ver docs/evals.md para el porqué de estos números y de por qué el umbral
// es agregado y no por caso.
const PASS_RATE_THRESHOLD = 0.85;
const GROUNDEDNESS_THRESHOLD = 4.0;
// Un caso "pasa" si el juez le da relevance >= 4 (cumple razonablemente los
// criterios). groundedness se evalúa aparte, como promedio, no como
// gate por caso.
const RELEVANCE_PASS_THRESHOLD = 4;

interface CaseResult {
  case: GoldenCase;
  answer: string;
  score: JudgeScore;
}

function renderResultsTable(results: CaseResult[]): string {
  const rows = results.map(
    (r) =>
      `| ${r.case.id} | ${r.case.category} | ${r.score.relevance} | ${r.score.groundedness} | ${r.score.reasoning.replace(/\|/g, "/")} |`
  );
  return ["| id | categoría | relevance | groundedness | razón |", "|---|---|---|---|---|", ...rows].join("\n");
}

test.describe("Evals: LLM-as-judge sobre el golden dataset", () => {
  // Un solo test agregado a propósito: golden.json tiene 12 casos, cada uno
  // implica 2 llamadas reales a un LLM (agente + juez). No hay expect() por
  // caso individual — ver docs/evals.md para la justificación completa de
  // por qué el gate es agregado.
  test("el pass rate y el groundedness promedio del golden dataset cumplen el umbral", async () => {
    const context = loadEvalContext();
    const results: CaseResult[] = [];

    for (const goldenCase of goldenCases) {
      const { answer } = await askSupportAgent(context.token, goldenCase.question);
      const score = judgeAnswer(goldenCase, answer);
      results.push({ case: goldenCase, answer, score });
    }

    const passCount = results.filter((r) => r.score.relevance >= RELEVANCE_PASS_THRESHOLD).length;
    const passRate = passCount / results.length;
    const avgGroundedness = results.reduce((sum, r) => sum + r.score.groundedness, 0) / results.length;

    const summary =
      `pass rate: ${passCount}/${results.length} = ${passRate.toFixed(2)} (umbral ${PASS_RATE_THRESHOLD})\n` +
      `groundedness promedio: ${avgGroundedness.toFixed(2)} (umbral ${GROUNDEDNESS_THRESHOLD})\n\n` +
      renderResultsTable(results);
    console.log(summary);

    expect(passRate, `pass rate por debajo del umbral.\n${summary}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
    expect(avgGroundedness, `groundedness promedio por debajo del umbral.\n${summary}`).toBeGreaterThanOrEqual(
      GROUNDEDNESS_THRESHOLD
    );
  });
});
