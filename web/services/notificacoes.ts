const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface Notificacao {
  id: number;
  user_email: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  referencia_id: number | null;
  lida: boolean;
  criada_em: string;
}

export async function listarNotificacoes(
  token: string,
  options?: { naoLidas?: boolean; limit?: number }
): Promise<Notificacao[]> {
  const url = new URL(`${API_BASE_URL}/api/notificacoes`);
  if (options?.naoLidas) {
    url.searchParams.set('nao_lidas', 'true');
  }
  if (options?.limit) {
    url.searchParams.set('limit', String(options.limit));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error('Falha ao obter notificações.');
  }

  return res.json();
}

export async function marcarNotificacaoComoLida(
  id: number,
  token: string
): Promise<Notificacao> {
  const res = await fetch(`${API_BASE_URL}/api/notificacoes/${id}/lida`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error('Falha ao marcar notificação como lida.');
  }

  return res.json();
}

export async function marcarTodasNotificacoesComoLidas(
  token: string
): Promise<{ mensagem: string; total: number }> {
  const res = await fetch(`${API_BASE_URL}/api/notificacoes/marcar-todas-lidas`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error('Falha ao marcar todas as notificações como lidas.');
  }

  return res.json();
}
