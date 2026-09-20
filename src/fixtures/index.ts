import { test as base, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";
import dotenv from "dotenv";
import { LoginPage } from "../pages/LoginPage";

dotenv.config();

const TEST_USER = process.env.TEST_USER ?? "";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

interface Fixtures {
  authenticatedPage: Page;
  apiClient: APIRequestContext;
  dbClient: Client;
}

export const test = base.extend<Fixtures>({
  // Página ya logueada: recorre el form de login real (no storageState, ver
  // sut/public/app.js — el token vive solo en memoria del lado del cliente).
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER, TEST_PASSWORD);
    await use(page);
  },

  // Request context con bearer token ya seteado. Logueamos una vez con un
  // context anónimo para obtener el token y lo descartamos. baseURL es el
  // origin pelado (sin /api): con un origin+path como base, un request path
  // que empieza con "/" pisa el path de la base en vez de agregarse (regla
  // de resolución de URL), así que mantenemos el prefijo /api en cada path.
  apiClient: async ({ playwright }, use) => {
    const anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
    const loginResponse = await anonymous.post("/api/auth/login", {
      data: { email: TEST_USER, password: TEST_PASSWORD },
    });
    const { token } = await loginResponse.json();
    await anonymous.dispose();

    const authed = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(authed);
    await authed.dispose();
  },

  // Cliente pg propio (no el de sut/db.ts) dentro de una transacción que
  // siempre se revierte, para no dejar estado entre tests.
  dbClient: async ({}, use) => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await use(client);
    await client.query("ROLLBACK");
    await client.end();
  },
});

export { expect } from "@playwright/test";
