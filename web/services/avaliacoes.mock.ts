import {
  AvaliacaoCreatePayload,
  AvaliacaoDistribuicao,
  AvaliacaoPublicRead,
  AvaliacaoRead,
  ListarAvaliacoesProfissionalParams,
  ProfissionalAvaliacoesResumo,
} from '../types/avaliacoes';
import { ApiError } from './apiError';

const MOCK_STORAGE_KEY = 'rentalspouse_mock_avaliacoes';
const MOCK_CLIENTE_ID = 1;
const MOCK_CLIENTE_NOME = 'João C.';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SEED_AVALIACOES: AvaliacaoRead[] = [
  {
    id: 101,
    cliente_id: 2,
    cliente_nome: 'Mariana S.',
    professional_id: 1,
    professional_name: 'Profissional #1',
    agendamento_id: 10,
    orcamento_id: null,
    nota: 5,
    comentario:
      'Excelente atendimento! Chegou no horário combinado, resolveu o problema elétrico rapidamente e deixou tudo limpo.',
    created_at: '2026-10-28T14:30:00Z',
    updated_at: '2026-10-28T14:30:00Z',
  },
  {
    id: 102,
    cliente_id: 3,
    cliente_nome: 'Carlos A.',
    professional_id: 1,
    professional_name: 'Profissional #1',
    agendamento_id: 11,
    orcamento_id: null,
    nota: 5,
    comentario:
      'Muito prestativo e transparente no orçamento. Recomendo para quem busca segurança e serviço bem feito.',
    created_at: '2026-10-22T18:15:00Z',
    updated_at: '2026-10-22T18:15:00Z',
  },
  {
    id: 103,
    cliente_id: 4,
    cliente_nome: 'Fernanda L.',
    professional_id: 1,
    professional_name: 'Profissional #1',
    agendamento_id: null,
    orcamento_id: 5,
    nota: 4,
    comentario:
      'Serviço ficou ótimo, apenas atrasou 15 minutos por conta do trânsito, mas avisou com antecedência.',
    created_at: '2026-10-15T11:00:00Z',
    updated_at: '2026-10-15T11:00:00Z',
  },
];

function loadAvaliacoes(): AvaliacaoRead[] {
  if (typeof window === 'undefined') return [...SEED_AVALIACOES];
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AvaliacaoRead[];
    }
  } catch (err) {
    console.warn('Erro ao carregar avaliações mock:', err);
  }
  return [...SEED_AVALIACOES];
}

function saveAvaliacoes(avaliacoes: AvaliacaoRead[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(avaliacoes));
  } catch (err) {
    console.warn('Erro ao salvar avaliações mock:', err);
  }
}

/**
 * Calcula o resumo estatístico (média, total, distribuição 1..5 e lista filtrada)
 * para um profissional em modo mock.
 */
export async function getAvaliacoesProfissionalMock(
  professionalId: number,
  params: ListarAvaliacoesProfissionalParams = {},
): Promise<ProfissionalAvaliacoesResumo> {
  await delay(220);

  const todasDoProfissional = loadAvaliacoes()
    .filter((av) => av.professional_id === professionalId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
        b.id - a.id,
    );

  const distribuicao: AvaliacaoDistribuicao = {
    estrelas_1: 0,
    estrelas_2: 0,
    estrelas_3: 0,
    estrelas_4: 0,
    estrelas_5: 0,
  };

  let somaNotas = 0;
  for (const av of todasDoProfissional) {
    somaNotas += av.nota;
    if (av.nota === 1) distribuicao.estrelas_1 += 1;
    if (av.nota === 2) distribuicao.estrelas_2 += 1;
    if (av.nota === 3) distribuicao.estrelas_3 += 1;
    if (av.nota === 4) distribuicao.estrelas_4 += 1;
    if (av.nota === 5) distribuicao.estrelas_5 += 1;
  }

  const totalAvaliacoes = todasDoProfissional.length;
  const mediaNotas =
    totalAvaliacoes > 0 ? Number((somaNotas / totalAvaliacoes).toFixed(2)) : 0;

  const filtradas =
    params.nota !== undefined && params.nota !== null
      ? todasDoProfissional.filter((av) => av.nota === params.nota)
      : todasDoProfissional;

  const skip = params.skip ?? 0;
  const limit = params.limit ?? 20;
  const paginadas: AvaliacaoPublicRead[] = filtradas
    .slice(skip, skip + limit)
    .map((av) => ({
      id: av.id,
      professional_id: av.professional_id,
      cliente_nome: av.cliente_nome,
      nota: av.nota,
      comentario: av.comentario ?? null,
      created_at: av.created_at,
    }));

  return {
    professional_id: professionalId,
    media_notas: mediaNotas,
    total_avaliacoes: totalAvaliacoes,
    distribuicao,
    items: paginadas,
  };
}

/** Lista as avaliações registradas pelo cliente autenticado em modo mock. */
export async function getMinhasAvaliacoesMock(): Promise<AvaliacaoRead[]> {
  await delay(200);
  return loadAvaliacoes()
    .filter((av) => av.cliente_id === MOCK_CLIENTE_ID)
    .sort((a, b) => b.id - a.id);
}

/** Registra uma nova avaliação em modo mock com validações equivalentes ao backend. */
export async function createAvaliacaoMock(
  payload: AvaliacaoCreatePayload,
): Promise<AvaliacaoRead> {
  await delay(300);

  if (!Number.isInteger(payload.nota) || payload.nota < 1 || payload.nota > 5) {
    throw new ApiError(422, 'A nota deve ser um número inteiro entre 1 e 5 estrelas.');
  }

  const comentarioLimpo = payload.comentario?.trim() || null;
  if (comentarioLimpo && comentarioLimpo.length < 3) {
    throw new ApiError(
      422,
      'O comentário, quando informado, deve ter pelo menos 3 caracteres.',
    );
  }

  const existentes = loadAvaliacoes();

  if (payload.agendamento_id) {
    const duplicadaAgendamento = existentes.some(
      (av) => av.agendamento_id === payload.agendamento_id,
    );
    if (duplicadaAgendamento) {
      throw new ApiError(409, 'Este agendamento já foi avaliado anteriormente.');
    }
  } else if (payload.orcamento_id) {
    const duplicadaOrcamento = existentes.some(
      (av) => av.orcamento_id === payload.orcamento_id,
    );
    if (duplicadaOrcamento) {
      throw new ApiError(409, 'Este orçamento já foi avaliado anteriormente.');
    }
  } else {
    const duplicadaAvulsa = existentes.some(
      (av) =>
        av.cliente_id === MOCK_CLIENTE_ID &&
        av.professional_id === payload.professional_id &&
        !av.agendamento_id &&
        !av.orcamento_id,
    );
    if (duplicadaAvulsa) {
      throw new ApiError(
        409,
        'Você já registrou uma avaliação para este profissional.',
      );
    }
  }

  const agora = new Date().toISOString();
  const nova: AvaliacaoRead = {
    id: Date.now(),
    cliente_id: MOCK_CLIENTE_ID,
    cliente_nome: MOCK_CLIENTE_NOME,
    professional_id: payload.professional_id,
    professional_name: `Profissional #${payload.professional_id}`,
    agendamento_id: payload.agendamento_id ?? null,
    orcamento_id: payload.orcamento_id ?? null,
    nota: payload.nota,
    comentario: comentarioLimpo,
    created_at: agora,
    updated_at: agora,
  };

  saveAvaliacoes([nova, ...existentes]);
  return nova;
}

/** Restaura o estado inicial do mock. */
export function resetMockAvaliacoesState(): void {
  saveAvaliacoes([...SEED_AVALIACOES]);
}
