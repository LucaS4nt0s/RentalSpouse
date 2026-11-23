import { ApiError, parseErrorMessage } from './apiError';
import {
  BloqueioAgenda,
  BloqueioAgendaCreatePayload,
} from './bloqueios-format';

export * from './bloqueios-format';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ListarBloqueiosOptions {
  incluirPassados?: boolean;
  dataInicio?: string;
  dataFim?: string;
}

/**
 * Lista os bloqueios pontuais do profissional autenticado:
 * `GET /api/agendamentos/bloqueios`.
 */
export async function listarMeusBloqueios(
  token: string,
  options: ListarBloqueiosOptions = {},
): Promise<BloqueioAgenda[]> {
  const params = new URLSearchParams();
  if (options.incluirPassados) {
    params.set('incluir_passados', 'true');
  }
  if (options.dataInicio) {
    params.set('data_inicio', options.dataInicio);
  }
  if (options.dataFim) {
    params.set('data_fim', options.dataFim);
  }

  const query = params.toString();
  const url = `${API_BASE_URL}/api/agendamentos/bloqueios${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível carregar os bloqueios de agenda.'),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Cria um novo bloqueio pontual (dia inteiro ou faixa horária) na agenda:
 * `POST /api/agendamentos/bloqueios`.
 */
export async function criarBloqueioAgenda(
  token: string,
  payload: BloqueioAgendaCreatePayload,
): Promise<BloqueioAgenda> {
  const response = await fetch(`${API_BASE_URL}/api/agendamentos/bloqueios`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível registrar o bloqueio de agenda.'),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Remove um bloqueio pontual da agenda do profissional autenticado:
 * `DELETE /api/agendamentos/bloqueios/{bloqueio_id}`.
 */
export async function removerBloqueioAgenda(
  token: string,
  bloqueioId: number,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/agendamentos/bloqueios/${bloqueioId}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível remover o bloqueio de agenda.'),
      errorBody,
    );
  }
}
