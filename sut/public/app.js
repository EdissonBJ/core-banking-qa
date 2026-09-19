const state = { token: null, user: null, account: null };

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const accountNumberEl = document.getElementById("account-number");
const accountBalanceEl = document.getElementById("account-balance");
const logoutButton = document.getElementById("logout-button");
const transferForm = document.getElementById("transfer-form");
const transferError = document.getElementById("transfer-error");
const transferSuccess = document.getElementById("transfer-success");
const statementBody = document.getElementById("statement-body");

function showMessage(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideMessage(el) {
  el.hidden = true;
  el.textContent = "";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.message || `Error ${res.status}`);
    error.code = body.code;
    error.status = res.status;
    throw error;
  }
  return body;
}

async function loadStatement() {
  const entries = await api(`/accounts/${state.account.id}/statement`);
  statementBody.innerHTML = "";
  for (const entry of entries) {
    const row = document.createElement("tr");
    row.dataset.testid = "statement-row";
    row.innerHTML = `
      <td>${new Date(entry.createdAt).toLocaleString()}</td>
      <td>${entry.counterpartAccountNumber ?? ""}</td>
      <td>${entry.description ?? ""}</td>
      <td>${entry.amountCents}</td>
    `;
    statementBody.appendChild(row);
  }
}

async function loadDashboard() {
  const accounts = await api("/accounts");
  [state.account] = accounts;
  accountNumberEl.textContent = state.account.accountNumber;
  accountBalanceEl.textContent = state.account.balanceCents;
  await loadStatement();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(loginError);

  const formData = new FormData(loginForm);
  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });
    state.token = result.token;
    state.user = result.user;
    loginView.hidden = true;
    dashboardView.hidden = false;
    await loadDashboard();
  } catch (err) {
    showMessage(loginError, err.message || "No se pudo iniciar sesión");
  }
});

logoutButton.addEventListener("click", () => {
  state.token = null;
  state.user = null;
  state.account = null;
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginForm.reset();
});

transferForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(transferError);
  transferSuccess.hidden = true;

  const formData = new FormData(transferForm);
  const toAccountNumber = formData.get("toAccountNumber");
  const amountCents = Number(formData.get("amountCents"));
  const description = formData.get("description") || undefined;

  try {
    const destination = await api(
      `/accounts/lookup?accountNumber=${encodeURIComponent(toAccountNumber)}`
    );
    const idempotencyKey = crypto.randomUUID();
    const result = await api("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        fromAccountId: state.account.id,
        toAccountId: destination.id,
        amountCents,
        description,
      }),
    });
    showMessage(transferSuccess, `Transferencia ${result.id} completada`);
    transferForm.reset();
    await loadDashboard();
  } catch (err) {
    showMessage(transferError, err.message || "No se pudo completar la transferencia");
  }
});
