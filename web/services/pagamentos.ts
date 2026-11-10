const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '';
const MP_API_BASE_URL = 'https://api.mercadopago.com';

export type PagamentoMetodo = 'pix' | 'cartao_credito';
export type PagamentoStatus =
  | 'pendente'
  | 'aprovado'
  | 'recusado'
  | 'expirado'
  | 'cancelado'
  | 'estornado';

export interface Pagamento {
  id: number;
  orcamento_id: number;
  agendamento_id?: number | null;
  cliente_id: number;
  professional_id: number;
  valor: number;
  metodo: PagamentoMetodo;
  status: PagamentoStatus;
  parcelas: number;
  valor_parcela: number;
  gateway_provider: string;
  gateway_txid: string;
  external_reference: string;
  pix_copia_e_cola?: string | null;
  pix_qr_code_base64?: string | null;
  pix_expira_em?: string | null;
  cartao_ultimos_digitos?: string | null;
  cartao_bandeira?: string | null;
  cartao_nome_titular?: string | null;
  mp_status_detail?: string | null;
  motivo_recusa?: string | null;
  pago_em?: string | null;
  criado_em: string;
}

export interface CartaoTokenizadoPayload {
  card_token: string;
  payment_method_id: string;
  issuer_id?: string | null;
  nome_titular: string;
  cpf_titular: string;
  device_session_id?: string | null;
}

export interface CriarPagamentoPayload {
  orcamento_id: number;
  agendamento_id?: number | null;
  metodo: PagamentoMetodo;
  parcelas?: number;
  idempotency_key: string;
  cartao?: CartaoTokenizadoPayload;
}

function extrairDetalheErro(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) =>
        typeof item === 'object' && item && 'msg' in item
          ? String((item as { msg: unknown }).msg).replace(/^Value error,\s*/i, '')
          : String(item)
      )
      .join(' ');
  }
  return fallback;
}

export function detectarBandeiraCartao(numero: string): string {
  const digitos = numero.replace(/\D/g, '');
  if (digitos.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digitos)) return 'master';
  if (/^(34|37)/.test(digitos)) return 'amex';
  if (/^(606282|3841)/.test(digitos)) return 'hipercard';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650|651|655)/.test(digitos)) {
    return 'elo';
  }
  return 'visa';
}

/**
 * Tokeniza os dados do cartão diretamente no cliente (PCI-DSS SAQ-A / EP).
 *
 * Sem `NEXT_PUBLIC_MP_PUBLIC_KEY` a operação falha de forma explícita: nunca
 * geramos um token falso nem simulamos aprovação em produção.
 */
export async function tokenizarCartaoMercadoPago(dados: {
  numeroCartao: string;
  nomeTitular: string;
  cpfTitular: string;
  mesValidade: string;
  anoValidade: string;
  cvv: string;
}): Promise<{ card_token: string; payment_method_id: string }> {
  if (!MP_PUBLIC_KEY || MP_PUBLIC_KEY.startsWith('TEST_MOCK')) {
    throw new Error(
      'Pagamento com cartão indisponível: NEXT_PUBLIC_MP_PUBLIC_KEY não está configurada. Use PIX ou contate o suporte.'
    );
  }

  const numeroLimpo = dados.numeroCartao.replace(/\D/g, '');
  const cpfLimpo = dados.cpfTitular.replace(/\D/g, '');
  const payment_method_id = detectarBandeiraCartao(numeroLimpo);
  const anoCompleto =
    dados.anoValidade.length === 2 ? Number(`20${dados.anoValidade}`) : Number(dados.anoValidade);

  const res = await fetch(
    `${MP_API_BASE_URL}/v1/card_tokens?public_key=${encodeURIComponent(MP_PUBLIC_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        card_number: numeroLimpo,
        security_code: dados.cvv.trim(),
        expiration_month: Number(dados.mesValidade),
        expiration_year: anoCompleto,
        cardholder: {
          name: dados.nomeTitular.trim(),
          identification: { type: 'CPF', number: cpfLimpo },
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error('Não foi possível tokenizar o cartão no Mercado Pago. Verifique os dados informados.');
  }
  const json = await res.json();
  return { card_token: String(json.id), payment_method_id };
}

export async function criarPagamento(
  payload: CriarPagamentoPayload,
  token: string
): Promise<Pagamento> {
  const res = await fetch(`${API_BASE_URL}/api/pagamentos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let err = 'Falha ao processar o pagamento.';
    try {
      const errJson = await res.json();
      err = extrairDetalheErro(errJson.detail, err);
    } catch {
      // ignora erro de parse
    }
    throw new Error(err);
  }
  return res.json();
}

export async function obterPagamento(id: number, token: string): Promise<Pagamento> {
  const res = await fetch(`${API_BASE_URL}/api/pagamentos/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Não foi possível consultar o status do pagamento.');
  }
  return res.json();
}

export async function listarMeusPagamentos(
  token: string,
  orcamentoId?: number
): Promise<Pagamento[]> {
  const url = new URL(`${API_BASE_URL}/api/pagamentos/meus`);
  if (orcamentoId) {
    url.searchParams.set('orcamento_id', String(orcamentoId));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Não foi possível carregar o histórico de pagamentos.');
  }
  return res.json();
}

export async function simularAprovacaoPix(
  pagamentoId: number,
  token: string
): Promise<Pagamento> {
  const res = await fetch(`${API_BASE_URL}/api/pagamentos/${pagamentoId}/simular-aprovacao`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    let err = 'Não foi possível simular a confirmação do PIX.';
    try {
      const errJson = await res.json();
      err = extrairDetalheErro(errJson.detail, err);
    } catch {
      // ignora
    }
    throw new Error(err);
  }
  return res.json();
}
