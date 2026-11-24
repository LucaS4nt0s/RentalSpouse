# AI Development Guidelines & System Prompt: RentalSpouse Monorepo

> **IMPORTANTE**: Este documento define as regras estritas, imutáveis e auditáveis para qualquer Inteligência Artificial (IA), agente autônomo, assistente de código ou pessoa desenvolvedora que for planejar, gerar, sugerir, modificar, revisar ou refatorar código no repositório **RentalSpouse**. O descumprimento de qualquer diretriz abaixo invalida a entrega.

---

## 1. Stack Tecnológica Oficial e Estrutura do Monorepo

Nenhuma biblioteca, framework ou serviço externo adicional deve ser introduzido sem justificativa arquitetural explícita e aprovação prévia.

### 1.1 Backend (`backend/`)
- **Linguagem**: Python 3.11+ / 3.12+ (CI oficial em **Python 3.12**) com tipagem estrita (`type hints` obrigatórios em assinaturas e retornos).
- **Framework Web**: FastAPI (utilizando obrigatoriamente gerenciador de contexto `lifespan`).
- **ORM & Banco de Dados**: SQLAlchemy 2.x (`declarative_base`, sessões injetadas via `Depends(get_db)`).
- **Migrações & Retrocompatibilidade**: Módulo próprio idempotente em `backend/migrations.py` (`sqlalchemy.inspect` + `ALTER TABLE` / `CREATE INDEX IF NOT EXISTS`). **Não introduza Alembic** sem solicitação explícita.
- **Driver de Banco**: `psycopg2-binary` (produção/PostgreSQL) e `sqlite3` nativo (`sqlite:///:memory:` com `StaticPool` nos testes).
- **Validação & Serialização**: Pydantic v2 (`BaseModel`, `ConfigDict(from_attributes=True)` / `model_config = {"from_attributes": True}`).
- **Segurança & Autenticação**: `backend/security.py` — hash de senhas via **PBKDF2-HMAC-SHA256 (600.000 iterações, padrão OWASP)** e autorização Bearer **JWT (`PyJWT`, HS256)**.
- **E-mail, Storage, Rate Limit e Tempo Real**:
  - E-mails transacionais via `backend/email_service.py` (`EMAIL_BACKEND`: `console`, `smtp` ou `memoria` nos testes).
  - Armazenamento e validação de arquivos via `backend/storage.py`.
  - Proteção contra abuso/força bruta via `backend/rate_limiter.py`.
  - Comunicação em tempo real via `backend/websocket_manager.py`.
- **Servidor ASGI**: Uvicorn (`uvicorn[standard]`).
- **Testes**: `pytest`, `httpx` (`TestClient`), `pytest-asyncio`, `pytest-cov`.

### 1.2 Frontend Web (`web/`)
- **Runtime**: Node.js `>= 24` (conforme `.nvmrc` e CI).
- **Framework**: Next.js 14+ (App Router).
- **Linguagem**: TypeScript 5+ estrito / React 18+.
- **Estilização & Ícones**: Tailwind CSS + `lucide-react`.
- **Componentes**: Exclusivamente Componentes Funcionais com React Hooks.
- **Comunicação HTTP**: `fetch` nativo padronizado consumindo `NEXT_PUBLIC_API_URL`.

### 1.3 Pacotes Compartilhados (`packages/`)
- **`packages/shared-search/`**: Biblioteca TypeScript compartilhada de normalização e ranqueamento de busca entre plataformas, compilada via `npm run build:search` e testada com `node --test` a partir de `web/`.

### 1.4 Mobile (`mobile/`)
- **Runtime**: Node.js `>= 24`.
- **Framework**: React Native com Expo.
- **Linguagem**: JavaScript / TypeScript.
- **Estilização & Ícones**: `StyleSheet` nativo (ou `NativeWind` quando configurado) + `lucide-react-native`.
- **Rede e Emulação**: Resolução dinâmica de host por plataforma (`10.0.2.2` para Android Emulator, `localhost` para iOS Simulator/Web, IP da LAN local para dispositivos físicos).

### 1.5 Banco de Dados & Infraestrutura (`root/`)
- **Database**: PostgreSQL 15 em produção/desenvolvimento containerizado.
- **Containerização**: Docker e Docker Compose (`docker compose`) com `healthcheck` de inicialização e Mailpit opcional para homologação local de SMTP.
- **Volumes**: Persistência gerenciada via volumes nomeados do Docker (`postgres_data` e diretórios de upload controlados).

> 🚫 **PROIBIÇÕES DE STACK**:
> - Não instale ORMs alternativos (`Tortoise`, `Peewee`, `SQLModel`), bibliotecas duplicadas de hash (`passlib`/`bcrypt` fora do `security.py`) ou frameworks CSS extras (`Bootstrap`, `MUI`, `Chakra`) sem ordem direta.
> - Não adicione pacotes ao `backend/requirements.txt`, `web/package.json` ou `mobile/package.json` sem aprovação explícita.

---

## 2. Arquitetura, Segurança e Regras Técnicas Estritas

### 2.1 Backend: Separação Estrita de Responsabilidades
O diretório `backend/` deve respeitar rigorosamente a divisão modular:
- **`database.py`**: Configuração do `engine`, `SessionLocal`, `Base` e generator `get_db()`.
- **`models.py`**: Entidades ORM do SQLAlchemy. Representam exclusivamente o schema relacional.
- **`migrations.py`**: Evolução defensiva e idempotente de colunas/índices para bancos legados sem perda de dados.
- **`schemas.py`**: Contratos Pydantic v2 (DTOs de entrada e saída).
- **`security.py`, `client_access.py`, `professional_access.py`**: Criptografia, emissão/validação JWT e dependências de controle de acesso por papel (`RBAC`: `client`, `professional`, `admin`).
- **`routes/`**: Routers modulares FastAPI (`APIRouter`). Recebem a requisição HTTP, validam permissões, orquestram regras de domínio/serviços e retornam Schemas Pydantic.
- **Serviços de Domínio** (`verificacao.py`, `notificacoes.py`, `search.py`, `storage.py`, `email_service.py`, `rate_limiter.py`, `websocket_manager.py`): Lógica especializada desacoplada das rotas HTTP.
- **`main.py`**: Ponto de entrada, `lifespan` (criação de tabelas, execução de `migrations.py`, seed controlado), CORS e registro de routers.

#### Regras Inegociáveis de Backend, Banco e Segurança:
1. **Desacoplamento ORM vs. API**: Jamais misture validações de payload HTTP em `models.py` nem retorne instâncias ORM cruas sem `response_model` Pydantic definido.
2. **Proibição de Vazamento de Dados Sensíveis (LGPD & OWASP)**: Schemas de resposta **JAMAIS** devem expor `hashed_password`, tokens de verificação/recuperação em texto puro, segredos internos ou caminhos absolutos do sistema de arquivos do servidor.
3. **Autenticação e RBAC**:
   - Sempre utilize `hash_senha()` e `verificar_senha()` de `backend/security.py`.
   - Toda rota não pública deve injetar explicitamente a dependência de autenticação/papel correspondente (`client`, `professional` ou `admin`) e validar propriedade do recurso (*prevenção de IDOR*: um usuário nunca pode ler/alterar recursos de outro ID sem permissão administrativa).
4. **Rate Limiting e Uploads Seguros**:
   - Endpoints sensíveis (autenticação, cadastro, recuperação de senha, denúncias, envio de documentos e buscas pesadas) devem aplicar `rate_limiter.py`.
   - Uploads devem utilizar `storage.py`, validando extensão permitida, MIME type real, limite de bytes e sanitização contra *Path Traversal* (`..` / barras).
5. **Migrações Idempotentes e Dual-Dialect (PostgreSQL vs. SQLite)**:
   - Toda nova coluna ou índice adicionado em `models.py` **DEVE** ser registrado de forma idempotente em `backend/migrations.py`.
   - Queries SQL/ORM devem rodar tanto em **PostgreSQL 15** quanto em **SQLite em memória** (`sqlite:///:memory:`). Recursos exclusivos do PostgreSQL (ex: extensão `pg_trgm`, índices `GIN`) devem ficar protegidos sob `if engine.dialect.name == "postgresql":`.
6. **Datas, Moeda e Semântica HTTP**:
   - **Timezone UTC**: Proibido usar `datetime.utcnow()` (depreciado no Python 3.12+). Utilize sempre `datetime.now(timezone.utc)`.
   - **Valores Monetários**: Proibido usar `float` para valores financeiros/orçamentos. Utilize `Decimal` / `Numeric` ou inteiros em centavos (`int`).
   - **Lifespan**: Proibido usar `@app.on_event("startup")` ou `@app.on_event("shutdown")`; utilize exclusivamente `lifespan`.
   - **Códigos HTTP e Mensagens**: Retorne códigos semânticos (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`) com mensagens de `detail` claras em **Português (PT-BR)**, sem jamais expor stacktraces ou erros internos de SQL ao cliente.

### 2.2 Frontend Web, Mobile e Shared Packages
1. **TypeScript Estrito**: Proibido o uso de `any`, `@ts-ignore` ou `@ts-expect-error` sem justificativa técnica documentada. Alterou `backend/schemas.py`? Atualize imediatamente as interfaces TypeScript correspondentes em `web/` e `mobile/`.
2. **Diretiva `'use client'`**: No Next.js App Router, mantenha Server Components por padrão e declare `'use client';` no topo apenas em componentes com hooks, eventos de browser ou estado local.
3. **Tratamento Obrigatório dos 4 Estados de UI**: Qualquer tela ou componente que consuma dados remotos deve tratar explicitamente:
   - **Loading**: Skeleton, spinner ou estado visual imediato; botões de *submit* devem ficar `disabled` durante requisições para impedir envio duplicado.
   - **Error**: Alerta claro em português com opção de tentar novamente (*retry*).
   - **Empty State**: Mensagem amigável e orientativa quando a API retornar lista vazia (`[]`).
   - **Success / Data**: Renderização limpa, responsiva e acessível (`aria-label` em botões de ícone, `htmlFor` em labels).
4. **Sincronia do `shared-search`**: Qualquer alteração em `packages/shared-search/src/` exige recompilação e execução dos testes (`npm test` em `web/`) antes do commit.

---

## 3. Governança de Branches, Commits e Versionamento

### 3.1 Fluxo e Nomenclatura de Branches
- **Branch de Produção**: `main` (estável e protegida).
- **Branch de Integração**: `dev` (base padrão para abertura de Pull Requests).
- **Padrão de Branches de Trabalho** (sempre em `kebab-case` vinculando o ID da Issue quando existir):
  - `feat/<id-issue>-descricao-curta` (ex: `feat/42-busca-profissionais-cidade`)
  - `fix/<id-issue>-descricao-curta` (ex: `fix/58-validacao-upload-pdf`)
  - `refactor/<id-issue>-descricao-curta`
  - `test/<id-issue>-descricao-curta`
  - `docs/<id-issue>-descricao-curta`
  - `chore/<id-issue>-descricao-curta`
  - `hotfix/<id-issue>-descricao-critica` (único caso emergencial derivado de `main`, exigindo PR e backmerge imediato em `dev`).
- 🚫 **PROIBIDO**: Commits diretos em `main` ou `dev`, `git push --force` em branches compartilhadas ou uso de `--no-verify` para burlar hooks/checks.

### 3.2 Padrão Obrigatório de Commits (Conventional Commits Estrito)
Cada commit deve ser **atômico** (representar uma única mudança lógica coesa) e seguir exatamente o template abaixo:

```text
<tipo>(<escopo>): <descrição no imperativo, minúscula, sem ponto final (máx. 72 chars)>

[Corpo opcional: explique o PORQUÊ da decisão técnica e o impacto, quebrando linhas em ~100 chars]

[Rodapé opcional/recomendado: Refs #ID | Closes #ID | BREAKING CHANGE: descrição]
```

#### Tipos Permitidos:
| Tipo | Quando utilizar | Exemplo válido |
| :--- | :--- | :--- |
| `feat` | Nova funcionalidade de produto/API | `feat(backend): add endpoint for client service history` |
| `fix` | Correção de bug em produção ou dev | `fix(mobile): resolve android emulator base url fallback` |
| `refactor` | Melhoria interna sem alterar contrato externo | `refactor(shared-search): simplify token normalization` |
| `perf` | Otimização mensurável de consulta ou render | `perf(db): add gin trigram index for normalized_city` |
| `test` | Adição ou correção exclusiva de testes | `test(backend): cover rate limit edge cases on login` |
| `docs` | Documentação técnica, PRDs ou `AI_RULES.md` | `docs(docs): update moderation workflow diagrams` |
| `chore` | Configs, scripts, `.env.example`, limpeza | `chore(infra): add mailpit healthcheck to docker compose` |
| `ci` | Pipelines do GitHub Actions | `ci(ci): cache npm dependencies on frontend workflow` |
| `build` | Build system, TypeScript config ou Dockerfile | `build(web): ensure shared-search compiles before next build` |
| `revert` | Reversão formal de commit anterior | `revert(backend): revert "feat(backend): ..."` |

#### Escopos Permitidos (Lista Fechada):
`backend` · `web` · `mobile` · `shared-search` · `db` · `auth` · `infra` · `ci` · `docs`

> 🚫 **PROIBIDO**: Mensagens vagas como `fix: ajustes`, `chore: update`, `wip`, `testando` ou misturar refatoração estrutural com feature nova no mesmo commit.

---

## 4. Templates Oficiais de Issues (Planejamento e Rastreabilidade)

Toda tarefa criada, refinada ou executada por agentes deve seguir um dos 3 templates abaixo (espelhados em `.github/ISSUE_TEMPLATE/`).

### 4.1 Template de Issue — Nova Funcionalidade (`Feature / User Story`)
```markdown
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
- [ ] Erros de validação e permissão retornam códigos HTTP semânticos (`400/401/403/404/409/422`) e mensagens em PT-BR.
- [ ] Testes automatizados cobrindo caminho feliz, validações inválidas e permissões (RBAC).

## 🚫 Fora de Escopo
- [Listar explicitamente o que NÃO faz parte desta entrega para evitar escopo extra]
```

### 4.2 Template de Issue — Correção de Bug (`Bug Report`)
```markdown
## 🐛 Descrição do Problema
[Resumo objetivo da falha encontrada e seu impacto no usuário ou sistema]

## 🔁 Passos para Reproduzir
1. Configurar ambiente / autenticar como `[client | professional | admin]`
2. Chamar rota ou acessar tela `...` enviando `...`
3. Observar falha `...`

## 🤔 Comportamento Esperado vs. Comportamento Atual
- **Esperado**: [Comportamento correto segundo a regra de negócio]
- **Atual**: [Erro retornado, status HTTP incorreto, falha visual ou log]

## 🔍 Hipótese Técnica e Arquivos Envolvidos
- Arquivos prováveis: `backend/...`, `web/...`
- Teste de regressão necessário: [Descrever o teste que provará que o bug não voltará]
```

### 4.3 Template de Issue — Tarefa Técnica (`Tech Task / Refactor / Infra`)
```markdown
## 🛠️ Objetivo Técnico
[Descrição clara da melhoria arquitetural, migração, performance, segurança ou CI/CD]

## 📐 Requisitos de Implementação
- [ ] Manter 100% de retrocompatibilidade nos contratos públicos da API (ou documentar `BREAKING CHANGE`).
- [ ] Garantir execução limpa da CI (`pytest` em memória + `npm test && npm run build`).

## ✅ Critérios de Conclusão
- [ ] [Critério mensurável 1]
- [ ] [Critério mensurável 2]
```

---

## 5. Padrão Oficial de Pull Request e Code Review

### 5.1 Metadados Obrigatórios do Pull Request (SEMPRE preencher)
Nenhum Pull Request pode ser aberto "pelado" (sem metadados). Ao criar ou editar um PR (via interface do GitHub ou `gh pr create`), o agente ou desenvolvedor **SEMPRE DEVE** preencher obrigatoriamente:
- **Assignee (`--assignee`)**: Atribuir ao autor/responsável pela entrega (ex.: `@me`).
- **Labels (`--label`)**: Aplicar obrigatoriamente ao menos 1 label de tipo (`enhancement`, `bug`, `documentation`, `accessibility`) e, quando aplicável, a label de prioridade (`essencial`, `importante`, `desejável`) ou status (`frontend-done`, `blocked`).
- **Reviewers (`--reviewer`)**: Solicitar revisão de pelo menos **1 a 2 colaboradores** do time antes do merge.
- **Linked Issue (`Closes #<id>`) / Milestone / Projects**: Vincular sempre a Issue correspondente no corpo do PR e associar ao Project/Milestone ativo quando disponível.

> ⚠️ **A mesma regra de metadados vale para Issues**: toda Issue criada deve conter **Labels** (tipo + prioridade) e **Assignee** quando já houver responsável definido.

### 5.2 Template Oficial de Pull Request
Toda entrega gerada ou auxiliada por IA deve preencher integralmente o template abaixo (espelhado em `.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## 🔗 Issue Relacionada
Closes #<numero-da-issue>

## 🏷️ Tipo de Mudança
- [ ] `feat`: Nova funcionalidade
- [ ] `fix`: Correção de bug
- [ ] `refactor` / `perf`: Melhoria técnica sem quebrar contratos
- [ ] `docs` / `chore` / `ci` / `test`: Documentação, infraestrutura ou testes
- [ ] `BREAKING CHANGE`: Mudança incompatível com versões anteriores (exige destaque abaixo)

## 📌 O que foi feito
- [Resumo objetivo por camada modificada: backend, web, mobile, shared-search]
- [Lista clara dos principais arquivos criados ou alterados]

## 🎯 Motivação e Decisões Técnicas
[Por que esta abordagem foi escolhida e qual problema de negócio/arquitetura ela resolve]

## 🗄️ Impacto em Banco de Dados e Ambiente
- [ ] Não altera schema de banco nem variáveis de ambiente.
- [ ] Altera `backend/models.py` E inclui migração defensiva idempotente em `backend/migrations.py`.
- [ ] Adiciona/altera variáveis de ambiente E atualiza `.env.example` e `docs/`.

## 🧪 Como Testar Localmente
1. Rodar suíte do backend isolada:
   `cd backend && DATABASE_URL="sqlite:///:memory:" pytest tests/ -v`
2. Rodar testes compartilhados e build do frontend web:
   `cd web && npm test && npm run build`
3. Validação funcional (rotas/telas):
   - [Passo a passo rápido de verificação manual ou via Swagger `/docs`]

## 📸 Evidências (Obrigatório para mudanças em `web/` ou `mobile/`)
[Anexar capturas de tela ou GIF demonstrando os estados Loading, Error, Empty e Success]

## 📋 Checklist de Qualidade (Definition of Done)
- [ ] Segue integralmente todas as diretrizes do `AI_RULES.md`.
- [ ] Nenhum segredo, credencial real, `print()`/`console.log()` de debug ou arquivo temporário foi exposto.
- [ ] Novos endpoints e regras de negócio possuem testes em `backend/tests/` (sucesso, `401/403`, `404`, `422`).
- [ ] Sem uso de `any` no TypeScript; contratos `schemas.py` e tipos TS estão sincronizados.
- [ ] A branch alvo é `dev` (nunca `main` diretamente, exceto `release/*` ou `hotfix/*` autorizado).
- [ ] Metadados do PR preenchidos no GitHub (**Assignee**, **Labels**, **Reviewers** e **Issue/Project** vinculados).
```

---

## 6. Diretrizes Obrigatórias de Testes Automatizados e CI

O repositório possui Integração Contínua ativa em `.github/workflows/ci.yml`. Todo código entregue **DEVE** passar nos mesmos gates localmente antes de abrir PR:

1. **Cobertura Obrigatória por Endpoint e Regra de Domínio**:
   - Todo novo endpoint ou alteração de regra no `backend/` **DEVE** incluir testes em `backend/tests/`.
   - Cenários mínimos obrigatórios por rota:
     - **Sucesso (`200`/`201`/`204`)** e validação estrita do schema JSON retornado.
     - **Entradas inválidas (`400`/`422`)** e conflitos de unicidade (`409`).
     - **Segurança (`401` sem token / token inválido e `403` para papel sem permissão ou acesso a recurso de terceiro)**.
     - **Estado vazio vs. populado** e paginação/filtros quando aplicável.
2. **Isolamento Total da Suíte Backend**:
   - Proibido depender de container PostgreSQL ativo, rede externa ou servidor SMTP real nos testes automatizados.
   - Utilize `DATABASE_URL="sqlite:///:memory:"` com `dependency_overrides[get_db]` e `EMAIL_BACKEND="memoria"` (ou mocks controlados).
   - Cada teste deve ser determinístico, independente da ordem de execução e limpar seu estado via fixtures `pytest`.
3. **Integridade de Frontend e Pacotes Compartilhados**:
   - Alterações em `packages/shared-search/` exigem novos casos de teste em `packages/shared-search/searchMatching.test.js`.
   - O build de produção `npm run build` em `web/` (que valida compilação do `shared-search`, tipagem TypeScript e lint do Next.js) deve concluir com **zero erros**.
4. **Proibição de Regressão**:
   - É terminantemente proibido deletar, pular (`@pytest.mark.skip`) ou afrouxar asserções de testes existentes apenas para forçar a suíte a ficar verde.

---

## 7. Protocolo Operacional Obrigatório do Agente de IA (Anti-Alucinação)

Para evitar erros, suposições incorretas ou retrabalho, todo agente de IA deve executar rigorosamente este protocolo em 4 fases:

### Fase 1 — Descoberta e Leitura de Contexto (Antes de Codar)
1. **Nunca adivinhe contratos**: Antes de criar ou editar código, leia os arquivos reais correlatos (`models.py`, `schemas.py`, `migrations.py`, `security.py`, rotas afetadas e componentes existentes).
2. **Consulte a documentação de domínio**: Verifique `docs/` (`ARCHITECTURE.md`, `DENUNCIAS.md`, `MODERACAO_ADMINISTRATIVA.md`, `ORCAMENTOS_CAPACIDADE.md`, `ENVIO_DOCUMENTOS_PROFISSIONAL.md` e PRDs) para respeitar regras de negócio já estabelecidas.
3. **Peça clareza quando houver ambiguidade crítica**: Se um requisito de negócio tiver múltiplas interpretações que afetem banco de dados, segurança ou contrato de API, pergunte objetivamente antes de implementar.

### Fase 2 — Implementação Cirúrgica e Segura
1. **Mudança Mínima Necessária**: Altere apenas o escopo solicitado. Preserve comentários relevantes, docstrings, convenções de nomenclatura e estrutura existentes no módulo.
2. **Zero Segredos Hardcoded**: Nunca insira chaves, senhas reais, tokens ou IPs fixos de máquina pessoal no código. Leia via variáveis de ambiente (`os.getenv` / `process.env`) com fallbacks seguros apenas para `development` e documente qualquer nova variável em `.env.example`.
3. **Higiene de Repositório**: Nunca versione `.env`, `__pycache__/`, `.pytest_cache/`, `.coverage`, `node_modules/`, `.next/` ou arquivos gerados de upload de teste.

### Fase 3 — Gate de Verificação Obrigatório (Definition of Done)
Antes de declarar qualquer tarefa concluída, o agente **DEVE** executar e comprovar:
- Se alterou `backend/`: rodar `pytest` apontando para `sqlite:///:memory:` e confirmar **100% de aprovação**.
- Se alterou `web/` ou `packages/shared-search/`: rodar `npm test` e `npm run build` dentro de `web/` e confirmar **zero falhas**.
- Se alterou regras de governança em `AI_RULES.md`: espelhar integralmente o conteúdo em `.cursorrules` e manter `.github/PULL_REQUEST_TEMPLATE.md` e `.github/ISSUE_TEMPLATE/` alinhados.

### Fase 4 — Entrega Clara e Rastreável
Ao responder ao usuário após uma implementação:
1. Liste de forma concisa **o que mudou** com links diretos para os arquivos modificados.
2. Informe os **resultados reais dos testes/builds executados**.
3. Quando solicitado ou ao finalizar uma entrega completa de Issue, forneça a **mensagem de commit sugerida** (no padrão da Seção 3.2) e o **resumo pronto para PR** (no padrão da Seção 5).
