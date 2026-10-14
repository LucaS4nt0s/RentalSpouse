const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface OrcamentoFoto {
  id: number;
  orcamento_id: number;
  nome_original: string;
  tamanho_bytes: number;
  mime_type: string;
  enviado_em: string;
  url_download?: string;
}

export interface Orcamento {
  id: number;
  cliente_id?: number | null;
  cliente_nome: string;
  cliente_email: string;
  cliente_telefone?: string | null;
  professional_id: number;
  descricao: string;
  status: 'pendente' | 'respondido' | 'recusado' | 'cancelado' | string;
  valor_estimado?: number | null;
  resposta_profissional?: string | null;
  respondido_em?: string | null;
  criado_em: string;
  atualizado_em: string;
  fotos: OrcamentoFoto[];
}

export interface SolicitacaoOrcamentoPayload {
  professional_id: number;
  descricao: string;
  cliente_nome?: string;
  cliente_email?: string;
  cliente_telefone?: string;
  fotos?: File[];
}

export async function criarOrcamento(
  payload: SolicitacaoOrcamentoPayload,
  token?: string | null
): Promise<Orcamento> {
  const formData = new FormData();
  formData.append('professional_id', String(payload.professional_id));
  formData.append('descricao', payload.descricao.trim());

  if (payload.cliente_nome?.trim()) {
    formData.append('cliente_nome', payload.cliente_nome.trim());
  }
  if (payload.cliente_email?.trim()) {
    formData.append('cliente_email', payload.cliente_email.trim());
  }
  if (payload.cliente_telefone?.trim()) {
    formData.append('cliente_telefone', payload.cliente_telefone.trim());
  }

  if (payload.fotos && payload.fotos.length > 0) {
    for (const foto of payload.fotos) {
      formData.append('fotos', foto);
    }
  }

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/orcamentos`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = 'Falha ao enviar solicitação de orçamento.';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch {
      // Ignora erro de parse
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function listarMeusOrcamentos(
  token: string,
  statusFiltro?: string
): Promise<Orcamento[]> {
  const url = new URL(`${API_BASE_URL}/api/orcamentos/me`);
  if (statusFiltro) {
    url.searchParams.set('status_filtro', statusFiltro);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Falha ao listar orçamentos.');
  }

  return response.json();
}

export async function obterOrcamento(
  id: number,
  token?: string | null
): Promise<Orcamento> {
  const headers: HeadersInit = { Accept: 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/api/orcamentos/${id}`, {
    headers,
  });

  if (!res.ok) {
    let err = 'Falha ao buscar detalhes do orçamento.';
    try {
      const errJson = await res.json();
      err = errJson.detail || err;
    } catch {
      // Ignora erro de JSON
    }
    throw new Error(err);
  }

  return res.json();
}

export interface ResponderOrcamentoPayload {
  valor_estimado: number;
  resposta_profissional: string;
}

export async function responderOrcamento(
  id: number,
  payload: ResponderOrcamentoPayload,
  token: string
): Promise<Orcamento> {
  const res = await fetch(`${API_BASE_URL}/api/orcamentos/${id}/responder`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let err = 'Falha ao responder orçamento.';
    try {
      const errJson = await res.json();
      err = errJson.detail || err;
    } catch {
      // Ignora erro de JSON
    }
    throw new Error(err);
  }

  return res.json();
}

export function obterFotoUrl(orcamentoId: number, fotoId: number): string {
  return `${API_BASE_URL}/api/orcamentos/${orcamentoId}/fotos/${fotoId}`;
}

