import { test, expect } from "@playwright/test";
import { loginResponseSchema } from "../../src/schemas";

test.describe("API smoke", () => {
  test("POST /api/auth/login devuelve 200 y un token válido", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: {
        email: process.env.TEST_USER,
        password: process.env.TEST_PASSWORD,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(() => loginResponseSchema.parse(body)).not.toThrow();
  });
});
