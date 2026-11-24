# Envio de documentos do profissional para análise

> Issue [#55](https://github.com/LucaS4nt0s/RentalSpouse/issues/55) · **Tarefa 1 (backend)** · branch `feature/55-envio-documentos-backend`.
> A aprovação/rejeição pelo administrador continua na issue #17.

Este documento descreve as rotas `GET/POST/DELETE /api/professionals/me/documents`,
o envio para análise (`POST .../submit`) e as regras de estado/erros. O profissional
gerencia **apenas os próprios** documentos: o dono dos recursos é sempre derivado do
token de acesso (`get_current_professional` em `backend/professional_access.py`),
nunca de um ID informado pelo cliente — por construção, não há IDOR.

## Endpoints

| Método | Rota | Sucesso | Descrição |
|---|---|---|---|
| `GET` | `/api/professionals/me/documents` | `200` resumo | Lista os documentos do profissional autenticado + estado do envio. |
| `POST` | `/api/professionals/me/documents` | `201` documento | Anexa um documento (multipart: `document_type` + `file`). Reenviar o mesmo tipo **substitui** o anterior. |
| `DELETE` | `/api/professionals/me/documents/{document_id}` | `204` | Remove o documento do banco e do disco. |
| `POST` | `/api/professionals/me/documents/submit` | `200` resumo | Valida os obrigatórios, marca o envio para análise e notifica os admins ativos por e-mail. |

Tipos aceitos (`document_type`): `photo_id` (obrigatório), `proof_of_residence`
(obrigatório), `technical_certificate` (opcional), `profile_photo` (opcional).
Formatos: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`; máximo **10 MB** por arquivo
(validação de extensão, MIME, tamanho e *magic bytes* em `backend/storage.py`).

### Resumo retornado por `GET` e `submit`

```json
{
  "professional_id": 12,
  "approval_status": "pending_approval",
  "approval_notes": null,
  "has_photo_id": true,
  "has_proof_of_residence": true,
  "has_technical_certificate": false,
  "has_profile_photo": false,
  "is_complete": true,
  "documents": [
    {
      "id": 30,
      "professional_id": 12,
      "document_type": "photo_id",
      "file_name": "rg.pdf",
      "file_size": 20480,
      "mime_type": "application/pdf",
      "uploaded_at": "2026-10-05T22:55:28",
      "download_url": "/api/professionals/12/documents/30/download"
    }
  ],
  "submitted_at": null,
  "can_submit": true,
  "missing_required": []
}
```

### Exemplos

```bash
TOKEN="<access_token do profissional>"

# Listar o resumo
curl -s localhost:8000/api/professionals/me/documents -H "Authorization: Bearer $TOKEN"

# Anexar o documento com foto
curl -s -X POST localhost:8000/api/professionals/me/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "document_type=photo_id" -F "file=@rg.pdf"

# Anexar o comprovante de residência
curl -s -X POST localhost:8000/api/professionals/me/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "document_type=proof_of_residence" -F "file=@conta_luz.png"

# Enviar para análise
curl -s -X POST localhost:8000/api/professionals/me/documents/submit \
  -H "Authorization: Bearer $TOKEN"

# Remover um documento (permitido apenas em rascunho ou após rejeição)
curl -s -X DELETE localhost:8000/api/professionals/me/documents/30 \
  -H "Authorization: Bearer $TOKEN"
```

## Regras de estado

O estado exibido na tela é **derivado** (`Professional.documents_submitted_at` +
`approval_status`), sem novo enum:

| Condição | Estado exibido | Edição (POST/DELETE/`submit`) |
|---|---|---|
| `submitted_at == null` | **Rascunho** | Livre |
| `submitted_at != null` e `approval_status == "rejected"` | **Rejeitado** | Livre (pode corrigir e reenviar) |
| `submitted_at != null` e `approval_status == "pending_approval"` | **Em análise** | Bloqueada (`409`) |
| `submitted_at != null` e `approval_status == "approved"` | **Aprovado** | Bloqueada (`409`) |

- `can_submit` é `true` somente quando os 2 obrigatórios estão anexados **e** a edição não está bloqueada.
- `missing_required` lista, na ordem canônica, os obrigatórios ausentes
  (`["photo_id", "proof_of_residence"]`, `["proof_of_residence"]` etc.).
- O envio grava `documents_submitted_at = now(UTC)` e `approval_status = "pending_approval"`.

## Erros

| Código | Quando |
|---|---|
| `401` | Sem token / token inválido ou expirado. |
| `403` | Usuário autenticado não é profissional; ou profissional inativo. |
| `404` | Documento inexistente **ou de outro profissional** (não vaza existência); profissional sem perfil. |
| `409` | Tentativa de upload/remoção/reenvio com o envio bloqueado (em análise ou aprovado). |
| `422` | Tipo de documento inválido; envio para análise sem os obrigatórios — corpo: `{"detail": {"message": "...", "missing_required": [...]}}`. |
| `400` | Arquivo inválido (extensão, MIME, tamanho, assinatura binária ou arquivo vazio). |

## Notificação por e-mail

No sucesso do `submit`, `backend/notificacoes.py` envia um e-mail **simples, em
texto puro**, para cada administrador ativo (`role == "admin"` e `is_active`),
com assunto fixo e nome/e-mail do profissional apenas no corpo. A notificação é
*best-effort*: falha de e-mail (inclusive transporte mal configurado) é apenas
registrada em log e **nunca** desfaz ou quebra a submissão.

## Banco de dados

A coluna nova é `professionals.documents_submitted_at` (`TIMESTAMP`, nulo).
`Base.metadata.create_all` **não altera tabelas já existentes**; em um banco de
desenvolvimento já criado, aplique manualmente ou recrie o volume:

```sql
ALTER TABLE professionals ADD COLUMN documents_submitted_at TIMESTAMP;
```

```bash
docker compose down -v   # opção destrutiva: recria o banco do zero
```

## Como testar

Suíte completa (nenhum teste depende de PostgreSQL/Docker — SQLite em memória):

```bash
cd backend
./venv/Scripts/python.exe -m pytest tests/ -q          # suíte completa
./venv/Scripts/python.exe -m pytest tests/test_professional_access.py \
    tests/test_notificacoes.py -q                       # Fase A
./venv/Scripts/python.exe -m pytest tests/test_professional_documents_me.py -q  # Fase B
```

### Pela interface web

Com o backend no ar (`docker compose up -d db backend`) e o frontend (`cd web && npm run dev`),
entre em `http://localhost:3000/entrar` com uma conta de **profissional**. O acesso à tela
aparece em três lugares, **somente para profissionais** (visitantes, clientes e administradores
não veem o link):

- na home, no cabeçalho ("Meus documentos") e no bloco principal (no lugar de "Sou profissional");
- no `/entrar`, nos cartões "Bem-vindo(a) de volta!" e "Você já está conectado" ("Enviar meus documentos").

O destino é `/profissional/documentos`.

## Escopo e convivência

- As rotas legadas `/api/professionals/{professional_id}/documents` (PR #58 / #17)
  **não foram alteradas**.
- O router `/me` é registrado em `backend/main.py` **antes** do router de
  profissionais; caso contrário `me` casaria com `{professional_id}` e viraria `422`
  (há teste cobrindo isso).
- O `download_url` continua apontando para a rota legada de download; o ajuste de
  autorização dela está registrado para a issue #17.
