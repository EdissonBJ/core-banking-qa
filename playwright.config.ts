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
  ],
});
