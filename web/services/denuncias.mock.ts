import {
  Denuncia,
  DenunciaCreatePayload,
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
  saveDenuncias([]);
}
