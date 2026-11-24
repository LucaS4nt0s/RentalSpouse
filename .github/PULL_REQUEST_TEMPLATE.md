## 🔗 Issue Relacionada
Closes #<numero-da-issue>

## 🏷️ Tipo de Mudança
- [ ] `feat`: Nova funcionalidade
- [ ] `fix`: Correção de bug
- [ ] `refactor` / `perf`: Melhoria técnica sem quebrar contratos
- [ ] `docs` / `chore` / `ci` / `test`: Documentação, infraestrutura ou testes
- [ ] `BREAKING CHANGE`: Mudança incompatível com versões anteriores (detalhar abaixo)

## 📌 O que foi feito
- [Resumo objetivo por camada modificada: `backend`, `web`, `mobile`, `shared-search`]
- [Lista clara dos principais arquivos criados ou alterados]

## 🎯 Motivação e Decisões Técnicas
[Breve explicação do porquê a abordagem foi escolhida e qual problema ela resolve]

## 🗄️ Impacto em Banco de Dados e Ambiente
- [ ] Não altera schema de banco nem variáveis de ambiente.
- [ ] Altera `backend/models.py` E inclui migração defensiva idempotente em `backend/migrations.py`.
- [ ] Adiciona/altera variáveis de ambiente E atualiza `.env.example` e `docs/`.

## 🧪 Como Testar Localmente
1. Executar suíte isolada do backend:
   `cd backend && DATABASE_URL="sqlite:///:memory:" pytest tests/ -v`
2. Executar testes compartilhados e build do frontend web:
   `cd web && npm test && npm run build`
3. Validação funcional (rotas/telas):
   - [Descrever rota ou fluxo de interface a verificar]

## 📸 Evidências (Obrigatório para mudanças em `web/` ou `mobile/`)
[Anexar capturas de tela ou GIF demonstrando os estados Loading, Error, Empty e Success]

## 📋 Checklist de Qualidade (Definition of Done)
- [ ] O código segue integralmente os padrões do `AI_RULES.md`.
- [ ] Não há credenciais, segredos, `print()`/`console.log()` de debug ou arquivos temporários expostos.
- [ ] Novos endpoints e regras possuem testes em `backend/tests/` (sucesso, `401/403`, `404`, `422`) usando SQLite em memória.
- [ ] Sem uso de `any` no TypeScript; contratos `schemas.py` e interfaces TS estão sincronizados.
- [ ] A branch alvo é `dev` (integração via `feat/*` ou `fix/*` -> `dev`, nunca `main` direta).
- [ ] Metadados da PR preenchidos no GitHub (**Assignee**, **Labels**, **Reviewers** e **Issue/Project** vinculados).
