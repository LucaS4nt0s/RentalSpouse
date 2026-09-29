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
- **Segurança e Criptografia**: Hash de senhas seguro utilizando **PBKDF2-HMAC-SHA256 (600.000 iterações)** em conformidade com as recomendações OWASP e tokens de autorização **JWT (HS256)** via Bearer token.
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

## 3. Modelo de Dados

### Tabela: `status`
| Coluna | Tipo | Restrições | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Primary Key, Auto Increment | Identificador único do registro |
| `message` | String | Not Null | Mensagem armazenada no banco de dados |

### Tabela: `users`
| Coluna | Tipo | Restrições | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Primary Key, Auto Increment | Identificador único do usuário |
| `name` | String(255) | Not Null | Nome completo do usuário |
| `email` | String(255) | Unique, Index, Not Null | E-mail do usuário/administrador |
| `hashed_password` | String(255) | Not Null | Hash de senha com PBKDF2-HMAC-SHA256 (600.000 iterações) |
| `role` | String(50) | Not Null, Default: 'client' | Papel no sistema (`admin`, `client`, `professional`) |
| `is_active` | Boolean | Not Null, Default: True | Flag de ativação da conta |
| `created_at` | DateTime | Not Null, Default: UTC Now | Data e hora do cadastro |

### Tabela: `clientes`
| Coluna | Tipo | Restrições | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Primary Key, Auto Increment | Identificador único do cliente |
| `nome` | String(255) | Not Null | Nome completo do cliente |
| `email` | String(255) | Unique, Index, Not Null | E-mail exclusivo |
| `cpf` | String(11) | Unique, Index, Not Null | CPF único (apenas dígitos) |
| `data_nascimento` | Date | Not Null | Data de nascimento (maioridade 18+) |
| `senha_hash` | String(255) | Not Null | Hash criptográfico da senha (PBKDF2/SHA-256) |
| `cep` | String(8) | Not Null | CEP do endereço (apenas dígitos) |
| `logradouro` | String(255) | Not Null | Rua / Avenida do endereço |
| `numero` | String(50) | Not Null | Número da residência |
| `complemento` | String(255) | Nullable | Complemento (apto, bloco, etc.) |
| `bairro` | String(100) | Not Null | Bairro |
| `cidade` | String(100) | Not Null | Cidade |
| `estado` | String(2) | Not Null | Sigla da Unidade Federativa (UF) |
| `criado_em` | DateTime | Default UTC Now, Not Null | Timestamp de cadastro |

### Tabela: `professionals`
| Coluna | Tipo | Restrições | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Primary Key, Auto Increment | Identificador único do profissional |
| `name` | String(100) | Not Null | Nome completo do profissional |
| `email` | String(255) | Unique, Index, Not Null | E-mail exclusivo de contato |
| `phone` | String(20) | Nullable | Telefone / WhatsApp do profissional |
| `bio` | Text | Not Null | Biografia e apresentação do profissional |
| `service_radius_km` | Float | Not Null (>= 1.0) | Raio máximo de atendimento em km |
| `specialties` | JSON | Not Null | Lista de especialidades e habilidades atendidas |
| `city` | String(100) | Nullable | Cidade base de atendimento |
| `state` | String(2) | Nullable | Unidade Federativa (UF) |
| `is_active` | Boolean | Default True, Not Null | Status de ativação na plataforma |
| `created_at` | DateTime | Default UTC Now, Not Null | Timestamp de cadastro |
| `updated_at` | DateTime | Default UTC Now, Auto Update | Timestamp da última alteração |

---

## 4. Endpoints Principais

### Administradores e Autenticação
| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/admins` | Bearer Token (`admin`) | Cadastra um novo administrador no sistema |
| `GET` | `/api/admins` | Bearer Token (`admin`) | Lista todos os administradores cadastrados |
| `POST` | `/api/auth/login` | Pública | Realiza login e gera o token de acesso JWT |
| `GET` | `/api/auth/me` | Bearer Token (qualquer) | Retorna o perfil do usuário autenticado |

### Clientes
| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/clientes` | Pública | Cadastro de novos clientes com validações estritas |

### Profissionais
| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/professionals` | Pública | Cadastro de novo profissional com validações |
| `GET` | `/api/professionals` | Pública | Lista profissionais com paginação e filtros |
| `GET` | `/api/professionals/{id}` | Pública | Detalhes de um profissional por ID |
| `PUT` | `/api/professionals/{id}` | Pública | Atualiza dados cadastrais de um profissional |
| `DELETE` | `/api/professionals/{id}` | Pública | Remove o cadastro de um profissional |
