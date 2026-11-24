/**
 * Tipagens TypeScript do fluxo de denúncia de profissionais (issue #68).
 * Espelham os schemas Pydantic do backend (`backend/schemas.py`) e seguem AI_RULES.md.
 */

export type DenunciaMotivo =
  | 'servico_nao_realizado'
  | 'cobranca_indevida'
  | 'conduta_inadequada'
  | 'informacoes_falsas'
  | 'outro';

export type DenunciaStatus = 'pendente' | 'em_analise' | 'resolvida' | 'arquivada';

/** Decisão administrativa aplicada à denúncia (espelha `DenunciaModeracaoAcao` no backend). */
export type DenunciaModeracaoAcao = 'banimento' | 'arquivamento' | 'reativacao';

export interface DenunciaModerarPayload {
  acao: DenunciaModeracaoAcao;
  parecer: string;
}

export interface Denuncia {
  id: number;
  cliente_id: number;
  professional_id: number;
  professional_name: string | null;
  motivo: DenunciaMotivo | string;
  descricao: string;
  status: DenunciaStatus | string;
  created_at: string;
  updated_at: string;
}

export interface DenunciaCreatePayload {
  professional_id: number;
  motivo: DenunciaMotivo;
  descricao: string;
}

export interface DenunciaMotivoOption {
  value: DenunciaMotivo;
  label: string;
  description: string;
}

/** Catálogo de motivos — deve permanecer idêntico ao enum `DenunciaMotivo` do backend. */
export const DENUNCIA_MOTIVOS: DenunciaMotivoOption[] = [
  {
    value: 'servico_nao_realizado',
    label: 'Serviço não realizado',
    description: 'Não compareceu, abandonou o serviço ou não concluiu o que foi combinado.',
  },
  {
    value: 'cobranca_indevida',
    label: 'Cobrança indevida',
    description: 'Cobrou valor diferente do combinado ou exigiu pagamento extra sem justificativa.',
  },
  {
    value: 'conduta_inadequada',
    label: 'Conduta inadequada',
    description: 'Comportamento desrespeitoso, ofensivo ou ameaçador durante o atendimento.',
  },
  {
    value: 'informacoes_falsas',
    label: 'Informações ou documentos falsos',
    description: 'Perfil, especialidades ou documentos de verificação que não condizem com a realidade.',
  },
  {
    value: 'outro',
    label: 'Outro motivo',
    description: 'Situação diferente das anteriores — descreva com detalhes no relato.',
  },
];

/** Limites do relato, espelhados de `backend/schemas.py`. */
export const DESCRICAO_MIN_CARACTERES = 20;
export const DESCRICAO_MAX_CARACTERES = 2000;

/** Status que mantêm a denúncia em análise (espelha `DENUNCIA_STATUS_EM_ABERTO` no backend). */
export const DENUNCIA_STATUS_EM_ABERTO: DenunciaStatus[] = ['pendente', 'em_analise'];

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Aguardando análise',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  arquivada: 'Arquivada',
  rejeitada: 'Arquivada',
};

export type DenunciaAdminStatusFilter = 'all' | 'pendente' | 'resolvida' | 'arquivada';

export interface DenunciaAdminItem {
  id: number;
  motivo: DenunciaMotivo | string;
  descricao: string;
  status: DenunciaStatus | string;
  created_at: string;
  updated_at: string;
  cliente_id: number;
  cliente_nome: string | null;
  cliente_email: string | null;
  professional_id: number;
  professional_name: string | null;
  professional_email: string | null;
  professional_is_active: boolean;
  professional_total_denuncias: number;
  total_denuncias_profissional: number;
  moderacao_acao?: string | null;
  moderacao_parecer?: string | null;
  moderado_em?: string | null;
  moderado_por_id?: number | null;
  moderado_por_nome?: string | null;
}

export interface DenunciaAdminResumo {
  total: number;
  pendentes: number;
  em_analise: number;
  resolvidas_banimento: number;
  rejeitadas: number;
  arquivadas: number;
}

export function motivoDenunciaLabel(motivo: string): string {
  return DENUNCIA_MOTIVOS.find((item) => item.value === motivo)?.label ?? 'Motivo não informado';
}

export function statusDenunciaLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function denunciaEmAberto(denuncia: Pick<Denuncia, 'status'>): boolean {
  return DENUNCIA_STATUS_EM_ABERTO.includes(denuncia.status as DenunciaStatus);
}

// ---------------------------------------------------------------------------
// Decisão de moderação (issue #99, Fatia 2)
// ---------------------------------------------------------------------------

/** Limites do parecer, espelhados de `DENUNCIA_PARECER_*` em `backend/schemas.py`. */
export const PARECER_MIN_CARACTERES = 10;
export const PARECER_MAX_CARACTERES = 2000;

const ACAO_MODERACAO_LABELS: Record<string, string> = {
  banimento: 'Procedente: profissional suspenso',
  arquivamento: 'Improcedente: denúncia arquivada',
  reativacao: 'Reversão: profissional reativado',
};

export function acaoModeracaoLabel(acao: string | null | undefined): string {
  if (!acao) return 'Sem decisão registrada';
  return ACAO_MODERACAO_LABELS[acao] ?? acao;
}

/** Indica se a denúncia ainda aceita uma decisão de moderação. */
export function denunciaAguardaDecisao(
  denuncia: Pick<DenunciaAdminItem, 'status'>,
): boolean {
  return DENUNCIA_STATUS_EM_ABERTO.includes(denuncia.status as DenunciaStatus);
}

/** A reativação só é oferecida para banimento ainda não revertido. */
export function podeReativarProfissional(denuncia: DenunciaAdminItem): boolean {
  return (
    denuncia.status === 'resolvida' &&
    denuncia.moderacao_acao === 'banimento' &&
    denuncia.professional_is_active === false
  );
}

/**
 * Valida o parecer antes do envio, devolvendo a mensagem de erro ou `null`.
 * Espelha as regras de `DenunciaModerarPayload` no backend para o 422 não
 * chegar ao administrador sem contexto.
 */
export function validarParecerModeracao(parecer: string): string | null {
  const texto = (parecer ?? '').trim();
  if (texto.length < PARECER_MIN_CARACTERES) {
    return `Descreva o parecer da moderação com pelo menos ${PARECER_MIN_CARACTERES} caracteres.`;
  }
  if (texto.length > PARECER_MAX_CARACTERES) {
    return `O parecer da moderação deve ter no máximo ${PARECER_MAX_CARACTERES} caracteres.`;
  }
  return null;
}
