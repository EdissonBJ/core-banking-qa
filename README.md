# core-banking-qa

Three-layer QA harness (UI / API / DB) over a simplified core banking system.
Playwright + TypeScript + Postgres. BFSI-oriented: double-entry ledger,
idempotency, audit trail.

## Quick start
```bash
cp .env.example .env
npm i
npm run db:up
npm test
```

## Layers
| Layer | Path | Validates |
|-------|------|-----------|
| UI | `tests/ui` | End-to-end user flows |
| API | `tests/api` | Contracts, auth, idempotency, negatives |
| DB | `tests/db` | Accounting invariants, audit trail, side effects |

Conventions for AI code generation live in `CLAUDE.md` and
`.github/copilot-instructions.md`.
