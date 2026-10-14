'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  User,
  Mail,
  Phone,
  Image as ImageIcon,
  DollarSign,
  Send,
  AlertCircle,
  CheckCircle2,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  Orcamento,
  obterOrcamento,
  responderOrcamento,
  obterFotoUrl,
} from '../../services/orcamentos';
import { Button } from '../ui/Button';

interface QuoteDetailModalProps {
  orcamentoId: number;
  onClose: () => void;
  onResponded?: () => void;
}

export const QuoteDetailModal: React.FC<QuoteDetailModalProps> = ({
  orcamentoId,
  onClose,
  onResponded,
}) => {
  const { token, user } = useAuth();
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Formulário de Resposta
  const [valorInput, setValorInput] = useState<string>('');
  const [respostaInput, setRespostaInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  // Visualizador ampliado de foto (Lightbox)
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const carregarDetalhes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await obterOrcamento(orcamentoId, token);
      setOrcamento(data);
      if (data.valor_estimado) {
        setValorInput(String(data.valor_estimado));
      }
      if (data.resposta_profissional) {
        setRespostaInput(data.resposta_profissional);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar orçamento';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarDetalhes();
  }, [orcamentoId, token]);

  // Fechar ao pressionar Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewPhotoUrl) {
          setPreviewPhotoUrl(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewPhotoUrl]);

  const handleSubmitResposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const valorNum = parseFloat(valorInput.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setSubmitError('Informe um valor numérico válido maior que zero.');
      return;
    }

    const descLimpa = respostaInput.trim();
    if (descLimpa.length < 5) {
      setSubmitError('O parecer técnico deve conter pelo menos 5 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await responderOrcamento(
        orcamentoId,
        {
          valor_estimado: valorNum,
          resposta_profissional: descLimpa,
        },
        token
      );
      setOrcamento(updated);
      setSubmitSuccess(true);
      if (onResponded) {
        onResponded();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar proposta.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-500">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Pendente de Resposta
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Respondido
          </span>
        );
      case 'recusado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-500">
            Recusado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rental-surface2 px-3 py-1 text-xs font-bold text-rental-muted">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-3xl border border-rental-border bg-rental-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo / Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rental-border bg-rental-surface2/40">
          <div className="flex items-center gap-3">
            <h3 className="text-base sm:text-lg font-black text-rental-ink tracking-tight">
              Orçamento #{orcamentoId}
            </h3>
            {orcamento && getStatusBadge(orcamento.status)}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-rental-muted hover:text-rental-ink hover:bg-rental-surface transition-colors"
            title="Fechar"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="h-6 w-48 bg-rental-surface2 rounded-xl animate-pulse" />
              <div className="h-24 bg-rental-surface2 rounded-2xl animate-pulse" />
              <div className="h-36 bg-rental-surface2 rounded-2xl animate-pulse" />
            </div>
          ) : error || !orcamento ? (
            <div className="py-8 text-center space-y-4">
              <AlertCircle className="mx-auto h-10 w-10 text-[var(--rs-error)]" />
              <p className="text-sm text-rental-muted">{error || 'Não foi possível carregar os dados.'}</p>
              <Button variant="secondary" size="sm" onClick={carregarDetalhes} leftIcon={<RefreshCw className="h-4 w-4" />}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {/* Informações do Cliente Solicitante */}
              <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-rental-muted">
                  Cliente Solicitante
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 text-rental-ink">
                    <User className="h-4 w-4 text-rental-primary shrink-0" />
                    <span className="font-semibold">{orcamento.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2 text-rental-ink">
                    <Mail className="h-4 w-4 text-rental-primary shrink-0" />
                    <span className="truncate">{orcamento.cliente_email}</span>
                  </div>
                  {orcamento.cliente_telefone && (
                    <div className="flex items-center gap-2 text-rental-ink">
                      <Phone className="h-4 w-4 text-rental-primary shrink-0" />
                      <span>{orcamento.cliente_telefone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-rental-muted">
                    <Clock className="h-4 w-4 text-rental-muted shrink-0" />
                    <span>
                      Solicitado em {new Date(orcamento.criado_em).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Descrição do Problema */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rental-muted">
                  Descrição do Problema / Serviço
                </span>
                <div className="rounded-2xl border border-rental-border bg-rental-surface p-4 text-sm text-rental-ink leading-relaxed whitespace-pre-wrap">
                  {orcamento.descricao}
                </div>
              </div>

              {/* Fotos Anexadas */}
              {orcamento.fotos && orcamento.fotos.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-muted flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-rental-primary" />
                    Fotos Anexadas ({orcamento.fotos.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {orcamento.fotos.map((foto) => {
                      const fotoUrl = obterFotoUrl(orcamento.id, foto.id);
                      return (
                        <div
                          key={foto.id}
                          onClick={() => setPreviewPhotoUrl(fotoUrl)}
                          className="group relative aspect-video rounded-xl border border-rental-border overflow-hidden bg-rental-surface2 cursor-pointer transition-transform hover:scale-[1.02]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fotoUrl}
                            alt={foto.nome_original}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="h-5 w-5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção de Resposta do Profissional */}
              <div className="pt-2 border-t border-rental-border">
                {orcamento.status === 'pendente' ? (
                  <form onSubmit={handleSubmitResposta} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-rental-ink">
                        Enviar Estimativa de Orçamento
                      </span>
                      <span className="text-xs text-rental-muted">
                        Resposta em tempo real para o cliente
                      </span>
                    </div>

                    {submitError && (
                      <div className="rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)] flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-rental-ink flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5 text-rental-primary" />
                        Valor Estimado (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={valorInput}
                        onChange={(e) => setValorInput(e.target.value)}
                        placeholder="Ex: 150.00"
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                      />
                      <p className="text-[11px] text-rental-muted">
                        Valor preliminar baseado na descrição e nas fotos antes da visita presencial.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-rental-ink">
                        Parecer Técnico e Condições *
                      </label>
                      <textarea
                        rows={3}
                        required
                        minLength={5}
                        maxLength={2000}
                        value={respostaInput}
                        onChange={(e) => setRespostaInput(e.target.value)}
                        placeholder="Ex: Valor cobre mão de obra e deslocamento. Materiais necessários serão cotados à parte."
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={onClose}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={isSubmitting}
                        leftIcon={<Send className="h-4 w-4" />}
                      >
                        {isSubmitting ? 'Enviando...' : 'Enviar Proposta'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-500 font-extrabold text-sm">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>Proposta Enviada com Sucesso</span>
                      </div>
                      {orcamento.valor_estimado && (
                        <span className="text-base font-black text-emerald-500">
                          R$ {orcamento.valor_estimado.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {orcamento.resposta_profissional && (
                      <div className="text-xs text-rental-ink/90 leading-relaxed bg-rental-surface/60 rounded-xl p-3 border border-rental-border/40">
                        <span className="font-bold block mb-1 text-rental-muted text-[11px]">
                          Seu Parecer Técnico:
                        </span>
                        {orcamento.resposta_profissional}
                      </div>
                    )}
                    {orcamento.respondido_em && (
                      <span className="text-[11px] text-rental-muted block">
                        Respondido em {new Date(orcamento.respondido_em).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox / Foto Ampliada */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 animate-fadeIn"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewPhotoUrl(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewPhotoUrl}
            alt="Foto ampliada do orçamento"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
