# sut — sistema bajo prueba

Core bancario simplificado: Express + TypeScript + Postgres, con una UI
mínima en HTML/vanilla JS servida por el mismo proceso en el puerto 3000.
Existe únicamente como sujeto de práctica para el harness de QA de este
repo (`tests/ui`, `tests/api`, `tests/db`).

## Comandos

Todos se corren desde la raíz del repo. Requieren `DATABASE_URL` definido
(ver `.env.example`) y el Postgres de `docker-compose.yml` levantado.

```bash
npm run db:up        # levanta Postgres en localhost:5433
npm run sut:migrate   # aplica las migraciones de sut/migrations
npm run sut:seed      # reseed determinístico: 3 usuarios + saldos conocidos
npm run sut:dev        # levanta el server en http://localhost:3000
```

`sut:migrate` es idempotente: lleva un registro en `schema_migrations` y
omite lo ya aplicado. `sut:seed` trunca y vuelve a poblar todas las tablas
de dominio en cada corrida (pensado para entornos de test, no producción).

## Usuarios seed

Password para los tres: `Passw0rd!`

| Email | Cuenta | Saldo inicial (centavos) |
|-------|--------|---------------------------|
| alice@bank.local | ACC-0001 | 500000 |
| bob@bank.local | ACC-0002 | 250000 |
| carol@bank.local | ACC-0003 | 100 |

Los saldos de apertura se registran como transferencias reales desde una
cuenta de patrimonio del banco (`ACC-0000`), para que el ledger global
cierre en cero desde el primer momento.

## Modelo de datos

- `users` / `accounts`: una cuenta por usuario en el seed, pero el modelo
  no lo obliga.
- `transfers`: una fila por transferencia (metadata).
- `ledger_entries`: movimientos de doble partida. Cada transferencia sana
  genera exactamente dos filas (débito en origen, crédito en destino) cuya
  suma es cero. El saldo de una cuenta es `SUM(amount_cents)` de sus
  entradas.
- `idempotency_keys`: cachea la respuesta de `POST /api/transfers` por
  `Idempotency-Key`.
- `audit_log`: append-only. Un trigger de Postgres bloquea `UPDATE` y
  `DELETE` sobre la tabla (`TRUNCATE` no está bloqueado, se usa en el seed).

## Auth

JWT (`HS256`), expira a los 15 minutos. Se envía como
`Authorization: Bearer <token>`. El secreto sale de `JWT_SECRET` (ver
`.env.example`); en local usa un valor de desarrollo por defecto si no está
definida.

## Endpoints

### `POST /api/auth/login`

Body:
```json
{ "email": "alice@bank.local", "password": "Passw0rd!" }
```

- `200` `{ token, user: { id, email, fullName } }`
- `400` `{ code: "INVALID_BODY", message }` — email/password ausentes o mal formados
- `401` `{ code: "INVALID_CREDENTIALS", message }`

### `GET /api/accounts`

Requiere auth. Lista las cuentas del usuario autenticado con saldo calculado.

- `200` `[{ id, accountNumber, currency, balanceCents }]`
- `401` `{ code: "UNAUTHORIZED" }`

### `GET /api/accounts/lookup?accountNumber=ACC-0002`

Requiere auth. Resuelve un número de cuenta público a su id, para armar el
destino de una transferencia sin conocer UUIDs internos.

- `200` `{ id, accountNumber }`
- `400` `{ code: "INVALID_QUERY" }` — falta `accountNumber`
- `404` `{ code: "ACCOUNT_NOT_FOUND" }`

### `GET /api/accounts/:id/statement`

Requiere auth y ser dueño de la cuenta. Extracto ordenado cronológicamente.

- `200` `[{ id, transferId, amountCents, description, counterpartAccountNumber, createdAt }]`
- `403` `{ code: "FORBIDDEN" }` — la cuenta no es del usuario autenticado
- `404` `{ code: "ACCOUNT_NOT_FOUND" }`

### `POST /api/transfers`

Requiere auth. Header opcional `Idempotency-Key`. Si se reintenta la misma
key con el mismo body, devuelve la respuesta original sin duplicar
movimientos. Si se reutiliza la key con un body distinto, `409`.

Body:
```json
{
  "fromAccountId": "uuid",
  "toAccountId": "uuid",
  "amountCents": 1500,
  "description": "opcional"
}
```

- `201` `{ id, fromAccountId, toAccountId, amountCents, description, createdAt }`
- `400` `{ code: "INVALID_BODY", message }`
- `403` `{ code: "FORBIDDEN" }` — `fromAccountId` no pertenece al usuario autenticado
- `404` `{ code: "ACCOUNT_NOT_FOUND" }`
- `409` `{ code: "IDEMPOTENCY_KEY_REUSED", message }`
- `422` `{ code: "INSUFFICIENT_FUNDS", message }`

### `GET /api/health`

- `200` `{ status: "ok" }` — sin auth, para chequeos de arranque en tests.

## Bug intencional

Ver [`BUGS.md`](./BUGS.md). Hay un caso concreto en el que la transferencia
se confirma en API y UI pero el ledger queda descuadrado — pensado para
practicar detección vía tests de capa DB.

## Dependencias agregadas

`express`, `jsonwebtoken`, `bcryptjs` (+ sus `@types`) como runtime del SUT,
y `tsx` como dev dependency para correr TypeScript sin paso de build.
`pg`, `zod` y `dotenv` ya estaban en el repo para la capa de test y se
reutilizan acá.
