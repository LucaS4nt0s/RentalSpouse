import { Professional } from '../types/professional';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Quando ativo, o fluxo de agenda usa dados mockados no mesmo contrato do backend (#78). */
const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_AGENDA_MOCK === 'true';

const MOCK_STORAGE_KEY = 'rentalspouse_mock_agendamentos';

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

function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            typeof item === 'object' && item && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : String(item),
          )
          .join(', ');
      }
      if (
        typeof detail === 'object' &&
        detail !== null &&
        'message' in detail &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        return (detail as { message: string }).message;
      }
    }
    if (
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
    ) {
      return (body as { message: string }).message;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Helpers de formatação de data/hora (sem depender de conversão de fuso)
// ---------------------------------------------------------------------------

/** Extrai YYYY-MM-DD de uma string ISO naive ou aware sem deslocar o dia. */
export function extrairDataIso(iso: string): string {
  return iso.slice(0, 10);
}

/** Extrai HH:MM de uma string ISO (`YYYY-MM-DDTHH:MM:SS`). */
export function extrairHoraCurta(iso: string): string {
  const parteHora = iso.split('T')[1] ?? '';
  return parteHora.slice(0, 5);
}

/** Calcula a duração em minutos entre `data_hora_inicio` e `data_hora_fim`. */
export function calcularDuracaoMinutos(inicioIso: string, fimIso: string): number {
  const [hIni, mIni] = extrairHoraCurta(inicioIso).split(':').map(Number);
  const [hFim, mFim] = extrairHoraCurta(fimIso).split(':').map(Number);
  const diff = hFim * 60 + mFim - (hIni * 60 + mIni);
  return diff > 0 ? diff : 60;
}

/** Formata `YYYY-MM-DD` para exibição amigável em pt-BR (ex: "segunda-feira, 26 de outubro de 2026"). */
export function formatarDataCompleta(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  if (!ano || !mes || !dia) return dataIso;
  const dataLocal = new Date(ano, mes - 1, dia);
  return dataLocal.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Mock local no mesmo formato do contrato (#78)
// ---------------------------------------------------------------------------

function carregarAgendamentosMock(): Agendamento[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Agendamento[]) : [];
  } catch {
    return [];
  }
}

function salvarAgendamentosMock(lista: Agendamento[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(lista));
  } catch {
    // Ignora falha de storage
  }
}

function gerarAgendaMock(
  professionalId: number,
  dataInicio?: string,
): AgendaDia[] {
  const base = dataInicio ? new Date(`${dataInicio}T00:00:00`) : new Date();
  const reservados = new Set(
    carregarAgendamentosMock()
      .filter(
        (ag) =>
          ag.professional_id === professionalId && ag.status !== 'cancelado',
      )
      .map((ag) => ag.data_hora_inicio),
  );

  const dias: AgendaDia[] = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dataIso = `${yyyy}-${mm}-${dd}`;
    const diaSemana = d.getDay(); // 0 = domingo, 6 = sábado

    // Profissional sem grade (ex: id múltiplo de 999) ou domingos sem atendimento
    if (professionalId === 999 || diaSemana === 0) {
      dias.push({ data: dataIso, slots: [] });
      continue;
    }

    const horas = diaSemana === 6 ? [9, 10, 11] : [8, 9, 10, 11, 14, 15, 16];
    const slots: AgendaSlot[] = horas
      .map((hora) => {
        const hIni = String(hora).padStart(2, '0');
        const hFim = String(hora + 1).padStart(2, '0');
        const inicio = `${dataIso}T${hIni}:00:00`;
        const fim = `${dataIso}T${hFim}:00:00`;
        return {
          data_hora_inicio: inicio,
          data_hora_fim: fim,
          disponivel: !reservados.has(inicio),
        };
      })
      .filter((slot) => slot.disponivel);

    dias.push({ data: dataIso, slots });
  }
  return dias;
}

// ---------------------------------------------------------------------------
// Chamadas HTTP reais (contrato da issue #78)
// ---------------------------------------------------------------------------

/** Busca os dados públicos do profissional para exibir no topo e no resumo. */
export async function obterProfissionalPorId(
  professionalId: number,
): Promise<Professional> {
  if (IS_MOCK_ENABLED) {
    return {
      id: professionalId,
      name: `Profissional #${professionalId}`,
      email: `profissional.${professionalId}@exemplo.com`,
      bio: 'Especialista verificado em manutenção e reparos residenciais.',
      service_radius_km: 15,
      specialties: ['Elétrica', 'Reparos Gerais'],
      city: 'São Paulo',
      state: 'SP',
      approval_status: 'approved',
      is_active: true,
    };
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
    const atuais = carregarAgendamentosMock();
    const conflito = atuais.some(
      (ag) =>
        ag.professional_id === payload.professional_id &&
        ag.data_hora_inicio === payload.data_hora_inicio &&
        ag.status !== 'cancelado',
    );
    if (conflito) {
      throw new ApiError(
        409,
        'Este horário acabou de ser reservado por outro cliente. Atualize a agenda e escolha outro slot.',
      );
    }
    const [dataParte, horaParte = '09:00:00'] =
      payload.data_hora_inicio.split('T');
    const hora = Number(horaParte.slice(0, 2));
    const fimHora = String((hora + 1) % 24).padStart(2, '0');
    const novo: Agendamento = {
      id: Date.now(),
      professional_id: payload.professional_id,
      cliente_id: 1,
      orcamento_id: payload.orcamento_id ?? null,
      data_hora_inicio: payload.data_hora_inicio,
      data_hora_fim: `${dataParte}T${fimHora}:${horaParte.slice(3)}`,
      status: 'agendado',
      criado_em: new Date().toISOString(),
    };
    salvarAgendamentosMock([...atuais, novo]);
    return novo;
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
    const lista = carregarAgendamentosMock();
    return statusFiltro
      ? lista.filter((ag) => ag.status === statusFiltro)
      : lista;
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
