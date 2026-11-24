import { Professional } from '../types/professional';
import { ApiError, parseErrorMessage } from './apiError';
import {
  cancelarAgendamentoMock,
  concluirAgendamentoMock,
  consultarMinhaDisponibilidadeMock,
  criarAgendamentoMock,
  definirMinhaDisponibilidadeMock,
  gerarAgendaMock,
  listarAgendamentosRecebidosMock,
  listarMeusAgendamentosMock,
  obterProfissionalPorIdMock,
} from './agenda.mock';

export { ApiError, parseErrorMessage } from './apiError';
export {
  calcularDuracaoMinutos,
  calcularQuantidadeSlots,
  converterHoraParaMinutos,
  DIAS_SEMANA_PT,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
  MAX_JANELAS_POR_GRADE,
  normalizarHoraCurta,
  validarGradeDisponibilidade,
  type JanelaDisponibilidadeInput,
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
  motivo_cancelamento?: string | null;
  cancelado_em?: string | null;
}

export interface AgendamentoRecebido extends Agendamento {
  cliente_nome?: string | null;
  cliente_email?: string | null;
}

export interface DisponibilidadeJanela {
  id: number;
  professional_id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  duracao_slot_min: number;
}

export interface DisponibilidadePayload {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  duracao_slot_min: number;
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

/**
/**
 * Cancela um agendamento do cliente autenticado: `PATCH /api/agendamentos/{agendamento_id}/cancelar`.
 * Libera o horário imediatamente para outros clientes agendarem.
 */
export async function cancelarAgendamento(
  token: string,
  agendamentoId: number,
  motivo?: string,
): Promise<Agendamento> {
  if (IS_MOCK_ENABLED) {
    return cancelarAgendamentoMock(agendamentoId, motivo);
  }

  const motivoLimpo = motivo?.trim();
  const response = await fetch(
    `${API_BASE_URL}/api/agendamentos/${agendamentoId}/cancelar`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(motivoLimpo ? { motivo: motivoLimpo } : {}),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível cancelar o agendamento.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Conclui explicitamente um agendamento de atendimento (issues #19 e #21).
 */
export async function concluirAgendamento(
  token: string,
  agendamentoId: number,
): Promise<Agendamento> {
  if (IS_MOCK_ENABLED) {
    return concluirAgendamentoMock(agendamentoId);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/agendamentos/${agendamentoId}/concluir`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível concluir o agendamento.',
      ),
      errorBody,
    );
  }

  return response.json();
}

export {
  verificarPermissaoCancelamento,
  type StatusPermissaoCancelamento,
} from './agenda-format';

/**
 * Consulta a grade semanal de disponibilidade do profissional autenticado:
 * `GET /api/agendamentos/disponibilidade`.
 */
export async function consultarMinhaDisponibilidade(
  token: string,
): Promise<DisponibilidadeJanela[]> {
  if (IS_MOCK_ENABLED) {
    return consultarMinhaDisponibilidadeMock();
  }

  const response = await fetch(`${API_BASE_URL}/api/agendamentos/disponibilidade`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível carregar sua grade de disponibilidade.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Substitui toda a grade semanal do profissional autenticado:
 * `PUT /api/agendamentos/disponibilidade`.
 */
export async function definirMinhaDisponibilidade(
  token: string,
  grade: DisponibilidadePayload[],
): Promise<DisponibilidadeJanela[]> {
  if (IS_MOCK_ENABLED) {
    return definirMinhaDisponibilidadeMock(grade);
  }

  const response = await fetch(`${API_BASE_URL}/api/agendamentos/disponibilidade`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(grade),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível salvar sua grade de disponibilidade.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Lista os agendamentos recebidos pelo profissional autenticado:
 * `GET /api/agendamentos/recebidos`.
 */
export async function listarAgendamentosRecebidos(
  token: string,
  statusFiltro?: AgendamentoStatus,
  opcoes?: {
    dataInicio?: string;
    dataFim?: string;
    skip?: number;
    limit?: number;
  },
): Promise<AgendamentoRecebido[]> {
  if (IS_MOCK_ENABLED) {
    return listarAgendamentosRecebidosMock(statusFiltro, opcoes);
  }

  const params = new URLSearchParams();
  if (statusFiltro) params.set('status', statusFiltro);
  if (opcoes?.dataInicio) params.set('data_inicio', opcoes.dataInicio);
  if (opcoes?.dataFim) params.set('data_fim', opcoes.dataFim);
  if (typeof opcoes?.skip === 'number') params.set('skip', String(opcoes.skip));
  if (typeof opcoes?.limit === 'number') {
    params.set('limit', String(opcoes.limit));
  }
  const query = params.toString();

  const response = await fetch(
    `${API_BASE_URL}/api/agendamentos/recebidos${query ? `?${query}` : ''}`,
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
        'Não foi possível carregar os agendamentos recebidos.',
      ),
      errorBody,
    );
  }

  return response.json();
}
