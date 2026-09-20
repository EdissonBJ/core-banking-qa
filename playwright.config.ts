import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
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
  ],
});
