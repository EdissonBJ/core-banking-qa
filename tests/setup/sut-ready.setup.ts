import { execSync } from "node:child_process";
import { test as setup, expect } from "@playwright/test";

// Corre siempre (reuseExistingServer solo aplica a webServer, no a este
// project), así que acá es donde garantizamos schema + datos determinísticos
// antes de que ui/api/db arranquen.
setup("el SUT está migrado, sembrado y accesible", async ({ request, baseURL }) => {
  execSync("npm run sut:migrate", { stdio: "inherit" });
  execSync("npm run sut:seed", { stdio: "inherit" });

  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  const login = await request.post("/api/auth/login", {
    data: {
      email: process.env.TEST_USER,
      password: process.env.TEST_PASSWORD,
    },
  });
  expect(login.status(), `login de seed falló contra ${baseURL}`).toBe(200);
});
