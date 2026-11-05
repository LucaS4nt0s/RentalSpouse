'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarX, Loader2, X } from 'lucide-react';
import {
  Agendamento,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
} from '../../services/agenda';

export interface CancelarAgendamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  agendamento: Agendamento | null;
  nomeProfissional?: string;
  onConfirmar: (agendamentoId: number, motivo?: string) => Promise<boolean>;
}

const MOTIVO_MAX_CHARS = 500;

export function CancelarAgendamentoModal({
  isOpen,
  onClose,
  agendamento,
  nomeProfissional,
  onConfirmar,
}: CancelarAgendamentoModalProps) {
  const [motivo, setMotivo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Limpa estados ao abrir/trocar o agendamento
  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, agendamento?.id]);

  // Acessibilidade: Trava de scroll e foco
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimeout = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !agendamento) {
    return null;
  }

  const dataIso = extrairDataIso(agendamento.data_hora_inicio);
  const hIni = extrairHoraCurta(agendamento.data_hora_inicio);
  const hFim = extrairHoraCurta(agendamento.data_hora_fim);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const sucesso = await onConfirmar(
        agendamento.id,
        motivo.trim() ? motivo.trim() : undefined,
      );
      if (sucesso) {
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível cancelar o agendamento. Tente novamente.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancelar-modal-title"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-rental-border bg-rental-surface shadow-2xl transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rental-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <CalendarX className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="cancelar-modal-title"
                className="text-base font-bold text-rental-ink"
              >
                Cancelar agendamento
              </h2>
              <p className="text-xs text-rental-muted">
                Reserva #{agendamento.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar modal"
            className="rounded-lg p-1.5 text-rental-muted transition-colors hover:bg-rental-surface2 hover:text-rental-ink disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Card com resumo do agendamento */}
          <div className="rounded-xl border border-rental-border bg-rental-surface2/60 p-4 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-rental-muted">Profissional:</span>
              <span className="font-bold text-rental-ink">
                {nomeProfissional || `Profissional #${agendamento.professional_id}`}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-rental-muted">Data e Horário:</span>
              <span className="font-bold capitalize text-rental-ink">
                {formatarDataCompleta(dataIso)} • {hIni} às {hFim}
              </span>
            </div>
          </div>

          {/* Aviso de liberação de slot */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="leading-relaxed">
              Ao confirmar o cancelamento, este horário será imediatamente liberado
              para outros clientes na agenda do profissional.
            </p>
          </div>

          {/* Motivo do cancelamento (opcional) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label
                htmlFor="motivo-cancelamento"
                className="font-semibold text-rental-ink"
              >
                Motivo do cancelamento <span className="text-rental-muted font-normal">(opcional)</span>
              </label>
              <span
                className={`text-[11px] ${
                  motivo.length > MOTIVO_MAX_CHARS - 30
                    ? 'text-red-500 font-bold'
                    : 'text-rental-muted'
                }`}
              >
                {motivo.length}/{MOTIVO_MAX_CHARS}
              </span>
            </div>
            <textarea
              id="motivo-cancelamento"
              ref={textareaRef}
              rows={3}
              maxLength={MOTIVO_MAX_CHARS}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Tive um imprevisto de trabalho e não poderei receber o profissional..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-rental-border bg-rental-bg px-3.5 py-2.5 text-xs text-rental-ink placeholder:text-rental-muted focus:border-rental-primary focus:outline-none focus:ring-1 focus:ring-rental-primary disabled:opacity-60"
            />
          </div>

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3.5 text-xs text-[var(--rs-error)]">
              {errorMessage}
            </div>
          )}

          {/* Footer com botões de ação */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-rental-border px-4 py-2 text-xs font-semibold text-rental-ink transition-colors hover:bg-rental-surface2 disabled:opacity-50"
            >
              Manter agendamento
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Cancelando...</span>
                </>
              ) : (
                <span>Confirmar cancelamento</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
