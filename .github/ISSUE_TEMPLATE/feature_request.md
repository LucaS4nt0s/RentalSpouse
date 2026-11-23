---
name: "✨ Nova Funcionalidade (Feature / User Story)"
about: "Propor ou especificar uma nova funcionalidade para o RentalSpouse"
title: "[FEAT] "
labels: ["enhancement"]
assignees: ""
---

## 📖 História de Usuário / Contexto
Como **[cliente | profissional | administrador]**, quero **[ação clara]**, para que **[valor de negócio entregue]**.

## 🎯 Escopo Técnico Afetado
- [ ] `backend/` (Rotas, Schemas, Models, Migrations, Services)
- [ ] `web/` (Next.js App Router / Componentes / Estados de UI)
- [ ] `mobile/` (React Native / Expo)
- [ ] `packages/shared-search/` (Lógica compartilhada)
- [ ] `infra/` / `docs/` (Docker, `.env.example`, Documentação em `docs/`)

## ✅ Critérios de Aceite
- [ ] **Dado que** [pré-condição], **quando** [ação executada], **então** [resultado observável].
- [ ] Erros de validação e permissão retornam códigos HTTP semânticos (`400/401/403/404/409/422`) e mensagens claras em PT-BR.
- [ ] Se houver listagem ou consumo de API na UI, os 4 estados (*Loading*, *Error*, *Empty* e *Success*) estão tratados.
- [ ] Cobertura de testes automatizados incluída conforme `AI_RULES.md`.

## 🚫 Fora de Escopo
- [Listar explicitamente o que NÃO faz parte desta entrega]
