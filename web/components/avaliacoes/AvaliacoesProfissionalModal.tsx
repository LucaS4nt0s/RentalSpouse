'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  MessageSquare,
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
import { AvaliarProfissionalModal } from './AvaliarProfissionalModal';

export interface AvaliacoesProfissionalModalProps {
  professional: Professional | null;
  onClose: () => void;
  onResumoCarregado?: (resumo: ProfissionalAvaliacoesResumo) => void;
  onRequestQuote?: (professional: Professional) => void;
}

function formatarDataAvaliacao(isoDate: string): string {
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

function obterIniciaisCliente(nome: string): string {
  if (!nome || !nome.trim()) return 'CL';
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function EstrelasVisuais({
  nota,
  tamanho = 'sm',
}: {
  nota: number;
  tamanho?: 'sm' | 'md';
}) {
  const iconClass = tamanho === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const notaArredondada = Math.round(nota);

  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`Nota ${nota} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((estrela) => {
        const preenchida = estrela <= notaArredondada;
        return (
          <Star
            key={estrela}
            className={`${iconClass} ${
              preenchida
                ? 'fill-amber-400 text-amber-400'
                : 'text-rental-border'
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * Modal de visualização pública da avaliação média, distribuição de estrelas
 * e comentários de clientes no perfil do profissional (issue #21).
 */
export function AvaliacoesProfissionalModal({
  professional,
  onClose,
  onResumoCarregado,
  onRequestQuote,
}: AvaliacoesProfissionalModalProps) {
  const {
    resumo,
    items,
    filtroNota,
    setFiltroNota,
    isLoading,
    isRetrying,
    isLoadingMore,
    hasMore,
    error,
    isEmpty,
    isFilterEmpty,
    carregarMais,
    retry,
  } = useAvaliacoesProfissional({
    professionalId: professional?.id ?? null,
    pageSize: 10,
    onResumoCarregado,
  });

  const [isAvaliarOpen, setIsAvaliarOpen] = useState<boolean>(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap, bloqueio de scroll e fechamento via ESC
  useEffect(() => {
    if (!professional) return;

    previouslyFocusedElementRef.current =
      document.activeElement as HTMLElement;

    const focusTimeout = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements =
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [professional]);

  if (!professional) return null;

  const totalAvaliacoes = resumo?.total_avaliacoes ?? 0;
  const mediaNotas = resumo?.media_notas ?? 0;

  const renderConteudo = () => {
    // Estado 1: Carregamento inicial (Skeleton sem CLS)
    if (isLoading && !resumo) {
      return (
        <div
          className="space-y-4 py-3"
          aria-busy="true"
          aria-label="Carregando avaliações do profissional"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-rental-border bg-rental-surface2/50 p-4">
            <div className="flex flex-col items-center justify-center space-y-2 py-2">
              <div className="h-10 w-16 rounded-xl bg-rental-surface2 animate-pulse" />
              <div className="h-4 w-24 rounded-lg bg-rental-surface2 animate-pulse" />
              <div className="h-3 w-20 rounded-lg bg-rental-surface2 animate-pulse" />
            </div>
            <div className="sm:col-span-2 space-y-2.5 flex flex-col justify-center">
              {[5, 4, 3, 2, 1].map((n) => (
                <div
                  key={n}
                  className="h-3.5 w-full rounded-lg bg-rental-surface2 animate-pulse"
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 rounded-lg bg-rental-surface2 animate-pulse" />
                  <div className="h-3.5 w-20 rounded-lg bg-rental-surface2 animate-pulse" />
                </div>
                <div className="h-12 w-full rounded-xl bg-rental-surface2 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Estado 2: Erro na comunicação HTTP com botão de Retry
    if (error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-6 text-center space-y-4 my-2"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rs-error)]/15 text-[var(--rs-error)]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-rental-ink">
              Não foi possível carregar as avaliações
            </h3>
            <p className="text-xs text-rental-muted leading-relaxed max-w-md mx-auto">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-4 py-2.5 text-xs font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`}
            />
            <span>{isRetrying ? 'Tentando novamente...' : 'Tentar novamente'}</span>
          </button>
        </div>
      );
    }

    // Estado 3a: Empty State (Profissional ainda não recebeu nenhuma avaliação)
    if (isEmpty) {
      return (
        <div className="rounded-2xl border border-rental-border bg-rental-surface2/40 p-8 text-center space-y-3 my-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <Star className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-rental-ink">
            Ainda sem avaliações registradas
          </h3>
          <p className="text-xs sm:text-sm text-rental-muted max-w-md mx-auto leading-relaxed">
            <strong>{professional.name}</strong> é verificado na plataforma, mas
            ainda não recebeu comentários de outros clientes. Após contratar um
            serviço, você poderá deixar a primeira avaliação!
          </p>
        </div>
      );
    }

    // Estado 3b: Sucesso com dados de reputação e lista de comentários
    return (
      <div className="space-y-5">
        {/* Card consolidado de Nota Média + Distribuição de 1 a 5 estrelas */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 rounded-2xl border border-rental-border bg-rental-surface2/40 p-4">
          {/* Coluna Esquerda: Nota Média em destaque */}
          <div className="sm:col-span-4 flex flex-col items-center justify-center text-center sm:border-r sm:border-rental-border sm:pr-4 py-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-rental-ink tracking-tight">
              {formatarMediaNotas(mediaNotas)}
            </span>
            <div className="mt-1.5">
              <EstrelasVisuais nota={mediaNotas} tamanho="md" />
            </div>
            <span className="mt-1.5 text-xs font-semibold text-rental-muted">
              {totalAvaliacoes}{' '}
              {totalAvaliacoes === 1 ? 'avaliação verificada' : 'avaliações verificadas'}
            </span>
          </div>

          {/* Coluna Direita: Barras clicáveis de distribuição 5 -> 1 estrelas */}
          <div
            className="sm:col-span-8 flex flex-col justify-center space-y-1.5"
            aria-label="Distribuição de notas por estrelas"
          >
            {AVALIACAO_NOTAS.map((estrela) => {
              const qtd = obterContagemPorEstrela(resumo?.distribuicao, estrela);
              const percentual = calcularPercentualEstrela(
                resumo?.distribuicao,
                totalAvaliacoes,
                estrela,
              );
              const selecionado = filtroNota === estrela;

              return (
                <button
                  key={estrela}
                  type="button"
                  onClick={() => setFiltroNota(estrela)}
                  aria-pressed={selecionado}
                  title={`Filtrar comentários com ${estrela} estrela(s) (${qtd})`}
                  className={`group flex w-full items-center gap-2.5 rounded-xl px-2 py-1 text-xs transition-colors ${
                    selecionado
                      ? 'bg-rental-primary/15 text-rental-primary font-bold'
                      : 'hover:bg-rental-surface2 text-rental-muted'
                  }`}
                >
                  <span className="inline-flex w-10 shrink-0 items-center justify-end gap-1 font-semibold text-rental-ink">
                    <span>{estrela}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>

                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-rental-border/50">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${percentual}%` }}
                    />
                  </div>

                  <span className="w-10 shrink-0 text-right text-[11px] font-medium">
                    {qtd}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de Chips de Filtro por Estrelas */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filtrar comentários por quantidade de estrelas"
        >
          <button
            type="button"
            onClick={() => setFiltroNota(null)}
            aria-pressed={filtroNota === null}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              filtroNota === null
                ? 'bg-rental-primary text-white shadow-sm'
                : 'border border-rental-border bg-rental-surface2 text-rental-muted hover:border-rental-primary/40 hover:text-rental-ink'
            }`}
          >
            Todas ({totalAvaliacoes})
          </button>

          {AVALIACAO_NOTAS.map((estrela) => {
            const qtd = obterContagemPorEstrela(resumo?.distribuicao, estrela);
            const ativo = filtroNota === estrela;
            return (
              <button
                key={estrela}
                type="button"
                onClick={() => setFiltroNota(estrela)}
                aria-pressed={ativo}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  ativo
                    ? 'bg-rental-primary text-white shadow-sm'
                    : 'border border-rental-border bg-rental-surface2 text-rental-muted hover:border-rental-primary/40 hover:text-rental-ink'
                }`}
              >
                <span>{estrela}</span>
                <Star
                  className={`h-3 w-3 ${
                    ativo
                      ? 'fill-white text-white'
                      : 'fill-amber-400 text-amber-400'
                  }`}
                />
                <span className="opacity-80">({qtd})</span>
              </button>
            );
          })}
        </div>

        {/* Lista de Comentários ou Filtro sem Resultados */}
        {isLoading ? (
          <div className="space-y-3 py-2" aria-busy="true">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 w-full rounded-2xl bg-rental-surface2 animate-pulse"
              />
            ))}
          </div>
        ) : isFilterEmpty ? (
          <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-6 text-center space-y-2.5">
            <p className="text-xs sm:text-sm font-semibold text-rental-ink">
              Nenhuma avaliação com {filtroNota}{' '}
              {filtroNota === 1 ? 'estrela' : 'estrelas'} encontrada.
            </p>
            <button
              type="button"
              onClick={() => setFiltroNota(null)}
              className="text-xs font-bold text-rental-primary hover:underline"
            >
              Mostrar todas as {totalAvaliacoes} avaliações →
            </button>
          </div>
        ) : (
          <div className="space-y-3" aria-label="Lista de avaliações de clientes">
            {items.map((avaliacao) => (
              <article
                key={avaliacao.id}
                className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 transition-colors hover:border-rental-primary/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rental-primary/10 text-xs font-bold text-rental-primary">
                      {obterIniciaisCliente(avaliacao.cliente_nome)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-bold text-rental-ink">
                          {avaliacao.cliente_nome}
                        </span>
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-rental-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-rental-success"
                          title="Cliente com atendimento verificado na plataforma"
                        >
                          <UserCheck className="h-2.5 w-2.5" />
                          <span>Cliente</span>
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <EstrelasVisuais nota={avaliacao.nota} tamanho="sm" />
                      </div>
                    </div>
                  </div>

                  <time
                    dateTime={avaliacao.created_at}
                    className="inline-flex items-center gap-1 text-[11px] text-rental-muted shrink-0"
                  >
                    <Calendar className="h-3 w-3" />
                    <span>{formatarDataAvaliacao(avaliacao.created_at)}</span>
                  </time>
                </div>

                {avaliacao.comentario ? (
                  <p className="mt-3 text-xs sm:text-sm text-rental-ink/90 leading-relaxed whitespace-pre-line">
                    {avaliacao.comentario}
                  </p>
                ) : (
                  <p className="mt-2.5 text-xs italic text-rental-muted">
                    Cliente avaliou com {avaliacao.nota}{' '}
                    {avaliacao.nota === 1 ? 'estrela' : 'estrelas'} sem comentário escrito.
                  </p>
                )}
              </article>
            ))}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={carregarMais}
                  disabled={isLoadingMore}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-4 py-2 text-xs font-bold text-rental-ink transition-all hover:border-rental-primary/40 disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Carregando mais...</span>
                    </>
                  ) : (
                    <span>Carregar mais comentários</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avaliacoes-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto futuristic-scrollbar rounded-3xl glass-panel p-6 shadow-2xl relative"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors"
          aria-label="Fechar modal de avaliações"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Cabeçalho do Modal */}
        <div className="flex items-center gap-3 pr-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="avaliacoes-modal-title"
                className="text-lg font-bold text-rental-ink"
              >
                Avaliações e Comentários
              </h2>
              {professional.approval_status === 'approved' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rental-success/10 px-2 py-0.5 text-[11px] font-semibold text-rental-success">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Verificado</span>
                </span>
              )}
            </div>
            <p className="text-xs text-rental-muted truncate">
              {professional.name}
              {professional.city ? ` • ${professional.city}` : ''}
              {professional.state ? ` - ${professional.state.toUpperCase()}` : ''}
            </p>
          </div>
        </div>

        {/* Corpo dinâmico (Loading / Error / Empty / Lista) */}
        <div className="mt-5">{renderConteudo()}</div>

        {/* Rodapé com atalho para contratar ou fechar */}
        <div className="mt-6 pt-4 border-t border-rental-border flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={() => setIsAvaliarOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            <span>Avaliar Profissional</span>
          </button>

          {onRequestQuote && (
            <button
              type="button"
              onClick={() => {
                const alvo = professional;
                onClose();
                onRequestQuote(alvo);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-4 py-2.5 text-xs font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] active:scale-[0.98]"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Solicitar Orçamento com {professional.name.split(' ')[0]}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Interativo para Avaliação (issue #19) */}
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
