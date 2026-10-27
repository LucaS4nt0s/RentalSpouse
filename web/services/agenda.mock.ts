import { Professional } from '../types/professional';
import { ApiError } from './apiError';
import type {
  AgendaDia,
  AgendaSlot,
  Agendamento,
  AgendamentoCreatePayload,
  AgendamentoStatus,
} from './agenda';

const MOCK_STORAGE_KEY = 'rentalspouse_mock_agendamentos';

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

function formatarIsoSemFuso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

export function obterProfissionalPorIdMock(professionalId: number): Professional {
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

export function gerarAgendaMock(
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

    // Profissional sem grade (ex: id 999) ou domingos sem atendimento
    if (professionalId === 999 || diaSemana === 0) {
      dias.push({ data: dataIso, slots: [] });
      continue;
    }

    const horas = diaSemana === 6 ? [9, 10, 11] : [8, 9, 10, 11, 14, 15, 16];
    const slots: AgendaSlot[] = horas
      .map((hora) => {
        const dtIni = new Date(yyyy, d.getMonth(), d.getDate(), hora, 0, 0);
        const dtFim = new Date(dtIni.getTime() + 60 * 60 * 1000);
        const inicio = formatarIsoSemFuso(dtIni);
        const fim = formatarIsoSemFuso(dtFim);
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

export function criarAgendamentoMock(
  payload: AgendamentoCreatePayload,
): Agendamento {
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

  const dtInicio = new Date(payload.data_hora_inicio);
  const dtFim = new Date(dtInicio.getTime() + 60 * 60 * 1000);
  const fimIso = Number.isNaN(dtFim.getTime())
    ? payload.data_hora_inicio
    : formatarIsoSemFuso(dtFim);

  const novo: Agendamento = {
    id: Date.now(),
    professional_id: payload.professional_id,
    cliente_id: 1,
    orcamento_id: payload.orcamento_id ?? null,
    data_hora_inicio: payload.data_hora_inicio,
    data_hora_fim: fimIso,
    status: 'agendado',
    criado_em: new Date().toISOString(),
  };
  salvarAgendamentosMock([...atuais, novo]);
  return novo;
}

export function listarMeusAgendamentosMock(
  statusFiltro?: AgendamentoStatus,
): Agendamento[] {
  const lista = carregarAgendamentosMock();
  return statusFiltro
    ? lista.filter((ag) => ag.status === statusFiltro)
    : lista;
}
