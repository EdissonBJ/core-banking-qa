# Bugs conocidos

## BUG-001: ledger descuadrado en transferencias a la misma cuenta

**Severidad:** alta (integridad contable).

**Síntoma:** al transferir de una cuenta hacia sí misma (cuenta de origen y
cuenta de destino idénticas), la API responde `201` y la UI muestra la
transferencia como completada, exactamente igual que en una transferencia
normal.

**Comportamiento esperado:** cualquier transferencia confirmada debe generar
dos movimientos de doble partida cuya suma sea cero (débito y crédito por el
mismo monto), sin importar qué cuentas estén involucradas.

**Comportamiento real:** en el caso de origen == destino, el saldo de la
cuenta involucrada aumenta en el monto transferido sin que exista una
contrapartida que lo compense. El invariante contable
`SUM(ledger_entries.amount_cents) = 0` agrupado por `transfer_id` se rompe
para esa transferencia puntual, y el balance de la cuenta queda por encima
de lo que deberían reflejar sus movimientos reales.

**Cómo reproducirlo:**
1. Iniciar sesión con cualquier usuario seed (ej. `alice@bank.local`).
2. Hacer una transferencia usando el propio número de cuenta como destino
   (ej. `ACC-0001` -> `ACC-0001`) por cualquier monto menor o igual al saldo.
3. Consultar `GET /api/accounts/:id/statement` o el extracto en la UI: el
   saldo de la cuenta habrá aumentado sin un movimiento de débito
   correspondiente.

**No hay validación que impida el auto-transferencia** (`fromAccountId ===
toAccountId`) en `POST /api/transfers`, lo cual es lo que permite llegar a
este caso.

Este bug es intencional, para practicar cómo un test de capa DB (invariante
contable sobre `ledger_entries`) detecta algo que las capas UI y API no ven,
porque ambas solo verifican que la operación "se confirmó".
