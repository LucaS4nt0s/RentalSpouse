'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Professional } from '../../types/professional';
import { useDenuncias } from '../../hooks/useDenuncias';
import {
  DENUNCIA_MOTIVOS,
  DESCRICAO_MAX_CARACTERES,
  DESCRICAO_MIN_CARACTERES,
  DenunciaMotivo,
} from '../../types/denuncias';

export interface DenunciaModalProps {
  professional: Professional | null;
  onClose: () => void;
}

/**
 * Modal de denúncia acessível (focus trap + ESC) aberto a partir do card do
 * profissional no diretório (issue #68).
 *
 * Trata os estados obrigatórios de UI: carregamento/envio (`isSubmitting`),
 * erro (banner com retry), sucesso (confirmação) e os bloqueios de acesso
 * (não autenticado / não cliente / denúncia já em aberto).
 */
export function DenunciaModal({ professional, onClose }: DenunciaModalProps) {
  const {
    isAuthenticated,
    authLoading,
    ehCliente,
    isLoading,
    error,
    isSubmitting,
    submitError,
    successMessage,
    carregarDenuncias,
    temDenunciaEmAberto,
    submeterDenuncia,
    limparFeedback,
  } = useDenuncias();

  const [motivo, setMotivo] = useState<DenunciaMotivo>('servico_nao_realizado');
  const [descricao, setDescricao] = useState<string>('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reseta o formulário sempre que o alvo da denúncia muda
  useEffect(() => {
    setMotivo('servico_nao_realizado');
    setDescricao('');
    limparFeedback();
  }, [professional?.id, limparFeedback]);

  // Focus trap, trava de scroll e fechamento por ESC (acessibilidade)
  useEffect(() => {
    if (!professional) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const focusTimeout = setTimeout(() => {
      firstFieldRef.current?.focus();
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
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
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

  const descricaoLimpa = descricao.trim();
  const descricaoValida =
    descricaoLimpa.length >= DESCRICAO_MIN_CARACTERES &&
    descricaoLimpa.length <= DESCRICAO_MAX_CARACTERES;

  const jaDenunciado = temDenunciaEmAberto(professional.id);
  const podeEnviar =
    ehCliente && !jaDenunciado && descricaoValida && !isSubmitting && !successMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar) return;
    await submeterDenuncia({
      professional_id: professional.id,
      motivo,
      descricao: descricaoLimpa,
    });
  };

  const handleEnviarOutra = () => {
    setDescricao('');
    setMotivo('servico_nao_realizado');
    limparFeedback();
  };

  const renderCorpo = () => {
    // 1. Estado de carregamento da sessão
    if (authLoading) {
      return (
        <div className="space-y-3 py-6" aria-busy="true">
          <div className="h-6 w-40 rounded-xl bg-rental-surface2 animate-pulse" />
          <div className="h-20 rounded-2xl bg-rental-surface2 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-rental-surface2 animate-pulse" />
        </div>
      );
    }

    // 2. Não autenticado
    if (!isAuthenticated) {
      return (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-rental-ink">Entre para denunciar</h3>
            <p className="text-sm text-rental-muted leading-relaxed">
              A denúncia precisa ser vinculada a uma conta de cliente para que a equipe
              de moderação possa acompanhar o caso.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <Link href="/entrar">
              <button
                type="button"
                className="w-full rounded-xl bg-rental-primary px-4 py-2.5 text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-colors"
              >
                Entrar na Minha Conta
              </button>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-rental-border px-4 py-2.5 text-sm font-semibold text-rental-muted hover:text-rental-ink transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    // 3. Autenticado sem papel de cliente (profissional/admin)
    if (!ehCliente) {
      return (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-rental-ink">Recurso exclusivo de clientes</h3>
            <p className="text-sm text-rental-muted leading-relaxed">
              Apenas contas de cliente podem registrar denúncias contra prestadores de
              serviço. A análise das denúncias é feita pela equipe de administração.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-rental-border px-4 py-2.5 text-sm font-semibold text-rental-muted hover:text-rental-ink transition-colors"
          >
            Fechar
          </button>
        </div>
      );
    }

    // 4. Sucesso
    if (successMessage) {
      return (
        <div className="py-6 text-center space-y-3" role="status" aria-live="polite">
          <CheckCircle2 className="h-14 w-14 text-rental-success mx-auto animate-scaleCheck" />
          <h3 className="text-xl font-bold text-rental-ink">Denúncia registrada</h3>
          <p className="text-sm text-rental-muted leading-relaxed">
            Recebemos sua denúncia contra <strong>{professional.name}</strong>. A equipe
            de moderação vai analisar o relato e tomar as providências cabíveis.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleEnviarOutra}
              className="flex-1 rounded-xl border border-rental-border px-4 py-2.5 text-sm font-semibold text-rental-ink hover:border-rental-primary/40 transition-colors"
            >
              Enviar outra denúncia
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-rental-primary px-4 py-2.5 text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>
      );
    }

    // 5. Formulário
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-rental-muted leading-relaxed">
          Use este canal para relatar problemas reais com o serviço prestado. Denúncias
          falsas podem levar à suspensão da sua conta.
        </p>

        {/* Motivo (radiogroup acessível) */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-rental-ink mb-1.5">
            Motivo da denúncia
          </legend>
          <div className="space-y-1.5 max-h-56 overflow-y-auto futuristic-scrollbar pr-1">
            {DENUNCIA_MOTIVOS.map((opcao) => {
              const selecionado = motivo === opcao.value;
              return (
                <label
                  key={opcao.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${
                    selecionado
                      ? 'border-rental-primary/50 bg-rental-primary/5'
                      : 'border-rental-border hover:border-rental-primary/30'
                  }`}
                >
                  <input
                    ref={opcao.value === 'servico_nao_realizado' ? firstFieldRef : undefined}
                    type="radio"
                    name="denuncia-motivo"
                    value={opcao.value}
                    checked={selecionado}
                    onChange={() => setMotivo(opcao.value)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--rs-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs sm:text-sm font-semibold text-rental-ink">
                      {opcao.label}
                    </span>
                    <span className="block text-[11px] text-rental-muted leading-relaxed">
                      {opcao.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Relato */}
        <div>
          <label
            htmlFor="denuncia-descricao"
            className="block text-xs font-bold text-rental-ink mb-1.5"
          >
            Descreva o que aconteceu
          </label>
          <textarea
            id="denuncia-descricao"
            required
            rows={4}
            value={descricao}
            maxLength={DESCRICAO_MAX_CARACTERES}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Contratei o serviço para o dia 10, o profissional não compareceu e não devolveu o valor adiantado..."
            className="w-full rounded-2xl glass-input p-3 text-xs sm:text-sm placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 resize-none"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-rental-muted">
            <span>
              Mínimo de {DESCRICAO_MIN_CARACTERES} caracteres
            </span>
            <span>
              {descricaoLimpa.length}/{DESCRICAO_MAX_CARACTERES}
            </span>
          </div>
        </div>

        {/* Bloqueio: denúncia já em aberto */}
        {jaDenunciado && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Você já possui uma denúncia em aberto contra este profissional. Aguarde a
              análise da equipe antes de registrar outra.
            </span>
          </div>
        )}

        {/* Erro no envio (com retry pelo próprio botão Enviar) */}
        {submitError && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)] flex items-start gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Falha ao carregar as denúncias do cliente */}
        {error && (
          <div className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)] flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </span>
            <button
              type="button"
              onClick={carregarDenuncias}
              disabled={isLoading}
              className="shrink-0 inline-flex items-center gap-1 font-bold hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Tentar novamente
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!podeEnviar}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--rs-error)] px-5 py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Enviando denúncia...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Registrar Denúncia</span>
              </>
            )}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="denuncia-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto futuristic-scrollbar rounded-3xl glass-panel p-6 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors"
          aria-label="Fechar modal de denúncia"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--rs-error)]/10 text-[var(--rs-error)]">
            <Flag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="denuncia-modal-title" className="text-lg font-bold text-rental-ink">
              Denunciar Profissional
            </h2>
            <p className="text-xs text-rental-muted truncate">
              {professional.name}
              {professional.city ? ` • ${professional.city}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4">{renderCorpo()}</div>
      </div>
    </div>
  );
}
