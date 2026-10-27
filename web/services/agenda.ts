import { Professional } from '../types/professional';
import { ApiError, parseErrorMessage } from './apiError';
import {
  criarAgendamentoMock,
  gerarAgendaMock,
  listarMeusAgendamentosMock,
  obterProfissionalPorIdMock,
} from './agenda.mock';

export { ApiError, parseErrorMessage } from './apiError';
export {
  calcularDuracaoMinutos,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
} from './agenda-format';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Quando ativo, o fluxo de agenda usa dados mockados no mesmo contrato do backend (#78). */
const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_AGENDA_MOCK === 'true';

export type AgendamentoStatus = 'agendado' | 'cancelado' | 'concluido';

export interface AgendaSlot {
  data_hora_inicio: string;
  data_hora_fim: string;
  disponivel: boolean;
}

export interface AgendaDia {
  data: string;
  slots: AgendaSlot[];
}

export interface AgendamentoCreatePayload {
  professional_id: number;
  data_hora_inicio: string;
  orcamento_id?: number | null;
}

export interface Agendamento {
  id: number;
  professional_id: number;
  cliente_id: number;
  orcamento_id: number | null;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: AgendamentoStatus | string;
  criado_em: string;
}

/** Busca os dados públicos do profissional para exibir no topo e no resumo. */
export async function obterProfissionalPorId(
  professionalId: number,
): Promise<Professional> {
  if (IS_MOCK_ENABLED) {
    return obterProfissionalPorIdMock(professionalId);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/professionals/${professionalId}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Profissional não encontrado ou indisponível para agendamento.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Consulta a agenda pública de 30 dias do profissional:
 * `GET /api/professionals/{id}/agenda?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD`.
 */
export async function consultarAgendaProfissional(
  professionalId: number,
  dataInicio?: string,
  dataFim?: string,
): Promise<AgendaDia[]> {
  if (IS_MOCK_ENABLED) {
    return gerarAgendaMock(professionalId, dataInicio);
  }

  const params = new URLSearchParams();
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);

  const query = params.toString();
  const url = `${API_BASE_URL}/api/professionals/${professionalId}/agenda${
    query ? `?${query}` : ''
  }`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível carregar a agenda deste profissional.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Reserva um slot da agenda: `POST /api/agendamentos`.
 * Lança `ApiError` com `status = 409` se o slot foi ocupado no meio do caminho.
 */
export async function criarAgendamento(
  token: string,
  payload: AgendamentoCreatePayload,
): Promise<Agendamento> {
  if (IS_MOCK_ENABLED) {
    return criarAgendamentoMock(payload);
  }

  const response = await fetch(`${API_BASE_URL}/api/agendamentos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível concluir o agendamento. Tente novamente.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/** Lista os agendamentos do cliente autenticado (`GET /api/agendamentos/meus`). */
export async function listarMeusAgendamentos(
  token: string,
  statusFiltro?: AgendamentoStatus,
): Promise<Agendamento[]> {
  if (IS_MOCK_ENABLED) {
    return listarMeusAgendamentosMock(statusFiltro);
  }

  const params = new URLSearchParams();
  if (statusFiltro) params.set('status', statusFiltro);
  const query = params.toString();

  const response = await fetch(
    `${API_BASE_URL}/api/agendamentos/meus${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível carregar seus agendamentos.',
      ),
      errorBody,
    );
  }

  return response.json();
}
