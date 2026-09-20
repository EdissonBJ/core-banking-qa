import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // list+html alcanza para local. En CI se agrega:
  // - blob: formato intermedio por shard, pensado para fusionarse en un
  //   único playwright-report/ (ver .github/workflows/ci.yml).
  // - junit: consumido por PublishTestResults@2 en azure-pipelines.yml.
  // - json: lo lee src/agents/triage.ts cuando la suite falla, para armar
  //   el prompt de clasificación por test (ver el step "Triage" en
  //   .github/workflows/ci.yml).
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        ["blob"],
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run sut:dev",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "setup",
      testDir: "./tests/setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "ui",
      testDir: "./tests/ui",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "api",
      testDir: "./tests/api",
      dependencies: ["setup"],
    },
    {
      name: "db",
      testDir: "./tests/db",
      dependencies: ["setup"],
    },
    {
      // Separado de "db" a propósito: reproduce BUG-001 (self-transfer, ver
      // sut/BUGS.md), que rompe a propósito el invariante global de doble
      // partida mientras corre. dependencies: ['db'] garantiza que este
      // project arranca recién cuando "db" terminó por completo, así que
      // nunca coexiste en el tiempo con ledger-invariants.spec.ts. Ver el
      // comentario en tests/db-known-bug/known-bug.spec.ts.
      name: "db-known-bug",
      testDir: "./tests/db-known-bug",
      dependencies: ["db"],
    },
    {
      // No forma parte de "ui"/"api"/"db-known-bug" en npm test a
      // propósito: package.json enumera los projects de npm test
      // explícitamente sin nombrar "evals" ni "evals-setup", así que
      // corren solo cuando se piden por nombre (npm run test:evals).
      // retries: 0 fijo (sin importar CI) porque cada retry acá es una
      // llamada real a un LLM, no gratis ni instantánea — no tiene sentido
      // duplicar costo reintentando algo que ya es tolerante a variación
      // por diseño (ver el umbral agregado de tests/evals/judge.spec.ts).
      name: "evals-setup",
      testDir: "./tests/evals-setup",
      testMatch: /.*\.setup\.ts/,
      dependencies: ["setup"],
      retries: 0,
    },
    {
      name: "evals",
      testDir: "./tests/evals",
      dependencies: ["evals-setup"],
      retries: 0,
      // 12 casos de golden.json, cada uno con una llamada al agente + una
      // al juez, más guardrails/prompt-injection: son muchas llamadas
      // secuenciales a un LLM real, el timeout por test default (30s) no
      // alcanza.
      timeout: 5 * 60_000,
    },
  ],
});
