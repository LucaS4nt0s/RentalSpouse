# AI Development Guidelines & System Prompt: RentalSpouse Monorepo

> **IMPORTANTE**: Este documento define as regras estritas e imutáveis para qualquer Inteligência Artificial (IA), assistente de código ou desenvolvedor que for gerar, sugerir, modificar ou refatorar código no repositório **RentalSpouse**. O descumprimento destas diretrizes invalida a entrega.

---

## 1. Stack Tecnológica Oficial

Nenhuma biblioteca ou ferramenta externa adicional deve ser introduzida sem justificativa arquitetural e aprovação explícita.

### 1.1 Backend (`backend/`)
- **Linguagem**: Python 3.11+ / 3.12+ com tipagem estrita (`type hints`).
- **Framework Web**: FastAPI (utilizando moderno padrão `lifespan`).
- **ORM & Banco de Dados**: SQLAlchemy 2.x (declarative base, sessões com context manager/dependency injection).
- **Driver de Banco**: `psycopg2-binary`.
- **Validação & Serialização**: Pydantic v2 (`BaseModel`, `model_config = {"from_attributes": True}`).
- **Servidor ASGI**: Uvicorn.
- **Testes**: `pytest`, `httpx` (para `TestClient`), `pytest-asyncio`.

### 1.2 Frontend Web (`web/`)
- **Framework**: Next.js (App Router preferencial).
- **Linguagem**: TypeScript / React 18+.
- **Estilização**: Tailwind CSS.
- **Componentes**: Componentes Funcionais com React Hooks (`useState`, `useEffect`, etc.).
- **Comunicação HTTP**: `fetch` nativo ou `axios` padronizado.

### 1.3 Mobile (`mobile/`)
- **Framework**: React Native com Expo.
- **Linguagem**: JavaScript / TypeScript.
- **Estilização**: `StyleSheet` nativo ou Tailwind (`NativeWind` se configurado).
- **Rede e Emulação**: URLs de API dinâmicas por plataforma (`10.0.2.2` para Emulador Android, `localhost` para iOS Simulator, IP local LAN para dispositivos físicos).

### 1.4 Banco de Dados & Infraestrutura (`root/`)
- **Database**: PostgreSQL 15.
- **Containerização**: Docker e Docker Compose (`docker compose`).
- **Volumes**: Persistência de dados gerenciada via volumes nomeados do Docker.

> 🚫 **PROIBIÇÃO**: Não instale ORMs alternativos (como Tortoise ou Peewee), frameworks CSS adicionais (como Bootstrap ou Material-UI no web) ou bibliotecas não catalogadas no `requirements.txt` / `package.json` sem solicitação direta.

---

## 2. Padrão de Código e Arquitetura

### 2.1 Backend: Separação Estrita de Responsabilidades
O diretório `backend/` deve seguir rigorosamente a arquitetura em camadas:
- **`database.py`**: Configuração do `engine`, `SessionLocal`, declaração da `Base` e generator `get_db()`.
- **`models.py`**: Entidades ORM do SQLAlchemy. Representam exclusivamente o schema do banco relacional.
- **`schemas.py`**: Modelos Pydantic (DTOs). Responsáveis pela validação de entrada, payloads e serialização das respostas.
- **`routes/`** (ou controladores modulares): Routers FastAPI (`APIRouter`). Devem receber requisições, delegar para a lógica de negócio e responder com schemas Pydantic.
- **`main.py`**: Ponto de entrada, configuração do ciclo de vida (`lifespan`), CORS middleware e registro dos routers.

#### Regras do Backend:
1. Nunca acople regras de validação de API diretamente nos modelos ORM (`models.py`).
2. Sempre utilize a injeção de dependência `Depends(get_db)` para sessões de banco.
3. Não use `@app.on_event("startup")`; use a API moderna de gerenciador de contexto `lifespan`.

### 2.2 Frontend e Mobile: Componentes Funcionais e Clean UI
1. **Componentes Funcionais**: Obrigatório o uso exclusivo de componentes funcionais com hooks. Proibido o uso de Class Components.
2. **Diretiva `'use client'`**: No Next.js App Router, declare explicitamente `'use client';` em componentes interativos com estado ou ciclo de vida.
3. **Tratamento de Estados**: Qualquer componente que consuma APIs deve obrigatoriamente tratar os 3 estados básicos:
   - **Loading**: Feedback visual imediato (skeleton, spinner ou indicador de carregamento).
   - **Error**: Mensagem clara ao usuário com opção de retry.
   - **Success/Data**: Renderização limpa e estruturada dos dados.
4. **Clean Code & Tailwind**: Utilize classes utilitárias sem estilos inline caóticos. Mantenha os componentes enxutos e modularizados.

---

## 3. Regras de Versionamento e Commits

Todos os commits devem seguir rigorosamente o padrão **Conventional Commits**:

### 3.1 Formato Obrigatório
```text
<tipo>(<escopo opcional>): <descrição no imperativo e concisa>
```

### 3.2 Tipos Permitidos
- `feat`: Adição de nova funcionalidade (ex: `feat(backend): add status endpoint`).
- `fix`: Correção de bug (ex: `fix(mobile): resolve android emulator network url`).
- `refactor`: Refatoração que não altera comportamento público.
- `test`: Criação ou ajuste de testes automatizados.
- `docs`: Modificações em documentações ou comentários.
- `chore`: Atualização de tarefas de build, dependências ou configs.
- `ci`: Alterações nos fluxos de Integração Contínua.

### 3.3 Regras de Branches
- **Branch Principal**: `main` (produção).
- **Branch de Integração**: `dev` (desenvolvimento).
- **Features/Bugfixes**: `feature/<nome-da-funcionalidade>` ou `fix/<nome-do-bug>`.
- 🚫 **PROIBIDO**: Commits diretos na branch `main`. Todo código deve ser integrado via Pull Request após revisão e testes.

---

## 4. Padrão de Pull Requests e Code Review

Toda contribuição gerada ou auxiliada por IA deve estar pronta para ser submetida no seguinte formato de Pull Request:

### 4.1 Template de Pull Request
```markdown
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
```

---

## 5. Diretrizes para Issues e Testes Automatizados

1. **Testes são Obrigatórios**:
   - Todo novo endpoint criado no backend **DEVE** vir acompanhado de testes no diretório `backend/tests/`.
   - Testes devem validar: status HTTP de sucesso, conformidade do schema de resposta, validação de inputs inválidos (422/400) e comportamento com banco vazio/populado.
2. **Isolamento de Testes**:
   - Testes de unidade e integração do backend **NÃO DEVEM** depender do PostgreSQL de produção ou container Docker ativo.
   - Utilize SQLite em memória (`sqlite:///:memory:`) associado ao mecanismo `dependency_overrides` do FastAPI.
   - Cada teste deve rodar com banco limpo (setup e teardown via fixtures `pytest`).
3. **Integridade da Suíte**:
   - Nenhuma alteração deve quebrar os testes pré-existentes. A suíte deve passar 100% verde (`pytest backend/tests/ -v`).

---

## 6. Comportamento Esperado da IA

1. **Nunca Presuma Segredos**: Não hardcode senhas de produção ou chaves de API. Use sempre variáveis de ambiente com fallbacks controlados para ambiente de desenvolvimento local.
2. **Preservação de Contexto**: Ao editar um arquivo existente, preserve comentários relevantes, docstrings e estruturas já convencionadas.
3. **Explicações Concisas**: Ao sugerir comandos e modificações, forneça código funcional e instruções diretas de execução.
