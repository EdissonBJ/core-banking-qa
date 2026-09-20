# Matriz de trazabilidad

Una fila por test real de la suite (23 en total), derivada de los specs en
`tests/`. `Estado` es el resultado de correr `npm test` hoy, no una
proyección. Dos filas son excepción a "Pass = requisito cumplido":

- **UI-06** está marcada con `test.fail()` — el test pasa *porque* la
  aserción falla como se espera (ver [FINDING-002](../README.md#hallazgos)).
  Mientras el bug exista, la suite queda verde; si se corrige sin actualizar
  el test, Playwright lo reporta como *unexpected pass* y la suite se pone
  roja.
- **DB-06** reproduce BUG-001 a propósito (`tests/db-known-bug/`, ver
  [`sut/BUGS.md`](../sut/BUGS.md)). El test pasa porque detecta
  correctamente que el bug ocurre — el requisito de negocio de esa fila
  ("ninguna transferencia genera saldo de la nada") hoy **no** se cumple en
  el SUT.

## Setup

| Requisito de negocio | Riesgo | Test ID | Capa | Estado |
|---|---|---|---|---|
| El SUT debe estar migrado, sembrado con datos determinísticos y respondiendo antes de correr cualquier suite. | Tests corriendo contra un SUT no migrado/sembrado producen falsos positivos o negativos y esconden regresiones reales. | SETUP-01 | Setup | Pass |

## UI

| Requisito de negocio | Riesgo | Test ID | Capa | Estado |
|---|---|---|---|---|
| Un usuario con credenciales válidas puede iniciar sesión y ver el número de su cuenta. | Un login roto bloquea el acceso de todos los clientes al banco. | UI-01 | UI | Pass |
| Un usuario con credenciales inválidas recibe un error claro y no entra a la app. | Un mensaje ambiguo, o un login que deja pasar credenciales inválidas, es una falla de seguridad y de UX. | UI-02 | UI | Pass |
| Una transferencia exitosa refleja el nuevo saldo correctamente en la pantalla del usuario, con el delta exacto. | Un saldo mal mostrado en la UI, aunque el backend esté bien, genera desconfianza y tickets de soporte. | UI-03 | UI | Pass |
| Si el saldo es insuficiente, la transferencia se rechaza visiblemente y el saldo no cambia. | Un error silencioso, o un saldo alterado sin que la operación se haya completado, rompe la confianza del usuario en su propio extracto. | UI-04 | UI | Pass |
| El extracto refleja el movimiento recién creado, con el monto y el signo correctos, sin recargar manualmente. | Un extracto desactualizado o con signos invertidos hace que el usuario no pueda confiar en su propio historial. | UI-05 | UI | Pass (test.fail) — documenta FINDING-002 |
| La sesión de un usuario autenticado sobrevive a un refresh de página. | Perder la sesión en cada reload obliga a re-loguearse constantemente; en un banco real erosiona confianza y aumenta soporte. | UI-06 | UI | Pass (test.fail) — documenta FINDING-002 |
| La pantalla de login está disponible al entrar a la aplicación. | Wiring smoke test: si esto falla, ningún otro test de UI es confiable. | UI-07 | UI | Pass |

## API

| Requisito de negocio | Riesgo | Test ID | Capa | Estado |
|---|---|---|---|---|
| El login emite un token de sesión con expiración acotada (15 min). | Un token sin expiración, o con `exp` ya vencido, es una superficie de ataque de sesión indefinida. | API-01 | API | Pass |
| El sistema no revela si un email está registrado a través de la respuesta de login. | La enumeración de usuarios es el primer paso de un ataque de credential stuffing dirigido. | API-02 | API | Pass |
| Todo endpoint sobre datos de cuenta exige un token de autenticación válido (ausente o malformado → 401). | Un endpoint accesible sin token, o que acepta tokens malformados, expone datos financieros de cualquier usuario. | API-03 | API | Pass |
| Una transferencia válida mueve exactamente el monto indicado, con signo opuesto en cada cuenta. | Cualquier desvío en el monto movido es, literalmente, plata que aparece o desaparece del sistema. | API-04 | API | Pass |
| El sistema rechaza transferencias que excedan el saldo disponible, sin alterar el saldo de origen. | Permitir sobregiros no controlados es un riesgo de crédito no autorizado. | API-05 | API | Pass |
| Bajo transferencias concurrentes desde la misma cuenta, nunca se permite gastar más de lo disponible. | Una condición de carrera en el control de saldo permite vaciar una cuenta por encima de su saldo real — el "lost update" clásico y más caro de un sistema bancario. | API-06 | API | Pass |
| Reintentar una transferencia con la misma `Idempotency-Key` y el mismo payload devuelve el mismo resultado sin duplicar movimientos. | Sin idempotencia, un reintento de red (timeout, retry del cliente) duplica el dinero movido. | API-07 | API | Pass |
| Reusar una `Idempotency-Key` con un payload distinto se rechaza explícitamente (409). | Aceptar payloads distintos bajo la misma key permite que una key reusada encubra una operación distinta a la original. | API-08 | API | Pass |
| El endpoint de login responde. | Wiring smoke test. | API-09 | API | Pass |

## DB

| Requisito de negocio | Riesgo | Test ID | Capa | Estado |
|---|---|---|---|---|
| La contabilidad de doble partida cierra en cero a nivel global, en todo momento. | Un desbalance global significa dinero creado o destruido sin origen/destino: el invariante contable más fundamental de un ledger. | DB-01 | DB | Pass |
| Cada transferencia individual genera exactamente 2 asientos que suman cero. | Una transferencia con un asiento de más o de menos rompe la trazabilidad de esa operación puntual, aunque el total global compense por casualidad. | DB-02 | DB | Pass |
| El audit log es inmutable: ni con acceso directo a la base se puede alterar o borrar el historial de auditoría. | Un audit trail modificable no sirve como evidencia ante un incidente de fraude o una auditoría regulatoria. | DB-03 | DB | Pass |
| La idempotencia también se sostiene a nivel de filas: una key repetida no genera transferencias ni asientos duplicados en la base. | Complementa API-07 desde el ángulo de persistencia: una respuesta HTTP correcta con datos duplicados en la base sigue siendo una falla grave, invisible para un test que solo mira la respuesta. | DB-04 | DB | Pass |
| El ledger es consultable. | Wiring smoke test. | DB-05 | DB | Pass |
| Ninguna transferencia, bajo ningún caso, genera saldo de la nada. | El riesgo más grave posible en un sistema bancario: creación de dinero no respaldado. Reproduce BUG-001 a propósito (self-transfer inserta un solo asiento). | DB-06 | DB (project `db-known-bug`) | Pass — reproduce el defecto; el requisito de negocio **no** se cumple hoy |
