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
};

export function motivoDenunciaLabel(motivo: string): string {
  return DENUNCIA_MOTIVOS.find((item) => item.value === motivo)?.label ?? 'Motivo não informado';
}

export function statusDenunciaLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function denunciaEmAberto(denuncia: Pick<Denuncia, 'status'>): boolean {
  return DENUNCIA_STATUS_EM_ABERTO.includes(denuncia.status as DenunciaStatus);
}
