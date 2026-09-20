/**
 * Triage automático de tests fallidos, para correr en CI cuando `npm test`
 * termina en rojo (ver el step `if: failure()` en .github/workflows/ci.yml).
 *
 * Lee el reporte JSON de Playwright (reporter "json", ver playwright.config.ts),
 * arma un prompt por cada test fallido/flaky con su error, su capa (el
 * project de Playwright) y el diff del último commit sobre los archivos
 * involucrados, y le pide a `claude -p` que clasifique la causa raíz en una
 * de tres categorías: "bug de producto", "test flaky" o "cambio de
 * contrato", con una línea de justificación. El resultado se imprime en
 * stdout en markdown y, si existe $GITHUB_STEP_SUMMARY, se agrega ahí
 * también.
 *
 * RESTRICCIÓN DE DISEÑO: este agente solo clasifica y reporta. No modifica
 * tests, no reintenta nada, no toca código — ni el del SUT ni el de la
 * suite. Técnicamente no puede: se invoca a `claude -p` con `--tools ""` y
 * `--restricted`, así que no tiene ninguna herramienta de archivo, shell ni
 * red disponible, solo puede leer el prompt y devolver la clasificación
 * estructurada que se le pide.
 *
 * Por qué: un test rojo en CI es una señal para un humano, no un problema
 * para que un agente resuelva solo. Si el mismo paso que diagnostica
 * también pudiera "arreglar" el test (aflojar una aserción) o el código
 * (parchear el SUT) o simplemente reintentar hasta que pase, la señal deja
 * de ser confiable: un bug de producto real podría quedar enmascarado como
 * "ya pasó" sin que nadie lo haya visto. Separar el diagnóstico de la
 * corrección — clasificar y listo — es lo que mantiene a CI como una alarma
 * en la que se puede confiar, no como un sistema que se autocura en
 * silencio.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const CATEGORIES = ["bug de producto", "test flaky", "cambio de contrato"] as const;
type Category = (typeof CATEGORIES)[number];

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    justification: { type: "string" },
  },
  required: ["category", "justification"],
  additionalProperties: false,
};

// --- Forma mínima del reporte JSON de Playwright que nos interesa. --------
// (subconjunto estructural de playwright/types/testReporter.d.ts; se declara
// acá en vez de importarla para no depender de una ruta de import interna
// del paquete que puede cambiar entre versiones)

interface JSONReportTestResult {
  status?: string;
  duration: number;
  retry: number;
  error?: { message?: string; stack?: string };
  errors: { message: string }[];
}

interface JSONReportTest {
  projectName: string;
  status: "skipped" | "expected" | "unexpected" | "flaky";
  results: JSONReportTestResult[];
}

interface JSONReportSpec {
  title: string;
  file: string;
  line: number;
  tests: JSONReportTest[];
}

interface JSONReportSuite {
  title: string;
  specs: JSONReportSpec[];
  suites?: JSONReportSuite[];
}

interface JSONReport {
  suites: JSONReportSuite[];
}

// --- Extracción de fallas ---------------------------------------------------

interface Attempt {
  retry: number;
  status: string;
  errorSummary: string;
}

interface Failure {
  fullTitle: string;
  project: string;
  file: string;
  line: number;
  status: string;
  attempts: Attempt[];
  lastError: string;
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... (truncado, ${text.length - max} caracteres más)`;
}

function summarizeResult(result: JSONReportTestResult): string {
  const messages = result.errors?.length ? result.errors.map((e) => e.message) : result.error ? [result.error.message ?? result.error.stack ?? ""] : [];
  if (messages.length === 0) return "sin error registrado";
  return stripAnsi(messages.join("\n---\n")).trim();
}

function collectSpecs(suite: JSONReportSuite, titlePath: string[], acc: Array<{ spec: JSONReportSpec; titlePath: string[] }>): void {
  const nextPath = suite.title ? [...titlePath, suite.title] : titlePath;
  for (const spec of suite.specs ?? []) {
    acc.push({ spec, titlePath: [...nextPath, spec.title] });
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, nextPath, acc);
  }
}

// Incluye tests "unexpected" (fallaron y siguen fallados tras los retries —
// esto es lo que realmente hace fallar el job) y "flaky" (fallaron al menos
// una vez pero terminaron pasando: no rompen el job, pero el historial de
// intentos es justo la evidencia que ayuda a distinguir "test flaky" de las
// otras dos categorías, así que vale la pena mandarlos igual a clasificar).
function extractFailures(report: JSONReport): Failure[] {
  const specs: Array<{ spec: JSONReportSpec; titlePath: string[] }> = [];
  for (const suite of report.suites ?? []) {
    collectSpecs(suite, [], specs);
  }

  const failures: Failure[] = [];
  for (const { spec, titlePath } of specs) {
    for (const test of spec.tests ?? []) {
      if (test.status !== "unexpected" && test.status !== "flaky") continue;

      const attempts: Attempt[] = test.results.map((result) => ({
        retry: result.retry,
        status: result.status ?? "unknown",
        errorSummary: truncate(summarizeResult(result), 1000),
      }));

      const lastResult = test.results[test.results.length - 1];
      failures.push({
        fullTitle: titlePath.join(" › "),
        project: test.projectName,
        file: path.relative(REPO_ROOT, path.resolve(REPO_ROOT, spec.file)),
        line: spec.line,
        status: test.status,
        attempts,
        lastError: truncate(lastResult ? summarizeResult(lastResult) : "sin error registrado", 4000),
      });
    }
  }
  return failures;
}

// --- Diff del último commit -------------------------------------------------

function run(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function hasPreviousCommit(): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD~1"], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Diff compartido por todas las fallas de esta corrida: todo lo que cambió
// en el último commit dentro de sut/, src/ y playwright.config.ts. No hay
// forma barata y confiable de resolver qué archivos "toca" cada test
// exactamente (requeriría seguir el grafo de imports), así que se usa esta
// heurística: sut/ y src/ son, en la práctica, todo lo que puede romper un
// test — el SUT mismo, o el harness (fixtures/pages/schemas/utils).
function getSharedDiff(): string {
  if (!hasPreviousCommit()) {
    return "(sin diff disponible: HEAD~1 no existe — checkout superficial o un solo commit en el repo)";
  }
  const diff = run(["diff", "--unified=3", "HEAD~1", "HEAD", "--", "sut", "src", "playwright.config.ts"]);
  return diff || "(el último commit no tocó sut/, src/ ni playwright.config.ts)";
}

function getSpecDiff(specFile: string): string {
  if (!hasPreviousCommit()) return "";
  return run(["diff", "--unified=3", "HEAD~1", "HEAD", "--", specFile]);
}

// --- Prompt y clasificación --------------------------------------------------

function buildPrompt(failure: Failure, diff: string): string {
  const attemptsBlock = failure.attempts
    .map((a) => `- intento ${a.retry} (${a.status}): ${a.errorSummary}`)
    .join("\n");

  return `Sos un clasificador de causa raíz para el CI de un harness de QA (Playwright + TypeScript + Postgres) sobre un core bancario simplificado, de tres capas: UI, API y DB.

Test: ${failure.fullTitle}
Capa (project de Playwright): ${failure.project}
Archivo: ${failure.file}:${failure.line}
Estado final en Playwright: ${failure.status}

Intentos:
${attemptsBlock}

Error del último intento:
${failure.lastError}

Diff del último commit sobre los archivos involucrados (el spec de este test, más sut/, src/ y playwright.config.ts):
${truncate(diff, 8000)}

Clasificá la causa raíz en exactamente una de estas tres categorías:
- "bug de producto": el comportamiento real del SUT está mal o cambió de forma no intencional; el test detectó algo genuinamente roto.
- "test flaky": el test es no-determinístico (timing, orden de ejecución, datos compartidos, condición de carrera en el test o el harness de test), sin evidencia de que el SUT esté mal.
- "cambio de contrato": el SUT cambió de comportamiento a propósito (endpoint, schema de respuesta, código de error, UI) de forma intencional, y el test quedó desactualizado respecto al nuevo contrato.

Basate únicamente en la evidencia de arriba, no inventes contexto que no está acá. Si hay más de un intento y el error cambia entre intentos, o es del tipo timeout/timing, es señal de "test flaky". Si el diff modifica sut/ de una forma que explica el error, es "bug de producto" (si parece no intencional) o "cambio de contrato" (si el nuevo comportamiento parece a propósito). Respondé con una justificación de una sola línea.`;
}

interface Classification {
  category: Category | "sin clasificar";
  justification: string;
}

function classify(prompt: string): Classification {
  const args = ["-p", "--tools", "", "--restricted", "--output-format", "json", "--json-schema", JSON.stringify(TRIAGE_SCHEMA)];
  // --bare evita cargar CLAUDE.md/hooks/memoria (innecesario para una
  // clasificación de una sola vuelta) pero exige autenticación por
  // ANTHROPIC_API_KEY explícita (no lee keychain/OAuth) — justo el modo de
  // auth que va a tener un runner de CI, así que se activa solo ahí.
  if (process.env.ANTHROPIC_API_KEY) {
    args.push("--bare");
  }

  try {
    const stdout = execFileSync("claude", args, {
      input: prompt,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    const parsed = JSON.parse(stdout);
    if (parsed.is_error || !parsed.structured_output?.category) {
      return {
        category: "sin clasificar",
        justification: `claude -p no devolvió una clasificación estructurada (result: ${truncate(String(parsed.result ?? ""), 300)}).`,
      };
    }
    return {
      category: parsed.structured_output.category,
      justification: parsed.structured_output.justification,
    };
  } catch (err) {
    return {
      category: "sin clasificar",
      justification: `No se pudo invocar "claude -p": ${(err as Error).message}`,
    };
  }
}

// --- Reporte -----------------------------------------------------------------

function renderMarkdown(entries: Array<{ failure: Failure; classification: Classification }>): string {
  const lines: string[] = [];
  lines.push("## Triage automático de tests fallidos");
  lines.push("");
  lines.push(`${entries.length} test(s) necesitan revisión.`);

  for (const { failure, classification } of entries) {
    lines.push("");
    lines.push(`### ${failure.fullTitle}`);
    lines.push("");
    lines.push(`- **Capa:** \`${failure.project}\``);
    lines.push(`- **Archivo:** \`${failure.file}:${failure.line}\``);
    lines.push(`- **Estado:** ${failure.status}${failure.attempts.length > 1 ? ` (${failure.attempts.length} intentos)` : ""}`);
    lines.push(`- **Categoría:** ${classification.category}`);
    lines.push(`- **Justificación:** ${classification.justification}`);
  }

  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const reportPath = process.env.PLAYWRIGHT_JSON_REPORT ?? path.join(REPO_ROOT, "test-results", "results.json");

  if (!fs.existsSync(reportPath)) {
    console.error(`No se encontró el reporte JSON en ${reportPath}. ¿Corrió la suite con el reporter "json" activo?`);
    process.exitCode = 1;
    return;
  }

  const report: JSONReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const failures = extractFailures(report);

  if (failures.length === 0) {
    console.log("No se encontraron tests fallidos ni flaky en el reporte.");
    return;
  }

  const sharedDiff = getSharedDiff();

  const entries = failures.map((failure) => {
    const specDiff = getSpecDiff(failure.file);
    const diff = [specDiff, sharedDiff].filter(Boolean).join("\n\n");
    const classification = classify(buildPrompt(failure, diff));
    return { failure, classification };
  });

  const markdown = renderMarkdown(entries);
  console.log(markdown);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${markdown}\n`);
  }
}

main();
