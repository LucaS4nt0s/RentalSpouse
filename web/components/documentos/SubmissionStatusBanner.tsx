'use client';

import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Info,
} from 'lucide-react';
import {
  DocumentType,
  DOCUMENT_TYPES_CONFIG,
  ProfessionalDocumentsSummary,
} from '../../types/professionalDocuments';

interface SubmissionStatusBannerProps {
  summary: ProfessionalDocumentsSummary;
}

export const SubmissionStatusBanner: React.FC<SubmissionStatusBannerProps> = ({
  summary,
}) => {
  const {
    approval_status,
    approval_notes,
    submitted_at,
    is_complete,
    missing_required,
  } = summary;

  // 1. Aprovado pelo administrador
  if (approval_status === 'approved') {
    return (
      <div className="rounded-2xl border border-[var(--rs-success)]/30 bg-[var(--rs-success)]/10 p-5 sm:p-6 text-rental-ink animate-fadeIn">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-[var(--rs-success)]/20 text-[var(--rs-success)] shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-[var(--rs-success)]">
              Documentação Aprovada com Sucesso!
            </h3>
            <p className="text-sm text-rental-muted leading-relaxed">
              Seu perfil de profissional foi validado pela equipe de administração.
              Seu perfil agora está visível e elegível para receber solicitações de orçamentos e serviços.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Rejeitado pelo administrador (necessita ajustes)
  if (approval_status === 'rejected') {
    return (
      <div className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-5 sm:p-6 text-rental-ink animate-fadeIn">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-[var(--rs-error)]/20 text-[var(--rs-error)] shrink-0">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-[var(--rs-error)]">
              Documentação com Pendência / Necessita Ajustes
            </h3>
            <p className="text-sm text-rental-muted leading-relaxed">
              O administrador analisou seus documentos e identificou itens que precisam ser corrigidos antes da aprovação do cadastro.
            </p>
            {approval_notes && (
              <div className="mt-3 rounded-xl bg-rental-surface p-4 border border-[var(--rs-border)] text-sm">
                <span className="font-semibold text-rental-ink block mb-1">
                  Motivo apontado pelo administrador:
                </span>
                <p className="text-rental-muted whitespace-pre-wrap">{approval_notes}</p>
              </div>
            )}
            <p className="text-xs sm:text-sm font-medium text-[var(--rs-error)] pt-1">
              Substitua os documentos apontados abaixo e clique novamente em &quot;Enviar para Análise&quot;.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Em análise (submetido e aguardando avaliação)
  if (submitted_at) {
    const formattedDate = new Date(submitted_at).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    return (
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 sm:p-6 text-rental-ink animate-fadeIn">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-500 shrink-0">
            <Clock className="h-6 w-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-blue-500">
                Documentos em Análise pelo Administrador
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                Enviado em {formattedDate}
              </span>
            </div>
            <p className="text-sm text-rental-muted leading-relaxed">
              Seus documentos foram enviados com sucesso e estão na fila de moderação.
              Enquanto a análise estiver em andamento, os arquivos ficam bloqueados para alterações.
              Você receberá a confirmação assim que o processo for concluído.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Rascunho / Em preenchimento (ainda não submetido)
  return (
    <div className="rounded-2xl border border-rental-border bg-rental-surface p-5 sm:p-6 text-rental-ink shadow-panel animate-fadeIn">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-rental-primary/10 text-rental-primary shrink-0">
          {is_complete ? (
            <FileCheck2 className="h-6 w-6 text-rental-primary" />
          ) : (
            <Info className="h-6 w-6 text-rental-primary" />
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-rental-ink">
            {is_complete
              ? 'Documentos Obrigatórios Prontos para Envio'
              : 'Envio de Documentos para Análise Cadastral'}
          </h3>
          <p className="text-sm text-rental-muted leading-relaxed">
            {is_complete
              ? 'Todos os documentos obrigatórios foram anexados. Revise os arquivos abaixo e clique em "Enviar para Análise" para encaminhá-los ao administrador.'
              : 'Para que seu cadastro de profissional seja aprovado, envie fotos nítidas ou arquivos PDF dos documentos solicitados.'}
          </p>

          {!is_complete && missing_required.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-rental-muted">Obrigatórios pendentes:</span>
              {missing_required.map((reqType: DocumentType) => (
                <span
                  key={reqType}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[var(--rs-error)]/10 text-[var(--rs-error)] font-medium"
                >
                  {DOCUMENT_TYPES_CONFIG[reqType]?.title || reqType}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
