'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  Star,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAvaliacao } from '../../services/avaliacoes';
import {
  AVALIACAO_COMENTARIO_MAX_CARACTERES,
  AVALIACAO_COMENTARIO_MIN_CARACTERES,
  AvaliacaoRead,
} from '../../types/avaliacoes';
import { StarRatingInput } from './StarRatingInput';

export interface AvaliarProfissionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  professionalId: number;
  professionalName: string;
  agendamentoId?: number | null;
  orcamentoId?: number | null;
  onSuccess?: (avaliacao: AvaliacaoRead) => void;
}

/**
 * Modal acessível para avaliação de serviços concluídos (issues #19 e #21).
 * Implementa foco trap, fechamento via Escape, tratamento de erro 409 (atendimento já avaliado)
 * e feedback visual imediato para o usuário.
 */
export const AvaliarProfissionalModal: React.FC<AvaliarProfissionalModalProps> = ({
  isOpen,
  onClose,
  professionalId,
  professionalName,
  agendamentoId,
  orcamentoId,
  onSuccess,
}) => {
  const { token, isAuthenticated } = useAuth();

  const [nota, setNota] = useState<number>(0);
  const [comentario, setComentario] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflictError, setIsConflictError] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [createdAvaliacao, setCreatedAvaliacao] = useState<AvaliacaoRead | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Armazena e restaura o foco do elemento que abriu o modal
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';

      // Reseta estado do formulário ao abrir
      setNota(0);
      setComentario('');
      setIsLoading(false);
      setError(null);
      setIsConflictError(false);
      setIsSuccess(false);
      setCreatedAvaliacao(null);

      // Foca no container do modal
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = '';
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Listener da tecla Escape e Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const comentarioLimpo = comentario.trim();
  const comentarioValido =
    comentarioLimpo.length === 0 ||
    (comentarioLimpo.length >= AVALIACAO_COMENTARIO_MIN_CARACTERES &&
      comentarioLimpo.length <= AVALIACAO_COMENTARIO_MAX_CARACTERES);

  const canSubmit =
    nota >= 1 &&
    nota <= 5 &&
    comentarioValido &&
    !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (!token && !isAuthenticated) {
      setError('Você precisa estar autenticado para enviar uma avaliação.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsConflictError(false);

    try {
      const novaAvaliacao = await createAvaliacao(token || '', {
        professional_id: professionalId,
        nota,
        comentario: comentarioLimpo || null,
        agendamento_id: agendamentoId || null,
        orcamento_id: orcamentoId || null,
      });

      setCreatedAvaliacao(novaAvaliacao);
      setIsSuccess(true);
      if (onSuccess) {
        onSuccess(novaAvaliacao);
      }
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status: number }).status
        : 0;
      const message = err instanceof Error ? err.message : 'Falha ao enviar avaliação.';

      if (status === 409 || message.toLowerCase().includes('já foi avaliado') || message.toLowerCase().includes('já registrou')) {
        setIsConflictError(true);
        setError('Este atendimento já foi avaliado anteriormente.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avaliar-modal-title"
      ref={modalRef}
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-rental-border bg-rental-surface text-rental-ink shadow-2xl overflow-hidden transition-all">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-rental-border/60 px-6 py-5 bg-rental-surface2/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
            </span>
            <div>
              <h2
                id="avaliar-modal-title"
                className="text-lg font-bold text-rental-ink leading-tight"
              >
                Avaliar Atendimento
              </h2>
              <p className="text-xs text-rental-muted flex items-center gap-1 mt-0.5">
                <User className="h-3 w-3" />
                <span>Profissional: {professionalName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-full p-2 text-rental-muted hover:text-rental-ink hover:bg-rental-surface transition-colors focus:outline-none focus:ring-2 focus:ring-rental-primary"
            title="Fechar (Esc)"
            aria-label="Fechar modal de avaliação"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4 animate-fadeIn">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-rental-ink">
                  Avaliação enviada com sucesso!
                </h3>
                <p className="text-xs text-rental-muted max-w-sm mx-auto leading-relaxed">
                  Obrigado por avaliar o serviço de <strong>{professionalName}</strong>. Sua nota ajuda outros clientes e valoriza bons profissionais na plataforma.
                </p>
              </div>

              {createdAvaliacao && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>Sua nota: {createdAvaliacao.nota} estrelas</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-6 py-2.5 text-xs font-bold text-[var(--rs-primary-text)] hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-rental-primary"
                >
                  Concluir
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Alerta de Erro ou Conflito */}
              {error && (
                <div
                  className={`flex items-start gap-3 rounded-2xl p-4 text-xs ${
                    isConflictError
                      ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  }`}
                  role="alert"
                >
                  {isConflictError ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
                  )}
                  <div className="space-y-0.5">
                    <span className="font-bold">
                      {isConflictError ? 'Atendimento já avaliado' : 'Erro ao avaliar'}
                    </span>
                    <p className="leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              {/* Seletor de Estrelas */}
              <div className="rounded-2xl border border-rental-border/70 bg-rental-surface2/30 p-5 text-center space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-rental-muted">
                  Como você avalia o serviço prestado? <span className="text-rose-500">*</span>
                </label>
                <div className="py-2">
                  <StarRatingInput
                    value={nota}
                    onChange={(n) => {
                      setNota(n);
                      if (error) setError(null);
                    }}
                    size="xl"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-[11px] text-rental-muted">
                  Clique ou navegue pelas setas do teclado para definir uma nota de 1 a 5 estrelas.
                </p>
              </div>

              {/* Comentário Opcional */}
              <div className="space-y-1.5">
                <label
                  htmlFor="comentario-input"
                  className="flex items-center justify-between text-xs font-bold text-rental-ink"
                >
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-rental-muted" />
                    Deixe um comentário (opcional)
                  </span>
                  <span
                    className={`text-[11px] ${
                      comentario.length > AVALIACAO_COMENTARIO_MAX_CARACTERES
                        ? 'text-rose-500 font-bold'
                        : 'text-rental-muted'
                    }`}
                  >
                    {comentario.length} / {AVALIACAO_COMENTARIO_MAX_CARACTERES}
                  </span>
                </label>

                <textarea
                  id="comentario-input"
                  rows={4}
                  maxLength={AVALIACAO_COMENTARIO_MAX_CARACTERES}
                  value={comentario}
                  onChange={(e) => {
                    setComentario(e.target.value);
                    if (error && !isConflictError) setError(null);
                  }}
                  disabled={isLoading}
                  placeholder="Conte para nós sobre a pontualidade, qualidade da execução, clareza do profissional e cuidados com o ambiente..."
                  className="w-full rounded-2xl border border-rental-border bg-rental-surface px-4 py-3 text-xs sm:text-sm text-rental-ink placeholder-rental-muted/60 focus:border-rental-primary focus:outline-none focus:ring-2 focus:ring-rental-primary/20 resize-none transition-all disabled:opacity-50"
                />

                {comentarioLimpo.length > 0 &&
                  comentarioLimpo.length < AVALIACAO_COMENTARIO_MIN_CARACTERES && (
                    <p className="text-[11px] text-rose-500">
                      O comentário deve conter pelo menos {AVALIACAO_COMENTARIO_MIN_CARACTERES} caracteres caso preenchido.
                    </p>
                  )}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-rental-border/60">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink hover:bg-rental-surface2/60 transition-colors focus:outline-none focus:ring-2 focus:ring-rental-primary"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-6 py-2.5 text-xs font-bold text-[var(--rs-primary-text)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-rental-primary shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enviando avaliação...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Publicar Avaliação</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
