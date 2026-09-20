import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { loginResponseSchema, errorResponseSchema } from "../../src/schemas";

// Sin dependencias de datos propios: estos casos no mueven saldo ni
// necesitan cuentas dedicadas, así que corren perfectamente en paralelo
// entre sí y con el resto de la suite.
test.describe("API auth", () => {
  test("login con credenciales válidas devuelve 200 y un token con exp futuro", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: process.env.TEST_USER, password: process.env.TEST_PASSWORD },
    });

    expect(response.status()).toBe(200);
    const body = loginResponseSchema.parse(await response.json());

    const decoded = jwt.decode(body.token) as { exp?: number } | null;
    expect(decoded?.exp).toBeDefined();
    expect(decoded!.exp! * 1000).toBeGreaterThan(Date.now());
  });

  test("login con password incorrecto devuelve 401 y no filtra si el usuario existe", async ({ request }) => {
    const [existingUserWrongPassword, nonexistentUser] = await Promise.all([
      request.post("/api/auth/login", {
        data: { email: process.env.TEST_USER, password: "definitivamente-incorrecta" },
      }),
      request.post("/api/auth/login", {
        data: { email: "no-existe@bank.local", password: "cualquiera" },
      }),
    ]);

    expect(existingUserWrongPassword.status()).toBe(401);
    expect(nonexistentUser.status()).toBe(401);

    const [existingBody, nonexistentBody] = await Promise.all([
      existingUserWrongPassword.json(),
      nonexistentUser.json(),
    ]);

    errorResponseSchema.parse(existingBody);
    errorResponseSchema.parse(nonexistentBody);

    // La clave del test: ambas respuestas deben ser indistinguibles, si no
    // un atacante podría usar el mensaje/código para enumerar emails
    // válidos.
    expect(existingBody).toEqual(nonexistentBody);
  });

  test("request sin Authorization y con token malformado devuelven 401", async ({ request }) => {
    const noHeader = await request.get("/api/accounts");
    expect(noHeader.status()).toBe(401);
    errorResponseSchema.parse(await noHeader.json());

    const malformed = await request.get("/api/accounts", {
      headers: { Authorization: "Bearer esto-no-es-un-jwt" },
    });
    expect(malformed.status()).toBe(401);
    errorResponseSchema.parse(await malformed.json());
  });
});
