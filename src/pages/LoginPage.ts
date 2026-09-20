import type { Locator, Page } from "@playwright/test";

export class LoginPage {
  readonly form: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.form = page.getByTestId("login-form");
    this.errorMessage = page.getByTestId("login-error");
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  // No espera ningún resultado a propósito: la sirve tanto un login exitoso
  // como uno que falla. Cada test sincroniza con su propio expect() sobre
  // lo que espera ver (dashboard vs. mensaje de error).
  async login(email: string, password: string): Promise<void> {
    await this.page.getByTestId("login-email").fill(email);
    await this.page.getByTestId("login-password").fill(password);
    await this.page.getByTestId("login-submit").click();
  }
}
