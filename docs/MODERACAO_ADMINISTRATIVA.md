# 🛡️ Moderação Administrativa de Documentos de Profissionais

Documentação técnica do módulo de **Moderação e Aprovação de Profissionais** (Issues **#17** e **#64**).

Este módulo encerra o ciclo de conformidade cadastral da plataforma RentalSpouse, permitindo que a equipe de administração analise, aprove ou rejeite a documentação submetida pelos prestadores de serviço com auditoria completa e notificações automáticas por e-mail.

---

## 🧭 1. Visão Geral e Ciclo de Vida Cadastral

```text
┌─────────────────┐       submissão        ┌──────────────────┐
│   Profissional  │ ─────────────────────> │ pending_approval │ ── (Fila FIFO do Administrador)
│   (Rascunho)    │  (com docs obrigat.)   └──────────────────┘
└─────────────────┘                                 │
                                     ┌──────────────┴──────────────┐
                                     │                             │
                                  Aprovar                       Rejeitar
                               (com e-mail)             (com motivo + e-mail)
                                     │                             │
                                     ▼                             ▼
                          ┌──────────────────┐          ┌──────────────────┐
                          │     approved     │          │     rejected     │
                          └──────────────────┘          └──────────────────┘
                             (Visível na Vitrine             (Reabre edição
                                e Contratação)                para o prestador)
```

1. **Rascunho**: O profissional cadastra seus dados e faz o upload dos documentos (`photo_id`, `proof_of_residence` e certificados opcionais).
2. **Submissão**: Ao clicar em enviar (`POST /api/professionals/me/documents/submit`), `documents_submitted_at` é registrado, o status vai para `pending_approval` e a edição fica travada.
3. **Fila do Administrador**: O profissional passa a figurar na listagem de pendências administrativas (`GET /api/admins/professionals/pending`), ordenada por tempo de espera (ordem FIFO).
4. **Análise**: O administrador acessa a tela de conferência (`GET /api/admins/professionals/{id}/review`) com visualização de todos os documentos e metadados.
5. **Decisão**:
   - **Aprovação**: Status vai para `approved`, grava `approved_at` e `approved_by_id`, envia e-mail de boas-vindas ao profissional e libera seu perfil na vitrine pública.
   - **Rejeição**: Exige justificativa formal (`reason`), status vai para `rejected`, grava `approval_notes` e envia e-mail com as instruções para que o profissional possa corrigir e reenviar.

---

## 🔒 2. Controle de Acesso e Camada de Segurança

Todos os endpoints sob o prefixo `/api/admins/professionals` exigem autenticação Bearer com token JWT de um usuário com papel de Administrador (`role == 'admin'`) e status ativo (`is_active == True`).

- **401 Unauthorized**: Token ausente, expirado ou com assinatura inválida.
- **403 Forbidden**: Usuário autenticado que não seja administrador (ex: cliente ou profissional) ou administrador com conta inativa.

---

## 📡 3. Contratos de API (Endpoints)

### 3.1. Listar Profissionais Pendentes (Fila de Moderação)

Retorna a fila de prestadores com documentos submetidos aguardando avaliação, ordenados de forma crescente por `documents_submitted_at` (quem está esperando há mais tempo vem primeiro).

- **Método**: `GET`
- **URL**: `/api/admins/professionals/pending`
- **Query Params**:
  - `skip` *(int, padrão: 0)*: Quantidade de itens a pular.
  - `limit` *(int, padrão: 50, máx: 100)*: Limite de registros por página.
- **Headers**: `Authorization: Bearer <token_admin>`
- **Resposta Sucesso (`200 OK`)**:
  ```json
  [
    {
      "id": 12,
      "name": "Carlos Eletricista",
      "email": "carlos@exemplo.com",
      "phone": "11987654321",
      "city": "São Paulo",
      "state": "SP",
      "specialties": ["Elétrica", "Ar-condicionado"],
      "approval_status": "pending_approval",
      "approval_notes": null,
      "documents_submitted_at": "2026-10-13T18:30:00Z",
      "approved_at": null,
      "approved_by_id": null,
      "created_at": "2026-10-10T12:00:00Z",
      "updated_at": "2026-10-13T18:30:00Z",
      "documents_count": 2,
      "has_photo_id": true,
      "has_proof_of_residence": true,
      "has_technical_certificate": false,
      "has_profile_photo": false,
      "is_complete": true
    }
  ]
  ```

---

### 3.2. Listagem Geral com Filtro de Status

Permite que a tabela administrativa visualize e filtre cadastros por status (`pending_approval`, `approved`, `rejected` ou `all`).

- **Método**: `GET`
- **URL**: `/api/admins/professionals`
- **Query Params**:
  - `status` *(string, opcional)*: `pending_approval` | `approved` | `rejected` | `all`
  - `skip` *(int, padrão: 0)*
  - `limit` *(int, padrão: 50, máx: 100)*
- **Headers**: `Authorization: Bearer <token_admin>`
- **Resposta Sucesso (`200 OK`)**: Lista de `ProfessionalModerationItemRead`.

---

### 3.3. Detalhes do Profissional para Auditoria (Review)

Retorna todos os dados cadastrais e a lista de documentos anexados com a URL segura para download/visualização de cada arquivo.

- **Método**: `GET`
- **URL**: `/api/admins/professionals/{id}/review`
- **Headers**: `Authorization: Bearer <token_admin>`
- **Resposta Sucesso (`200 OK`)**:
  ```json
  {
    "id": 12,
    "name": "Carlos Eletricista",
    "email": "carlos@exemplo.com",
    "phone": "11987654321",
    "bio": "Eletricista residencial com 10 anos de experiência em quadros de força.",
    "service_radius_km": 25.0,
    "specialties": ["Elétrica"],
    "city": "São Paulo",
    "state": "SP",
    "is_active": true,
    "approval_status": "pending_approval",
    "approval_notes": null,
    "documents_submitted_at": "2026-10-13T18:30:00Z",
    "approved_at": null,
    "approved_by_id": null,
    "approved_by_name": null,
    "created_at": "2026-10-10T12:00:00Z",
    "updated_at": "2026-10-13T18:30:00Z",
    "is_complete": true,
    "documents": [
      {
        "id": 45,
        "professional_id": 12,
        "document_type": "photo_id",
        "file_name": "cnh_carlos.pdf",
        "file_size": 245000,
        "mime_type": "application/pdf",
        "uploaded_at": "2026-10-13T18:25:00Z",
        "download_url": "/api/professionals/12/documents/45/download"
      },
      {
        "id": 46,
        "professional_id": 12,
        "document_type": "proof_of_residence",
        "file_name": "comprovante_luz.png",
        "file_size": 182000,
        "mime_type": "image/png",
        "uploaded_at": "2026-10-13T18:28:00Z",
        "download_url": "/api/professionals/12/documents/46/download"
      }
    ]
  }
  ```

---

### 3.4. Aprovar Cadastro de Profissional

- **Método**: `POST`
- **URL**: `/api/admins/professionals/{id}/approve`
- **Headers**: `Authorization: Bearer <token_admin>`
- **Validações e Regras**:
  - O profissional deve existir (senão `404 Not Found`);
  - Não pode já estar com status `approved` (senão `409 Conflict`);
  - Deve conter os 2 documentos obrigatórios: `photo_id` e `proof_of_residence` (senão `409 Conflict`);
  - Registra a data/hora atual em `approved_at` e o ID do admin logado em `approved_by_id`;
  - Dispara e-mail não-bloqueante ao profissional confirmando a aprovação.
- **Resposta Sucesso (`200 OK`)**:
  ```json
  {
    "id": 12,
    "name": "Carlos Eletricista",
    "email": "carlos@exemplo.com",
    "approval_status": "approved",
    "approval_notes": null,
    "approved_at": "2026-10-13T19:00:00Z",
    "approved_by_id": 1,
    "updated_at": "2026-10-13T19:00:00Z",
    "message": "Cadastro e documentos do profissional aprovados com sucesso."
  }
  ```

---

### 3.5. Rejeitar Cadastro com Justificativa

- **Método**: `POST`
- **URL**: `/api/admins/professionals/{id}/reject`
- **Headers**:
  - `Authorization: Bearer <token_admin>`
  - `Content-Type: application/json`
- **Payload (`JSON`)**:
  ```json
  {
    "reason": "O comprovante de residência está com data superior a 90 dias. Por favor, envie uma conta recente (água, luz ou telefone)."
  }
  ```
- **Validações e Regras**:
  - O campo `reason` é obrigatório e deve ter no mínimo 5 caracteres não-vazios (senão `422 Unprocessable Entity`);
  - O profissional deve existir (senão `404 Not Found`);
  - Não pode já estar reprovado (senão `409 Conflict`);
  - O profissional precisa ter submetido documentos (`documents_submitted_at` não nulo) (senão `409 Conflict`);
  - Salva o motivo em `approval_notes`, reseta `approved_at` para `null` e atualiza `approved_by_id`;
  - Dispara e-mail não-bloqueante ao profissional com a justificativa para que ele possa reenviar seus documentos.
- **Resposta Sucesso (`200 OK`)**:
  ```json
  {
    "id": 12,
    "name": "Carlos Eletricista",
    "email": "carlos@exemplo.com",
    "approval_status": "rejected",
    "approval_notes": "O comprovante de residência está com data superior a 90 dias. Por favor, envie uma conta recente (água, luz ou telefone).",
    "approved_at": null,
    "approved_by_id": 1,
    "updated_at": "2026-10-13T19:05:00Z",
    "message": "Cadastro do profissional reprovado e justificativa registrada com sucesso."
  }
  ```

---

## 📬 4. Notificações por E-mail

O módulo integra com [`notificacoes.py`](../backend/notificacoes.py) e [`email_service.py`](../backend/email_service.py) seguindo o princípio de **resiliência defensiva (best-effort)**:
- Nenhuma falha de rede ou configuração de SMTP quebra o fluxo de aprovação ou rejeição da requisição HTTP;
- No ambiente de testes, mensagens são capturadas na fixture `caixa_de_entrada` em memória.

---

## 🏛️ 5. Isolamento da Vitrine Pública

A listagem pública de contratação (`GET /api/professionals` e a busca inteligente `/api/professionals?q=...`) possui filtro padrão `approval_status == 'approved'`.

Profissionais pendentes ou reprovados **jamais aparecem para os clientes** na busca ou no diretório público.
