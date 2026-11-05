# Denúncia de profissional pelo cliente

> Issue [#68](https://github.com/LucaS4nt0s/RentalSpouse/issues/68) · branch `feature/68-denuncias-profissional`.
> A análise, a moderação e o banimento pelo administrador continuam na issue [#23](https://github.com/LucaS4nt0s/RentalSpouse/issues/23).

Este documento descreve as rotas `POST /api/denuncias` e `GET /api/denuncias/me`,
o payload aceito e as regras de erro. O **autor da denúncia é sempre derivado do
token** (`get_current_cliente` em `backend/client_access.py`): o payload não
aceita `cliente_id`, o que elimina spoofing de autoria — e, na leitura, o cliente
recebe apenas os próprios registros.

## Endpoints

| Método | Rota | Sucesso | Descrição |
|---|---|---|---|
| `POST` | `/api/denuncias` | `201` denúncia | Registra uma denúncia do cliente autenticado contra um profissional. |
| `GET` | `/api/denuncias/me` | `200` lista | Lista as denúncias do próprio cliente, da mais recente para a mais antiga. |

Ambas exigem Bearer token de um usuário com papel `client` que possua cadastro
ativo na tabela `clientes`.

### Payload de criação

```json
{
  "professional_id": 12,
  "motivo": "servico_nao_realizado",
  "descricao": "Não compareceu na data combinada e parou de responder às mensagens."
}
```

| Campo | Regra |
|---|---|
| `professional_id` | Inteiro maior que zero. O profissional precisa existir e estar ativo. |
| `motivo` | Um dos motivos catalogados (abaixo). Normalizado para minúsculas e sem espaços nas pontas. |
| `descricao` | Texto livre de **20 a 2000 caracteres** (após `strip`); espaços nas pontas são removidos. |

Motivos aceitos (`models.DenunciaMotivo`): `servico_nao_realizado`,
`cobranca_indevida`, `conduta_inadequada`, `informacoes_falsas`, `outro`.

### Resposta (`201` e itens de `GET /me`)

```json
{
  "id": 7,
  "cliente_id": 3,
  "professional_id": 12,
  "professional_name": "Mário Encanador",
  "motivo": "servico_nao_realizado",
  "descricao": "Não compareceu na data combinada e parou de responder às mensagens.",
  "status": "pendente",
  "created_at": "2026-10-13T18:04:11.812345",
  "updated_at": "2026-10-13T18:04:11.812345"
}
```

`GET /api/denuncias/me` aceita `skip` (padrão `0`) e `limit` (padrão `50`,
máximo `100`) e devolve uma lista ordenada por `created_at DESC, id DESC`. Se o
cadastro do profissional deixar de existir, a denúncia permanece no histórico com
`professional_name` nulo.

### Exemplos

```bash
TOKEN="<access_token do cliente>"

# Registrar a denúncia
curl -s -X POST localhost:8000/api/denuncias \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"professional_id": 12, "motivo": "cobranca_indevida", "descricao": "Cobrou um valor maior do que o combinado no orçamento."}'

# Consultar as próprias denúncias
curl -s "localhost:8000/api/denuncias/me?skip=0&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Erros

| Código | Quando ocorre |
|---|---|
| `401` | Token ausente, inválido ou expirado. |
| `403` | Usuário autenticado não tem papel de cliente (`professional`/`admin`). |
| `404` | `client`: sem cadastro na tabela `clientes`; `POST`: profissional inexistente. |
| `409` | Profissional com cadastro inativo **ou** já existe uma denúncia **em aberto** (`pendente`/`em_analise`) do mesmo cliente para o mesmo profissional. |
| `422` | Motivo fora do catálogo, descrição fora do limite de caracteres, `professional_id` ausente/inválido ou paginação inválida (`skip < 0`, `limit` fora de `1..100`). |

## Regras de negócio

- **Uma denúncia em aberto por par (cliente, profissional).** Depois que a equipe
  resolve/arquiva a denúncia, o cliente pode denunciar novamente; dois clientes
  diferentes podem denunciar o mesmo profissional simultaneamente.
- **Status inicial sempre `pendente`.** As demais transições (`em_analise`,
  `resolvida`, `arquivada`) pertencem ao painel do administrador (issue #23) e
  não são expostas por este módulo.
- **Notificação por e-mail / banimento ficam fora desta entrega** — o painel de
  denúncias e a ação de banir são escopo da issue #23.

## Arquivos

| Caminho | Responsabilidade |
|---|---|
| `backend/models.py` | `Denuncia`, `DenunciaMotivo`, `DenunciaStatus`, `DENUNCIA_STATUS_EM_ABERTO`. |
| `backend/client_access.py` | Dependency `get_current_cliente` (papel + dono dos recursos derivados do token). |
| `backend/schemas.py` | `DenunciaCreate` (validação) e `DenunciaRead` (serialização). |
| `backend/routes/denuncias.py` | Rotas `/api/denuncias` e `/api/denuncias/me`. |
| `backend/tests/test_denuncias.py` | Testes de autorização, payload, duplicidade, escopo e paginação. |
| `web/types/denuncias.ts`, `web/services/denuncias.ts` | Contratos tipados e cliente HTTP do fluxo web. |
| `web/components/denuncias/DenunciaModal.tsx` | Modal acessível de denúncia usado no diretório de profissionais. |

## Como testar

```bash
cd backend
./venv/Scripts/python.exe -m pytest tests/test_denuncias.py -v   # foco
./venv/Scripts/python.exe -m pytest tests/ -q                    # suíte completa (cobertura >= 80%)
```
