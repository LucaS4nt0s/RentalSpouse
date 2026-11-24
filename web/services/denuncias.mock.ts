import {
  Denuncia,
  DenunciaAdminItem,
  DenunciaAdminResumo,
  DenunciaCreatePayload,
  DenunciaModerarPayload,
  denunciaEmAberto,
} from '../types/denuncias';

const MOCK_STORAGE_KEY = 'rentalspouse_mock_denuncias';
const MOCK_CLIENTE_ID = 1;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadDenuncias(): Denuncia[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Denuncia[];
    }
  } catch (err) {
    console.warn('Erro ao carregar denúncias mock:', err);
  }
  return [];
}

function saveDenuncias(denuncias: Denuncia[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(denuncias));
  } catch (err) {
    console.warn('Erro ao salvar denúncias mock:', err);
  }
}

/** Lista as denúncias mock, da mais recente para a mais antiga. */
export async function getMinhasDenunciasMock(): Promise<Denuncia[]> {
  await delay(250);
  return loadDenuncias().sort((a, b) => b.id - a.id);
}

/**
 * Registra uma denúncia mock aplicando as mesmas regras do backend:
 * bloqueia nova denúncia em aberto para o mesmo profissional (409).
 */
export async function createDenunciaMock(
  payload: DenunciaCreatePayload,
): Promise<Denuncia> {
  await delay(400);

  const denuncias = loadDenuncias();
  const jaExiste = denuncias.some(
    (item) =>
      item.professional_id === payload.professional_id && denunciaEmAberto(item),
  );

  if (jaExiste) {
    throw new Error(
      'Você já possui uma denúncia em aberto para este profissional. Aguarde a análise da equipe de moderação.',
    );
  }

  const agora = new Date().toISOString();
  const nova: Denuncia = {
    id: Date.now(),
    cliente_id: MOCK_CLIENTE_ID,
    professional_id: payload.professional_id,
    professional_name: `Profissional #${payload.professional_id}`,
    motivo: payload.motivo,
    descricao: payload.descricao,
    status: 'pendente',
    created_at: agora,
    updated_at: agora,
  };

  saveDenuncias([...denuncias, nova]);
  return nova;
}

/** Limpa o estado mock (útil em desenvolvimento/demonstrações). */
export function resetMockDenunciasState(): void {
  moderacaoOverrides.clear();
  saveDenuncias([]);
}

export interface ListAdminDenunciasFilters {
  status?: string;
  motivo?: string;
  q?: string;
  skip?: number;
  limit?: number;
}

const DEFAULT_ADMIN_SEED_DENUNCIAS: DenunciaAdminItem[] = [
  {
    id: 901,
    motivo: 'servico_nao_realizado',
    descricao:
      'O profissional agendou a visita técnica para troca do disjuntor e não compareceu nem respondeu mensagens.',
    status: 'pendente',
    created_at: '2026-11-18T14:30:00Z',
    updated_at: '2026-11-18T14:30:00Z',
    cliente_id: 1,
    cliente_nome: 'Mariana Costa',
    cliente_email: 'mariana.costa@exemplo.com',
    professional_id: 10,
    professional_name: 'Carlos Eletricista',
    professional_email: 'carlos.eletrica@exemplo.com',
    professional_is_active: true,
    professional_total_denuncias: 1,
    total_denuncias_profissional: 1,
  },
];

interface ModeracaoMockOverride {
  status: string;
  moderacao_acao: string;
  moderacao_parecer: string;
  moderado_em: string;
  moderado_por_nome: string;
  professional_is_active: boolean;
}

/**
 * Decisões aplicadas em memória no modo mock (Fatia 2).
 *
 * O estado do painel admin é derivado das denúncias mock/seed, então a decisão
 * precisa ficar à parte para que a lista, o resumo e o modal reflitam o mesmo
 * resultado sem backend.
 */
const moderacaoOverrides = new Map<number, ModeracaoMockOverride>();

function aplicarModeracaoMock(item: DenunciaAdminItem): DenunciaAdminItem {
  const override = moderacaoOverrides.get(item.id);
  return override ? { ...item, ...override } : item;
}

function getAdminDenunciasBase(): DenunciaAdminItem[] {
  const clientDenuncias = loadDenuncias();
  if (clientDenuncias.length === 0) {
    return DEFAULT_ADMIN_SEED_DENUNCIAS.map(aplicarModeracaoMock);
  }

  const counts = new Map<number, number>();
  clientDenuncias.forEach((item) => {
    counts.set(item.professional_id, (counts.get(item.professional_id) ?? 0) + 1);
  });

  return clientDenuncias.map((item) => {
    const total = counts.get(item.professional_id) ?? 1;
    return aplicarModeracaoMock({
      id: item.id,
      motivo: item.motivo,
      descricao: item.descricao,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at,
      cliente_id: item.cliente_id,
      cliente_nome: `Cliente #${item.cliente_id}`,
      cliente_email: 'cliente.mock@exemplo.com',
      professional_id: item.professional_id,
      professional_name: item.professional_name ?? `Profissional #${item.professional_id}`,
      professional_email: 'profissional.mock@exemplo.com',
      professional_is_active: true,
      professional_total_denuncias: total,
      total_denuncias_profissional: total,
    });
  });
}

export async function listAdminDenunciasMock(
  filters: ListAdminDenunciasFilters = {},
): Promise<DenunciaAdminItem[]> {
  await delay(250);
  let items = getAdminDenunciasBase();

  if (filters.status && filters.status !== 'all') {
    const target = filters.status.toLowerCase();
    items = items.filter((item) => {
      const s = String(item.status).toLowerCase();
      if (target === 'arquivada' || target === 'rejeitada') {
        return s === 'arquivada' || s === 'rejeitada';
      }
      return s === target;
    });
  }

  if (filters.motivo && filters.motivo !== 'all') {
    items = items.filter((item) => item.motivo === filters.motivo);
  }

  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim().toLowerCase();
    items = items.filter(
      (item) =>
        (item.professional_name ?? '').toLowerCase().includes(term) ||
        (item.professional_email ?? '').toLowerCase().includes(term) ||
        (item.cliente_nome ?? '').toLowerCase().includes(term) ||
        (item.cliente_email ?? '').toLowerCase().includes(term) ||
        item.descricao.toLowerCase().includes(term),
    );
  }

  const sorted = [...items].sort((a, b) => b.id - a.id);
  const skip = filters.skip ?? 0;
  const limit = filters.limit ?? 50;
  return sorted.slice(skip, skip + limit);
}

export async function getAdminDenunciasResumoMock(): Promise<DenunciaAdminResumo> {
  await delay(150);
  const items = getAdminDenunciasBase();
  const pendentes = items.filter((i) => i.status === 'pendente').length;
  const em_analise = items.filter((i) => i.status === 'em_analise').length;
  const resolvidas_banimento = items.filter((i) => i.status === 'resolvida').length;
  const rejeitadas = items.filter(
    (i) => i.status === 'arquivada' || i.status === 'rejeitada',
  ).length;
  return {
    total: items.length,
    pendentes,
    em_analise,
    resolvidas_banimento,
    rejeitadas,
    arquivadas: rejeitadas,
  };
}

/**
 * Aplica a decisão de moderação no modo mock, reproduzindo as regras do
 * backend (409 para denúncia já decidida, reativação só de banimento ativo).
 */
export async function moderarDenunciaMock(
  denunciaId: number,
  payload: DenunciaModerarPayload,
): Promise<DenunciaAdminItem> {
  await delay(350);

  const baseItems = getAdminDenunciasBase();
  const item = baseItems.find((d) => d.id === denunciaId);
  if (!item) {
    throw new Error('Denúncia não encontrada.');
  }

  const agora = new Date().toISOString();

  if (payload.acao === 'reativacao') {
    if (item.status !== 'resolvida' || item.moderacao_acao !== 'banimento') {
      throw new Error(
        'Só é possível reativar o profissional de uma denúncia resolvida por banimento ainda não revertido.',
      );
    }
    const outroBanimentoAtivo = baseItems.some(
      (d) =>
        d.professional_id === item.professional_id &&
        d.id !== denunciaId &&
        d.status === 'resolvida' &&
        d.moderacao_acao === 'banimento',
    );
    const contaAtiva = !outroBanimentoAtivo;
    const reativacao: ModeracaoMockOverride = {
      status: 'em_analise',
      moderacao_acao: 'reativacao',
      moderacao_parecer: payload.parecer,
      moderado_em: agora,
      moderado_por_nome: 'Moderador (mock)',
      professional_is_active: contaAtiva,
    };
    moderacaoOverrides.set(denunciaId, reativacao);
    baseItems.forEach((d) => {
      if (d.professional_id === item.professional_id && d.id !== denunciaId) {
        const atual = moderacaoOverrides.get(d.id);
        if (atual) {
          moderacaoOverrides.set(d.id, { ...atual, professional_is_active: contaAtiva });
        }
      }
    });
    return { ...item, ...reativacao };
  }

  if (item.status !== 'pendente' && item.status !== 'em_analise') {
    throw new Error('Esta denúncia já possui uma decisão registrada.');
  }

  const banimento = payload.acao === 'banimento';
  const decisao: ModeracaoMockOverride = {
    status: banimento ? 'resolvida' : 'arquivada',
    moderacao_acao: payload.acao,
    moderacao_parecer: payload.parecer,
    moderado_em: agora,
    moderado_por_nome: 'Moderador (mock)',
    professional_is_active: banimento ? false : item.professional_is_active,
  };
  moderacaoOverrides.set(denunciaId, decisao);
  if (banimento) {
    baseItems.forEach((d) => {
      if (d.professional_id === item.professional_id && d.id !== denunciaId) {
        const atual = moderacaoOverrides.get(d.id);
        if (atual) {
          moderacaoOverrides.set(d.id, { ...atual, professional_is_active: false });
        }
      }
    });
  }
  return { ...item, ...decisao };
}
