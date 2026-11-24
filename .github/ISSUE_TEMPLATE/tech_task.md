---
name: "🛠️ Tarefa Técnica (Tech Task / Refactor / Infra)"
about: "Refatoração arquitetural, otimização de banco, segurança, testes ou CI/CD"
title: "[TECH] "
labels: ["tech-debt"]
assignees: ""
---

## 🛠️ Objetivo Técnico
[Descrição clara da melhoria arquitetural, migração, performance, segurança ou CI/CD]

## 📐 Requisitos de Implementação
- [ ] Manter retrocompatibilidade dos contratos públicos da API (ou documentar `BREAKING CHANGE`).
- [ ] Se alterar schema relacional, manter `backend/migrations.py` idempotente e compatível com PostgreSQL 15 e SQLite em memória.
- [ ] Garantir aprovação integral da pipeline CI (`pytest` + `npm test && npm run build`).

## ✅ Critérios de Conclusão
- [ ] [Critério mensurável 1]
- [ ] [Critério mensurável 2]
