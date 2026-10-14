'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Clock,
  MapPin,
  Mail,
  Phone,
  Briefcase,
  AlertTriangle,
  FileCheck,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  ProfessionalModerationReview,
  ProfessionalRejectPayload,
} from '../../types/moderation';
import {
  ProfessionalDocument,
  DOCUMENT_TYPES_CONFIG,
  DocumentType,
} from '../../types/professionalDocuments';
import { fetchDocumentBlob, resolveApiUrl } from '../../services/moderation';

interface ModerationReviewModalProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  review: ProfessionalModerationReview | null;
  isLoading: boolean;
  onApprove: (professionalId: number) => Promise<void>;
  onReject: (professionalId: number, payload: ProfessionalRejectPayload) => Promise<void>;
}

export const ModerationReviewModal: React.FC<ModerationReviewModalProps> = ({
  token,
  isOpen,
  onClose,
  review,
  isLoading,
  onApprove,
  onReject,
}) => {
  // Documento selecionado na aba de visualização
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  // Estados de Zoom da Imagem
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Estado de confirmação de aprovação
  const [isConfirmingApprove, setIsConfirmingApprove] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Estado de rejeição com justificativa
  const [isRejectingOpen, setIsRejectingOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  // Cache de Blob URLs de documentos
  const [blobUrls, setBlobUrls] = useState<Record<number, string>>({});
  const [isLoadingDocBlob, setIsLoadingDocBlob] = useState<boolean>(false);

  // Reseta estados ao abrir outro profissional
  useEffect(() => {
    if (review?.documents && review.documents.length > 0) {
      setSelectedDocId(review.documents[0].id);
    } else {
      setSelectedDocId(null);
    }
    setZoomScale(1);
    setIsConfirmingApprove(false);
    setIsRejectingOpen(false);
    setRejectReason('');
    setRejectError(null);
  }, [review]);

  // Fecha no Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApproving && !isRejecting) {
        if (isConfirmingApprove) {
          setIsConfirmingApprove(false);
        } else if (isRejectingOpen) {
          setIsRejectingOpen(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isConfirmingApprove, isRejectingOpen, isApproving, isRejecting]);

  // Documento atualmente selecionado
  const activeDocument = useMemo(() => {
    if (!review?.documents || !selectedDocId) return null;
    return review.documents.find((d) => d.id === selectedDocId) ?? review.documents[0] ?? null;
  }, [review, selectedDocId]);

  // Carrega blob seguro com token caso seja endpoint local
  const loadBlobForDocument = useCallback(
    async (doc: ProfessionalDocument) => {
      if (!doc.download_url) return;
      if (blobUrls[doc.id]) return;

      setIsLoadingDocBlob(true);
      try {
        const url = await fetchDocumentBlob(token, doc.download_url);
        setBlobUrls((prev) => ({ ...prev, [doc.id]: url }));
      } catch (err) {
        console.warn('Erro ao carregar blob do documento:', err);
      } finally {
        setIsLoadingDocBlob(false);
      }
    },
    [token, blobUrls]
  );

  useEffect(() => {
    if (activeDocument) {
      loadBlobForDocument(activeDocument);
    }
  }, [activeDocument, loadBlobForDocument]);

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleApproveConfirm = async () => {
    if (!review) return;
    setIsApproving(true);
    try {
      await onApprove(review.id);
      setIsConfirmingApprove(false);
    } catch {
      // Erro é tratado pelo handler pai ou repassado
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review) return;

    const trimmed = rejectReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setRejectError('Por favor, informe uma justificativa com no mínimo 5 caracteres.');
      return;
    }

    setRejectError(null);
    setIsRejecting(true);
    try {
      await onReject(review.id, { reason: trimmed });
      setIsRejectingOpen(false);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Falha ao rejeitar.');
    } finally {
      setIsRejecting(false);
    }
  };

  // Verifica se possui os 2 documentos obrigatórios
  const hasPhotoId = review?.documents?.some((d) => d.document_type === 'photo_id') ?? false;
  const hasProofOfResidence =
    review?.documents?.some((d) => d.document_type === 'proof_of_residence') ?? false;
  const canApprove = hasPhotoId && hasProofOfResidence;

  const currentDocUrl = activeDocument
    ? blobUrls[activeDocument.id] || resolveApiUrl(activeDocument.download_url ?? '')
    : '';

  const isImageDoc =
    activeDocument?.mime_type?.startsWith('image/') ||
    activeDocument?.file_name?.match(/\.(jpe?g|png|webp)$/i);

  const isPdfDoc =
    activeDocument?.mime_type === 'application/pdf' ||
    activeDocument?.file_name?.match(/\.pdf$/i);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-review-title"
    >
      <div className="relative w-full max-w-6xl rounded-3xl bg-rental-surface border border-rental-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all text-rental-ink my-auto">
        {/* ========================================================================= */}
        {/* CABEÇALHO DO MODAL                                                        */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rental-border bg-rental-surface2/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary shrink-0">
              <FileCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="modal-review-title" className="text-base sm:text-lg font-bold truncate">
                  {review ? `Avaliação: ${review.name}` : 'Auditoria de Profissional'}
                </h2>
                {review && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      review.approval_status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : review.approval_status === 'rejected'
                        ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    }`}
                  >
                    {review.approval_status === 'approved'
                      ? 'Aprovado'
                      : review.approval_status === 'rejected'
                      ? 'Rejeitado'
                      : 'Pendente de Moderação'}
                  </span>
                )}
              </div>
              <p className="text-xs text-rental-muted truncate">
                Conferência de identidade, residência e conformidade cadastral
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors shrink-0"
            aria-label="Fechar pop-up"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* CORPO DO MODAL (2 COLUNAS)                                                */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          {isLoading || !review ? (
            <div className="col-span-12 py-20 flex flex-col items-center justify-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-rental-primary border-t-transparent" />
              <p className="text-sm font-medium text-rental-muted">Carregando dados e documentos...</p>
            </div>
          ) : (
            <>
              {/* COLUNA ESQUERDA: DADOS CADASTRAIS E CHECKLIST (5 colunas) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Cartão de Dados Pessoais */}
                <div className="rounded-2xl p-4 bg-rental-surface2/60 border border-rental-border space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-rental-border">
                    <span className="text-xs font-bold text-rental-muted uppercase tracking-wider">
                      Dados Cadastrais
                    </span>
                    <span className="text-xs font-mono font-bold text-rental-primary">
                      ID #{review.id}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-rental-ink">
                      <Mail className="h-3.5 w-3.5 text-rental-muted shrink-0" />
                      <span className="truncate">{review.email}</span>
                    </div>

                    {review.phone && (
                      <div className="flex items-center gap-2 text-rental-ink">
                        <Phone className="h-3.5 w-3.5 text-rental-muted shrink-0" />
                        <span>{review.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-rental-ink">
                      <MapPin className="h-3.5 w-3.5 text-rental-muted shrink-0" />
                      <span>
                        {review.city || 'Cidade não informada'} - {review.state || 'UF'}
                        {review.service_radius_km && (
                          <span className="text-rental-muted ml-1">
                            (Raio: {review.service_radius_km} km)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 pt-1 text-rental-ink">
                      <Clock className="h-3.5 w-3.5 text-rental-muted shrink-0 mt-0.5" />
                      <div>
                        <div>Submetido em: {formatDate(review.documents_submitted_at)}</div>
                        <div className="text-[11px] text-rental-muted">
                          Criado em: {formatDate(review.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Especialidades */}
                  {review.specialties && review.specialties.length > 0 && (
                    <div className="pt-2 border-t border-rental-border">
                      <span className="text-[11px] font-semibold text-rental-muted block mb-1.5">
                        Especialidades declaradas:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {review.specialties.map((spec) => (
                          <span
                            key={spec}
                            className="inline-flex items-center gap-1 rounded-lg bg-rental-primary/10 border border-rental-primary/20 px-2 py-0.5 text-[11px] font-semibold text-rental-primary"
                          >
                            <Briefcase className="h-2.5 w-2.5" />
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Biografia / Apresentação */}
                  {review.bio && (
                    <div className="pt-2 border-t border-rental-border">
                      <span className="text-[11px] font-semibold text-rental-muted block mb-1">
                        Biografia / Descrição:
                      </span>
                      <p className="text-xs text-rental-muted leading-relaxed bg-rental-surface rounded-xl p-2.5 border border-rental-border italic">
                        &quot;{review.bio}&quot;
                      </p>
                    </div>
                  )}
                </div>

                {/* Checklist de Documentos Obrigatórios */}
                <div className="rounded-2xl p-4 bg-rental-surface2/60 border border-rental-border space-y-2.5">
                  <span className="text-xs font-bold text-rental-muted uppercase tracking-wider block">
                    Conformidade Documental
                  </span>

                  <div className="space-y-2 text-xs">
                    <div
                      className={`flex items-center justify-between p-2 rounded-xl border ${
                        hasPhotoId
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hasPhotoId ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-semibold">Documento de Identidade com Foto</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                        {hasPhotoId ? 'Anexado' : 'Faltando'}
                      </span>
                    </div>

                    <div
                      className={`flex items-center justify-between p-2 rounded-xl border ${
                        hasProofOfResidence
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hasProofOfResidence ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-semibold">Comprovante de Residência</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                        {hasProofOfResidence ? 'Anexado' : 'Faltando'}
                      </span>
                    </div>

                    {/* Documentos Opcionais */}
                    <div className="pt-1 flex items-center justify-between text-[11px] text-rental-muted px-1">
                      <span>Certificado Técnico:</span>
                      <span className="font-medium">
                        {review.documents?.some((d) => d.document_type === 'technical_certificate')
                          ? 'Enviado'
                          : 'Não anexado (opcional)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-rental-muted px-1">
                      <span>Foto de Perfil:</span>
                      <span className="font-medium">
                        {review.documents?.some((d) => d.document_type === 'profile_photo')
                          ? 'Enviada'
                          : 'Não anexada (opcional)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Histórico / Notas prévias */}
                {review.approval_notes && (
                  <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/20 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Última Justificativa de Reprovação Registrada:
                    </div>
                    <p className="text-rental-muted leading-relaxed whitespace-pre-wrap bg-rental-surface p-2.5 rounded-xl border border-red-500/10 mt-1">
                      {review.approval_notes}
                    </p>
                  </div>
                )}

                {review.approved_at && (
                  <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Profissional Aprovado Anteriormente:
                    </div>
                    <p className="text-rental-muted">
                      Aprovado em {formatDate(review.approved_at)}
                      {review.approved_by_name ? ` por ${review.approved_by_name}` : ''}.
                    </p>
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA: VISUALIZADOR INTEGRADO DE DOCUMENTOS (7 colunas) */}
              <div className="lg:col-span-7 flex flex-col gap-3 min-h-[460px]">
                {/* Abas dos Documentos Anexados */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-rental-border pb-2">
                  {review.documents?.length === 0 ? (
                    <span className="text-xs text-rental-muted py-2">
                      Nenhum documento físico anexado.
                    </span>
                  ) : (
                    review.documents?.map((doc) => {
                      const meta = DOCUMENT_TYPES_CONFIG[doc.document_type as DocumentType];
                      const isSelected = activeDocument?.id === doc.id;
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            setSelectedDocId(doc.id);
                            setZoomScale(1);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                              : 'bg-rental-surface2 text-rental-muted hover:text-rental-ink hover:bg-rental-surface'
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>{meta?.title || doc.document_type}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                              isSelected ? 'bg-white/20' : 'bg-rental-border text-rental-muted'
                            }`}
                          >
                            {formatFileSize(doc.file_size)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Barra de Ferramentas do Arquivo Selecionado */}
                {activeDocument && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-rental-surface2 text-xs border border-rental-border">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-rental-ink block truncate">
                        {activeDocument.file_name}
                      </span>
                      <span className="text-[11px] text-rental-muted font-mono">
                        {activeDocument.mime_type} • {formatFileSize(activeDocument.file_size)} •
                        Enviado em {formatDate(activeDocument.uploaded_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isImageDoc && (
                        <div className="flex items-center gap-1 bg-rental-surface px-1.5 py-0.5 rounded-lg border border-rental-border">
                          <button
                            type="button"
                            onClick={() => setZoomScale((z) => Math.max(0.5, z - 0.25))}
                            className="p-1 hover:text-rental-primary"
                            title="Diminuir Zoom"
                          >
                            <ZoomOut className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[10px] font-mono px-1">
                            {Math.round(zoomScale * 100)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => setZoomScale((z) => Math.min(3, z + 0.25))}
                            className="p-1 hover:text-rental-primary"
                            title="Aumentar Zoom"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setZoomScale(1)}
                            className="p-1 hover:text-rental-primary"
                            title="Resetar Zoom"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {currentDocUrl && (
                        <>
                          <a
                            href={currentDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-rental-muted hover:text-rental-ink hover:bg-rental-surface border border-rental-border transition-colors"
                            title="Abrir arquivo em nova guia"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={currentDocUrl}
                            download={activeDocument.file_name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-rental-primary hover:bg-rental-primary/10 border border-rental-primary/30 transition-colors"
                            title="Baixar arquivo"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Baixar</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Área de Visualização do Arquivo */}
                <div className="flex-1 rounded-2xl border border-rental-border bg-rental-surface2/30 flex items-center justify-center p-3 relative overflow-hidden min-h-[380px]">
                  {isLoadingDocBlob ? (
                    <div className="flex flex-col items-center gap-2 text-rental-muted text-xs">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-rental-primary border-t-transparent" />
                      <span>Carregando documento seguro...</span>
                    </div>
                  ) : !activeDocument ? (
                    <div className="text-center text-rental-muted text-xs p-8">
                      <FileText className="h-10 w-10 mx-auto text-rental-muted/40 mb-2" />
                      Nenhum documento selecionado para conferência.
                    </div>
                  ) : isImageDoc ? (
                    <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                      <img
                        src={currentDocUrl}
                        alt={activeDocument.file_name}
                        style={{ transform: `scale(${zoomScale})` }}
                        className="max-h-[500px] max-w-full object-contain rounded-xl shadow-md transition-transform duration-150 origin-center select-none"
                      />
                    </div>
                  ) : isPdfDoc ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4 text-center">
                      <div className="p-4 rounded-2xl bg-rental-primary/10 text-rental-primary">
                        <FileText className="h-12 w-12" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-rental-ink">
                          Documento em Formato PDF
                        </h4>
                        <p className="text-xs text-rental-muted max-w-sm mt-1">
                          {activeDocument.file_name} ({formatFileSize(activeDocument.file_size)})
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={currentDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rental-primary text-[var(--rs-primary-text)] font-bold text-xs hover:bg-[var(--rs-primary-hover)] shadow-sm transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Visualizar PDF em Nova Guia
                        </a>
                        <a
                          href={currentDocUrl}
                          download={activeDocument.file_name}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rental-surface border border-rental-border text-rental-ink font-bold text-xs hover:bg-rental-surface2 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar PDF
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-rental-muted text-xs p-6 space-y-3">
                      <FileText className="h-10 w-10 mx-auto text-rental-muted/40" />
                      <p>Visualização direta não suportada para este tipo de mídia.</p>
                      <a
                        href={currentDocUrl}
                        download={activeDocument.file_name}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rental-primary text-[var(--rs-primary-text)] font-bold text-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Arquivo
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RODAPÉ DO MODAL — AÇÕES DE MODERAÇÃO                                      */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-t border-rental-border bg-rental-surface2/50 shrink-0">
          {/* Confirmação de Aprovação */}
          {isConfirmingApprove ? (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 animate-fadeIn flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm block">
                    Confirmar Aprovação do Profissional?
                  </span>
                  <p className="text-rental-muted mt-0.5">
                    O cadastro de <strong>{review?.name}</strong> será ativado e ficará visível para
                    clientes na vitrine pública. Um e-mail de notificação será enviado.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsConfirmingApprove(false)}
                  disabled={isApproving}
                  className="px-3.5 py-2 rounded-xl border border-rental-border bg-rental-surface text-rental-ink font-bold text-xs hover:bg-rental-surface2 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApproveConfirm}
                  disabled={isApproving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isApproving && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Sim, Aprovar Cadastro
                </button>
              </div>
            </div>
          ) : isRejectingOpen ? (
            /* Formulário de Rejeição com Justificativa */
            <form onSubmit={handleRejectConfirm} className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 animate-fadeIn space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm block">Rejeitar Documentos com Justificativa</span>
                  <p className="text-rental-muted font-normal text-xs mt-0.5">
                    Informe o motivo detalhado para que o profissional entenda o que precisa corrigir e possa reenviar os documentos.
                  </p>
                </div>
              </div>

              {rejectError && (
                <div className="p-2.5 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold">
                  {rejectError}
                </div>
              )}

              <div>
                <textarea
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectError) setRejectError(null);
                  }}
                  rows={3}
                  placeholder="Ex: O comprovante de residência está com data superior a 90 dias ou ilegível. Por favor, envie uma conta de água, luz ou gás recente..."
                  className="w-full rounded-xl border border-red-500/30 bg-rental-surface p-3 text-xs text-rental-ink focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
                <span className="text-[11px] text-rental-muted block mt-1">
                  Mínimo de 5 caracteres. Este motivo será gravado no perfil e enviado por e-mail.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRejectingOpen(false)}
                  disabled={isRejecting}
                  className="px-3.5 py-2 rounded-xl border border-rental-border bg-rental-surface text-rental-ink font-bold text-xs hover:bg-rental-surface2 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRejecting || rejectReason.trim().length < 5}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isRejecting && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Confirmar Reprovação
                </button>
              </div>
            </form>
          ) : (
            /* Botões Padrão de Decisão */
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-rental-muted">
                <Info className="h-4 w-4 text-rental-primary shrink-0" />
                <span>
                  {canApprove
                    ? 'Todos os documentos obrigatórios foram detectados.'
                    : 'Atenção: foto de documento ou comprovante de residência ausentes.'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-rental-border bg-rental-surface text-rental-ink font-bold text-xs hover:bg-rental-surface2 transition-colors"
                >
                  Fechar
                </button>

                {/* Botão Rejeitar */}
                <button
                  type="button"
                  onClick={() => setIsRejectingOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-500/20 transition-colors"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Rejeitar Documentos
                </button>

                {/* Botão Aprovar */}
                <button
                  type="button"
                  onClick={() => setIsConfirmingApprove(true)}
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? 'Aprovar profissional e liberar perfil'
                      : 'Não é possível aprovar sem os 2 documentos obrigatórios'
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprovar Cadastro
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
