# 🛠️ RentalSpouse — Monorepo

> **RentalSpouse** é uma plataforma completa de serviços de manutenção residencial ("Marido de Aluguel"), conectando clientes e prestadores de serviços de forma ágil, segura e moderna.

---

## 🏗️ Arquitetura do Projeto

O repositório está estruturado como um **Monorepo** desacoplado em camadas:

```text
RentalSpouse/
├── backend/            # API REST em Python (FastAPI + SQLAlchemy 2.x + PostgreSQL)
│   ├── tests/          # Suíte de testes automatizados (Pytest + SQLite em memória)
│   ├── database.py     # Conexão com banco relacional e gerenciamento de sessões
│   ├── models.py       # Entidades ORM do banco de dados (Tabela status, etc.)
│   ├── schemas.py      # Schemas de validação e DTOs (Pydantic v2)
│   ├── main.py         # Ponto de entrada da API, Lifespan e CORS
│   └── Dockerfile      # Imagem Docker do Backend (Python 3.12-slim)
├── web/                # Frontend Web em Next.js 14+ (App Router + Tailwind CSS)
│   └── app/page.tsx    # Tela inicial consumindo a API
├── mobile/             # Aplicativo Mobile em React Native (Expo)
│   └── App.js          # App Mobile com resolução dinâmica de IP
├── docs/               # Documentação técnica e especificações da arquitetura
│   └── ARCHITECTURE.md # Visão detalhada da arquitetura e fluxo de dados
├── .github/            # CI/CD (GitHub Actions) e Template de Pull Requests
│   ├── workflows/ci.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── AI_RULES.md         # Regras estritas de governança e desenvolvimento assistido por IA
├── .cursorrules        # Regras de contexto para o editor Cursor / IDEs
├── docker-compose.yml  # Orquestração do PostgreSQL 15 + Backend FastAPI
└── .env.example        # Modelo de variáveis de ambiente
```

---

## 🔄 Fluxo "Olá Mundo!" (Integração Completa)

A aplicação demonstra a arquitetura funcionando de ponta a ponta:

1. **Banco de Dados (PostgreSQL)**: Contém a tabela `status` (ID, Mensagem).
2. **Backend (FastAPI)**: O endpoint `GET /api/hello` acessa o banco. Se a tabela estiver vazia, ele insere a mensagem `"Olá Mundo do Banco de Dados!"` e a retorna.
3. **Frontend Web & Mobile**: Consomem a API REST e exibem os dados vindos do banco de dados na interface do usuário com tratamento de carregamento, erro e sucesso.

---

## 🚀 Guia de Setup e Execução

### 📋 Pré-requisitos
- **Docker & Docker Desktop** (Recomendado)
- **Node.js** (v18+)
- **Python** (3.11 ou 3.12)

---

### 🐳 Método 1: Execução com Docker (Recomendado)

Suba todo o ambiente (Banco PostgreSQL + Backend API) com apenas **2 comandos**:

1. **Criar o arquivo de ambiente**:
   ```bash
   # Windows (PowerShell/CMD)
   copy .env.example .env

   # Linux / macOS / Git Bash
   cp .env.example .env
   ```

2. **Subir os containers**:
   ```bash
   docker compose up --build
   ```

3. **Pronto! Acessos disponíveis**:
   - 🌐 **Backend API**: [http://localhost:8000/api/hello](http://localhost:8000/api/hello)
   - 📄 **Documentação Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - 🐘 **Banco PostgreSQL**: `localhost:5432`

---

### 💻 Método 2: Execução Manual / Desenvolvedor

#### 1. Backend (FastAPI + Pytest)
```bash
# Entrar na pasta do backend
cd backend

# Criar e ativar o ambiente virtual (opcional)
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Executar a suíte de testes unitários (100% isolada com SQLite em memória)
pytest tests/ -v

# Executar o servidor de desenvolvimento
uvicorn main:app --reload
```

#### 2. Frontend Web (Next.js)
```bash
# Em um novo terminal, entrar na pasta web
cd web

# Instalar dependências e iniciar
npm install
npm run dev
```
Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

#### 3. Frontend Mobile (Expo)
```bash
# Em um novo terminal, entrar na pasta mobile
cd mobile

# Instalar dependências e iniciar o Expo
npm install
npx expo start
```
Pressione `a` para abrir no **Emulador Android** ou `i` no **Simulator iOS**.

---

## 🧪 Suíte de Testes Automatizados

Os testes do backend são executados isoladamente usando banco de dados em memória (`sqlite:///:memory:`) sem depender de um banco PostgreSQL ativo.

Para rodar os testes:
```bash
cd backend
pytest tests/ -v
```

---

## 📜 Governança e Contribuição

Todas as contribuições devem seguir as regras estabelecidas em [`AI_RULES.md`](./AI_RULES.md):
- **Conventional Commits**: `feat(...)`, `fix(...)`, `test(...)`, `docs(...)`, etc.
- **Branches**: Integração via Pull Requests direcionados para a branch `dev`.
- **Testes Obrigatórios**: Todo novo endpoint deve vir acompanhado de testes unitários.
