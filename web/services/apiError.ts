export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Mensagem única para falhas de rede/conexão (issue #100). */
export const MENSAGEM_ERRO_CONEXAO =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';

const MENSAGEM_ERRO_INTERNO =
  'Erro interno no servidor. Tente novamente mais tarde.';

/**
 * Traduções de mensagens técnicas que ainda podem chegar ao frontend:
 * - erros nativos do `fetch` no navegador (`Failed to fetch`, `Load failed`, ...);
 * - respostas padrão do FastAPI/Starlette (`Not Found`, `Not authenticated`, ...);
 * - mensagens padrão do Pydantic v2 em inglês, caso a API não esteja atualizada.
 *
 * A ordem importa: padrões mais específicos vêm antes dos genéricos.
 */
const TRADUCOES_MENSAGENS: Array<[RegExp, string]> = [
  // Erros de rede do navegador
  [/failed to fetch/i, MENSAGEM_ERRO_CONEXAO],
  [/networkerror|network error|load failed/i, MENSAGEM_ERRO_CONEXAO],
  [/err_connection|connection refused|connection reset/i, MENSAGEM_ERRO_CONEXAO],
  [/abort(ed)?/i, 'A operação foi cancelada. Tente novamente.'],
  [
    /unexpected token|unexpected end of json|json parse|is not valid json/i,
    'Não foi possível interpretar a resposta do servidor. Tente novamente.',
  ],

  // Respostas padrão do FastAPI/Starlette
  [/^internal server error$/i, MENSAGEM_ERRO_INTERNO],
  [/^not found$/i, 'Recurso não encontrado.'],
  [/^method not allowed$/i, 'Método HTTP não permitido para este recurso.'],
  [
    /^not authenticated$/i,
    'Você precisa estar autenticado para acessar este recurso.',
  ],
  [
    /^could not validate credentials$/i,
    'Não foi possível validar suas credenciais. Faça login novamente.',
  ],
  [/^forbidden$/i, 'Você não tem permissão para acessar este recurso.'],
  [/^bad request$/i, 'Requisição inválida.'],

  // Mensagens padrão do Pydantic v2 (inglês) — rede de segurança
  [/^field required$/i, 'Este campo é obrigatório.'],
  [/^input should be a valid string$/i, 'Informe um texto válido.'],
  [
    /^string should have at least (\d+) characters?/i,
    'O texto deve ter pelo menos $1 caracteres.',
  ],
  [
    /^string should have at most (\d+) characters?/i,
    'O texto deve ter no máximo $1 caracteres.',
  ],
  [
    /^input should be greater than or equal to (\S+)/i,
    'O valor deve ser maior ou igual a $1.',
  ],
  [
    /^input should be less than or equal to (\S+)/i,
    'O valor deve ser menor ou igual a $1.',
  ],
  [/valid integer/i, 'Informe um número inteiro válido.'],
  [/valid number/i, 'Informe um valor numérico válido.'],
  [/valid boolean/i, 'Informe um valor booleano válido.'],
  [/valid date/i, 'Informe uma data válida.'],
  [
    /valid email address|email address must have an @|@-sign/i,
    'Informe um endereço de e-mail válido.',
  ],
  [/^json decode error$/i, 'O corpo da requisição não é um JSON válido.'],
  [/^list should have at least (\d+) item/i, 'Informe pelo menos $1 item(ns).'],
];

/**
 * Normaliza uma mensagem de erro técnica para português claro.
 * Remove o prefixo `Value error, ` que o Pydantic adiciona e traduz os
 * padrões conhecidos; mensagens já em português passam intactas.
 */
export function traduzirMensagemErro(mensagem: string): string {
  const limpa = (mensagem ?? '').replace(/^Value error,\s*/i, '').trim();
  if (!limpa) return '';

  for (const [padrao, traducao] of TRADUCOES_MENSAGENS) {
    if (padrao.test(limpa)) {
      return limpa.replace(padrao, traducao).trim();
    }
  }
  return limpa;
}

export function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') {
        return traduzirMensagemErro(detail) || fallback;
      }
      if (Array.isArray(detail)) {
        const mensagens = detail
          .map((item) =>
            typeof item === 'object' && item && 'msg' in item
              ? traduzirMensagemErro(String((item as { msg: unknown }).msg))
              : traduzirMensagemErro(String(item)),
          )
          .filter((item) => item.length > 0)
          .join(' ');
        return mensagens || fallback;
      }
      if (
        typeof detail === 'object' &&
        detail !== null &&
        'message' in detail &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        return (
          traduzirMensagemErro((detail as { message: string }).message) ||
          fallback
        );
      }
    }
    if (
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
    ) {
      return traduzirMensagemErro((body as { message: string }).message) || fallback;
    }
  }
  return fallback;
}

/**
 * Extrai a melhor mensagem possível de um erro lançado em um `catch` e a
 * entrega em português. Use sempre este helper em vez de `err.message`
 * direto na UI: erros nativos de `fetch` vêm em inglês.
 */
export function mensagemErro(erro: unknown, fallback: string): string {
  if (erro instanceof ApiError) {
    return traduzirMensagemErro(erro.message) || fallback;
  }
  if (erro instanceof Error) {
    return traduzirMensagemErro(erro.message) || fallback;
  }
  if (typeof erro === 'string') {
    return traduzirMensagemErro(erro) || fallback;
  }
  return fallback;
}
