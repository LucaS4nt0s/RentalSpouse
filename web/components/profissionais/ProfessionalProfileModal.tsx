'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Flag,
  MapPin,
  MessageSquare,
  Radar,
  RefreshCw,
  ShieldCheck,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import { Professional } from '../../types/professional';
import {
  AVALIACAO_NOTAS,
  ProfissionalAvaliacoesResumo,
  calcularPercentualEstrela,
  formatarMediaNotas,
  obterContagemPorEstrela,
} from '../../types/avaliacoes';
import { useAvaliacoesProfissional } from '../../hooks/useAvaliacoesProfissional';
import { AvaliarProfissionalModal } from '../avaliacoes/AvaliarProfissionalModal';
import { acquireBodyScrollLock } from '../../lib/scrollLock';

export interface ProfessionalProfileModalProps {
  professional: Professional | null;
  onClose: () => void;
  onRequestQuote?: (professional: Professional) => void;
  onReportProfessional?: (professional: Professional) => void;
  onSpecialtyClick?: (specialty: string) => void;
  onResumoCarregado?: (resumo: ProfissionalAvaliacoesResumo) => void;
}

function getInitials(name: string): string {
  if (!name) return 'RS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatReviewDate(isoDate: string): string {
  try {
    const data = new Date(isoDate);
    if (Number.isNaN(data.getTime())) return isoDate;
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function RatingStars({ nota }: { nota: number }) {
  const rounded = Math.round(nota);
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`Nota ${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= rounded ? 'fill-amber-400 text-amber-400' : 'text-rental-border'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Modal de perfil completo do profissional (issue #96).
 * Exibe nome completo, selo de verificado, localização e raio de atendimento,
 * biografia integral, todas as especialidades, reputação detalhada com comentários
 * verificados e ações diretas (Agendar Horário, Solicitar Orçamento, Avaliar e Denunciar).
 */
export function ProfessionalProfileModal({
  professional,
  onClose,
  onRequestQuote,
  onReportProfessional,
  onSpecialtyClick,
  onResumoCarregado,
}: ProfessionalProfileModalProps) {
  const {
    resumo,
    items,
    isLoading,
    isRetrying,
    isLoadingMore,
    hasMore,
    error,
    isEmpty,
    carregarMais,
    retry,
  } = useAvaliacoesProfissional({
    professionalId: professional?.id ?? null,
    pageSize: 5,
    onResumoCarregado,
  });

  const [isAvaliarOpen, setIsAvaliarOpen] = useState<boolean>(false);
  const isAvaliarOpenRef = useRef<boolean>(false);

  useEffect(() => {
    isAvaliarOpenRef.current = isAvaliarOpen;
  }, [isAvaliarOpen]);

  useEffect(() => {
    if (!professional) {
      setIsAvaliarOpen(false);
    }
  }, [professional]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!professional) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusTimeout = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const releaseScrollLock = acquireBodyScrollLock();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAvaliarOpenRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimeout);
      releaseScrollLock();
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [professional]);

  if (!professional) return null;

  const locationText = [
    professional.city,
    professional.state ? professional.state.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  const totalAvaliacoes = resumo?.total_avaliacoes ?? professional.reviews_count ?? 0;
  const mediaNotas = resumo?.media_notas ?? professional.average_rating ?? 0;
  const specialties = professional.specialties || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perfil-profissional-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto futuristic-scrollbar rounded-3xl glass-panel p-6 shadow-2xl relative space-y-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors"
          aria-label="Fechar perfil do profissional"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Cabeçalho do Perfil */}
        <div className="flex items-start gap-4 pr-8">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-extrabold text-xl">
            {getInitials(professional.name)}
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="perfil-profissional-modal-title"
                className="text-xl font-extrabold text-rental-ink leading-tight"
              >
                {professional.name}
              </h2>
              {professional.approval_status === 'approved' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-rental-success/10 px-2.5 py-0.5 text-xs font-semibold text-rental-success"
                  title="Profissional Verificado pelo RentalSpouse"
                >
                  <span>Verificado</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-rental-muted">
              {locationText && (
                <span className="inline-flex items-center gap-1.5">
                  <span>{locationText}</span>
                </span>
              )}
              {typeof professional.distance_km === 'number' && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-rental-primary">
                  <span>
                    {professional.distance_km < 1
                      ? 'A menos de 1 km de você'
                      : `A ${professional.distance_km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km de você`}
                  </span>
                </span>
              )}
              {typeof professional.service_radius_km === 'number' && (
                <span className="inline-flex items-center gap-1.5">
                  <span>Raio de atendimento: {Math.round(professional.service_radius_km)} km</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Biografia Completa */}
        <section aria-label="Sobre o profissional" className="space-y-2">
          <h3 className="text-xs font-bold text-rental-muted">
            Sobre o profissional
          </h3>
          <div className="rounded-2xl border border-rental-border bg-rental-surface2/40 p-4">
            <p className="text-xs sm:text-sm text-rental-ink leading-relaxed whitespace-pre-line">
              {professional.bio || 'Profissional qualificado disponível para serviços residenciais.'}
            </p>
          </div>
        </section>

        {/* Todas as Especialidades e Qualificações */}
        <section aria-label="Especialidades e qualificações" className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rental-muted">
            <Briefcase className="h-3.5 w-3.5 text-rental-primary" />
            <h3>Especialidades e Qualificações ({specialties.length})</h3>
          </div>
          {specialties.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {specialties.map((spec) => (
                <button
                  key={spec}
                  type="button"
                  onClick={() => {
                    if (onSpecialtyClick) {
                      onSpecialtyClick(spec);
                      onClose();
                    }
                  }}
                  className="rounded-xl border border-rental-border bg-rental-surface2 px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/50 hover:text-rental-primary"
                >
                  {spec}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-rental-muted">Nenhuma especialidade informada.</p>
          )}
        </section>

        {/* Resumo de Reputação e Avaliações */}
        <section aria-label="Reputação e avaliações" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-rental-muted">
              Reputação e Avaliações
            </h3>
            <button
              type="button"
              onClick={() => setIsAvaliarOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
              <span>Avaliar Profissional</span>
            </button>
          </div>

          {isLoading && !resumo ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-28 w-full rounded-2xl bg-rental-surface2 animate-pulse" />
              <div className="h-20 w-full rounded-2xl bg-rental-surface2 animate-pulse" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-4 text-center space-y-2.5"
            >
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--rs-error)]">
                <span>Não foi possível carregar as avaliações</span>
              </div>
              <p className="text-xs text-rental-muted">{error}</p>
              <button
                type="button"
                onClick={retry}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rental-primary px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Tentando novamente...' : 'Tentar novamente'}</span>
              </button>
            </div>
          ) : isEmpty ? (
            <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-5 text-center space-y-1.5">
              <p className="text-xs sm:text-sm font-semibold text-rental-ink">
                Ainda sem avaliações registradas
              </p>
              <p className="text-xs text-rental-muted">
                Após contratar e concluir um atendimento com {professional.name}, você poderá publicar a primeira avaliação.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resumo Numérico + Distribuição 5 -> 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 rounded-2xl border border-rental-border bg-rental-surface2/40 p-4">
                <div className="sm:col-span-4 flex flex-col items-center justify-center text-center sm:border-r sm:border-rental-border sm:pr-4">
                  <span className="text-3xl font-extrabold text-rental-ink">
                    {formatarMediaNotas(mediaNotas)}
                  </span>
                  <div className="mt-1">
                    <RatingStars nota={mediaNotas} />
                  </div>
                  <span className="mt-1 text-xs font-medium text-rental-muted">
                    {totalAvaliacoes}{' '}
                    {totalAvaliacoes === 1 ? 'avaliação verificada' : 'avaliações verificadas'}
                  </span>
                </div>

                <div className="sm:col-span-8 flex flex-col justify-center space-y-1.5">
                  {AVALIACAO_NOTAS.map((estrela) => {
                    const qtd = obterContagemPorEstrela(resumo?.distribuicao, estrela);
                    const pct = calcularPercentualEstrela(
                      resumo?.distribuicao,
                      totalAvaliacoes,
                      estrela,
                    );
                    return (
                      <div key={estrela} className="flex items-center gap-2 text-xs text-rental-muted">
                        <span className="inline-flex w-9 items-center justify-end gap-0.5 font-semibold text-rental-ink">
                          <span>{estrela}</span>
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-rental-border/50">
                          <div
                            className="h-full rounded-full bg-amber-400 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[11px]">{qtd}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lista de Comentários Verificados */}
              <div className="space-y-2.5">
                {items.map((avaliacao) => (
                  <article
                    key={avaliacao.id}
                    className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-rental-ink">
                            {avaliacao.cliente_nome}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rental-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-rental-success">
                            <span>Verificado</span>
                          </span>
                        </div>
                        <div className="mt-0.5">
                          <RatingStars nota={avaliacao.nota} />
                        </div>
                      </div>
                      <time
                        dateTime={avaliacao.created_at}
                        className="text-[11px] text-rental-muted shrink-0"
                      >
                        {formatReviewDate(avaliacao.created_at)}
                      </time>
                    </div>
                    {avaliacao.comentario ? (
                      <p className="mt-2 text-xs text-rental-ink/90 leading-relaxed whitespace-pre-line">
                        {avaliacao.comentario}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs italic text-rental-muted">
                        Avaliação de {avaliacao.nota}{' '}
                        {avaliacao.nota === 1 ? 'estrela' : 'estrelas'} sem comentário escrito.
                      </p>
                    )}
                  </article>
                ))}

                {hasMore && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={carregarMais}
                      disabled={isLoadingMore}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border bg-rental-surface px-4 py-2 text-xs font-bold text-rental-ink hover:border-rental-primary/40 disabled:opacity-50"
                    >
                      {isLoadingMore ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Carregando mais...</span>
                        </>
                      ) : (
                        <span>Carregar mais avaliações</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Botões de Ação Direta */}
        <div className="pt-4 border-t border-rental-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {onReportProfessional && (
              <button
                type="button"
                onClick={() => {
                  const target = professional;
                  onClose();
                  onReportProfessional(target);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rental-border px-3.5 py-2.5 text-xs font-semibold text-rental-muted hover:border-[var(--rs-error)]/50 hover:text-[var(--rs-error)] transition-colors"
              >
                <Flag className="h-4 w-4" />
                <span>Denunciar</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Link
              href={`/profissionais/${professional.id}/agendar`}
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rental-primary/40 bg-rental-primary/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-rental-primary transition-all hover:bg-rental-primary hover:text-white"
            >
              <span>Agendar Horário</span>
            </Link>

            {onRequestQuote && (
              <button
                type="button"
                onClick={() => {
                  const target = professional;
                  onClose();
                  onRequestQuote(target);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] active:scale-[0.98]"
              >
                <span>Solicitar Orçamento</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Interativo de Avaliação sobreposto com lock de scroll coordenado */}
      {isAvaliarOpen && (
        <AvaliarProfissionalModal
          isOpen={isAvaliarOpen}
          onClose={() => setIsAvaliarOpen(false)}
          professionalId={professional.id}
          professionalName={professional.name}
          onSuccess={() => {
            retry();
          }}
        />
      )}
    </div>
  );
}
