# Scope lock · fin de semana 19 al 21 sep 2026

## Objetivo único
Repo demostrable en 90 segundos que evidencie UI + API + DB + CI + AI QA
para entrevista del lunes 2:00 PM.

## Definition of done
- [ ] `git clone` limpio + `npm i` + `npm test` corre verde en menos de 5 min
- [ ] Al menos 5 tests UI, 8 tests API, 4 tests DB
- [ ] 1 bug real encontrado vía validación en DB, documentado
- [ ] Pipeline YAML (GitHub Actions + Azure DevOps) funcional
- [ ] Allure report generado
- [ ] README con traceability matrix
- [ ] Agente de triage de fallos funcionando
- [ ] Demo script de 90 segundos memorizado

## Explícitamente fuera de alcance
Mobile. Performance. Visual regression. Pact broker real. Kubernetes.
Terraform. Multi-browser. Cobertura exhaustiva. Refactors estéticos.
Cualquier feature nueva del SUT después del sábado 10:00 AM.

## Regla de corte
Si un bloque se pasa 30 min de su ventana, se corta y se avanza al siguiente.
Un repo completo al 80% vence a uno perfecto al 40%.