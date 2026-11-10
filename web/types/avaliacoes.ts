/**
 * Contratos e tipagens TypeScript para o módulo de avaliações e comentários
 * de profissionais (issues #19 e #21).
 *
 * Espelha os schemas Pydantic v2 definidos em `backend/schemas.py`:
 * - `AvaliacaoCreate`
 * - `AvaliacaoRead`
 * - `AvaliacaoPublicRead`
 * - `AvaliacaoDistribuicaoRead`
 * - `ProfissionalAvaliacoesResumoRead`
 */

export type AvaliacaoNota = 1 | 2 | 3 | 4 | 5;

export const AVALIACAO_NOTAS: readonly AvaliacaoNota[] = [5, 4, 3, 2, 1] as const;

export const AVALIACAO_COMENTARIO_MIN_CARACTERES = 3;
export const AVALIACAO_COMENTARIO_MAX_CARACTERES = 1000;

export interface AvaliacaoCreatePayload {
  professional_id: number;
  nota: number;
  comentario?: string | null;
  agendamento_id?: number | null;
  orcamento_id?: number | null;
}

export interface AvaliacaoRead {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  professional_id: number;
  professional_name?: string | null;
  agendamento_id?: number | null;
  orcamento_id?: number | null;
  nota: number;
  comentario?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvaliacaoPublicRead {
  id: number;
  professional_id: number;
  cliente_nome: string;
  nota: number;
  comentario?: string | null;
  created_at: string;
}

export interface AvaliacaoDistribuicao {
  estrelas_1: number;
  estrelas_2: number;
  estrelas_3: number;
  estrelas_4: number;
  estrelas_5: number;
}

export interface ProfissionalAvaliacoesResumo {
  professional_id: number;
  media_notas: number;
  total_avaliacoes: number;
  distribuicao: AvaliacaoDistribuicao;
  items: AvaliacaoPublicRead[];
}

export interface ListarAvaliacoesProfissionalParams {
  nota?: number | null;
  skip?: number;
  limit?: number;
}

/**
 * Retorna a quantidade de avaliações registradas para determinada estrela (1 a 5).
 */
export function obterContagemPorEstrela(
  distribuicao: AvaliacaoDistribuicao | undefined | null,
  estrela: number,
): number {
  if (!distribuicao) return 0;
  switch (estrela) {
    case 5:
      return distribuicao.estrelas_5 ?? 0;
    case 4:
      return distribuicao.estrelas_4 ?? 0;
    case 3:
      return distribuicao.estrelas_3 ?? 0;
    case 2:
      return distribuicao.estrelas_2 ?? 0;
    case 1:
      return distribuicao.estrelas_1 ?? 0;
    default:
      return 0;
  }
}

/**
 * Calcula o percentual (0 a 100) de avaliações de determinada estrela sobre o total.
 */
export function calcularPercentualEstrela(
  distribuicao: AvaliacaoDistribuicao | undefined | null,
  totalAvaliacoes: number,
  estrela: number,
): number {
  if (!totalAvaliacoes || totalAvaliacoes <= 0) return 0;
  const qtd = obterContagemPorEstrela(distribuicao, estrela);
  return Math.round((qtd / totalAvaliacoes) * 100);
}

/**
 * Formata a nota média com 1 casa decimal no padrão brasileiro (ex.: 4,8).
 */
export function formatarMediaNotas(media: number | undefined | null): string {
  if (media === undefined || media === null || Number.isNaN(media) || media <= 0) {
    return '0,0';
  }
  return media.toFixed(1).replace('.', ',');
}
