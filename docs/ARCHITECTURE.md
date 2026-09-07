# 🏛️ Documentação de Arquitetura — RentalSpouse

## 1. Visão Geral da Arquitetura

O sistema **RentalSpouse** adota a arquitetura de **Monorepo Modularizado**, separando as responsabilidades em três camadas principais:

```
[ Frontend Web (Next.js) ]    [ Frontend Mobile (Expo) ]
            \                             /
             \                           /
              v                         v
           [ Backend API (FastAPI / Python) ]
                        |
                        v
           [ Banco Relacional (PostgreSQL) ]
```

---

## 2. Componentes e Tecnologias

### 2.1 Backend (`backend/`)
- **FastAPI**: Framework web assíncrono para Python.
- **SQLAlchemy 2.x**: ORM declarativo para mapeamento de entidades relacionais.
- **Pydantic v2**: Validação estrita de dados e serialização de Schemas (DTOs).
- **Uvicorn**: Servidor ASGI de alta performance.
- **Pytest + StaticPool**: Suíte de testes com banco SQLite em memória.

### 2.2 Frontend Web (`web/`)
- **Next.js 14+ (App Router)**: Framework React com Server-Side Rendering e Client Components.
- **Tailwind CSS**: Estilização baseada em utilitários CSS.
- **Fetch API**: Comunicação HTTP assíncrona com tratamento de estados (Carregando, Erro, Sucesso).

### 2.3 Frontend Mobile (`mobile/`)
- **React Native + Expo**: Desenvolvimento mobile multiplataforma.
- **Dynamic IP Resolver**: Resolução de IP dinâmico por plataforma (`10.0.2.2` no Android Emulator, `localhost` no iOS/Web).

### 2.4 Infraestrutura e Banco de Dados
- **PostgreSQL 15**: Banco de dados relacional de produção.
- **Docker Compose**: Orquestração de containers com `healthcheck` garantindo inicialização segura do banco.

---

## 3. Modelo de Dados (Bootstrap Inicial)

### Tabela: `status`
| Coluna | Tipo | Restrições | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Primary Key, Auto Increment | Identificador único do registro |
| `message` | String | Not Null | Mensagem armazenada no banco de dados |
