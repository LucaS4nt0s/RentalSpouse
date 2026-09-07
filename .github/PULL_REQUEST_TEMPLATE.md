## 📌 O que foi feito
- [Item 1 detalhando o que foi desenvolvido ou alterado]
- [Item 2 detalhando arquivos criados ou modificados]

## 🎯 Motivação e Contexto
[Breve explicação do porquê a mudança foi necessária e qual problema ela resolve]

## 🧪 Como testar
1. Subir os serviços necessários (`docker compose up -d` ou comando equivalente).
2. Executar a suíte de testes: `pytest backend/tests/ -v`.
3. Navegar até a interface ou rota correspondente e verificar o comportamento esperado.

## 📋 Checklist de Qualidade
- [ ] O código segue os padrões do `AI_RULES.md`.
- [ ] Não há credenciais, segredos ou arquivos temporários expostos.
- [ ] Todos os novos endpoints possuem testes automatizados com SQLite em memória ou mock.
- [ ] A branch alvo não é a `main` direta (integração via branch de feature -> `dev`).
