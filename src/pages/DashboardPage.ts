import type { Locator, Page } from "@playwright/test";

export interface StatementRow {
  date: string;
  counterpart: string;
  description: string;
  amountCents: number;
}

// Una sola clase para todo lo que hay después del login: sut/public/index.html
// es una única pantalla (dashboard-view), no varias páginas navegables, así
// que separar DashboardPage/TransferPage sería artificial.
export class DashboardPage {
  readonly root: Locator;
  readonly accountNumber: Locator;
  readonly balance: Locator;
  readonly transferError: Locator;
  readonly transferSuccess: Locator;
  readonly statementRows: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId("dashboard-view");
    this.accountNumber = page.getByTestId("account-number");
    this.balance = page.getByTestId("account-balance");
    this.transferError = page.getByTestId("transfer-error");
    this.transferSuccess = page.getByTestId("transfer-success");
    this.statementRows = page.getByTestId("statement-row");
  }

  async getAccountNumber(): Promise<string> {
    return ((await this.accountNumber.textContent()) ?? "").trim();
  }

  async getBalanceCents(): Promise<number> {
    return Number(((await this.balance.textContent()) ?? "").trim());
  }

  async transfer(toAccountNumber: string, amountCents: number, description?: string): Promise<void> {
    await this.page.getByTestId("transfer-to-account").fill(toAccountNumber);
    await this.page.getByTestId("transfer-amount-cents").fill(String(amountCents));
    if (description) {
      await this.page.getByTestId("transfer-description").fill(description);
    }
    await this.page.getByTestId("transfer-submit").click();
  }

  async getStatementRows(): Promise<StatementRow[]> {
    const rows = await this.statementRows.all();
    const parsed: StatementRow[] = [];
    for (const row of rows) {
      const cells = await row.locator("td").allTextContents();
      parsed.push({
        date: (cells[0] ?? "").trim(),
        counterpart: (cells[1] ?? "").trim(),
        description: (cells[2] ?? "").trim(),
        amountCents: Number((cells[3] ?? "0").trim()),
      });
    }
    return parsed;
  }
}
