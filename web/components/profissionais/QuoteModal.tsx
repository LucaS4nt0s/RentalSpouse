'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, Phone, Mail, Send } from 'lucide-react';
import { Professional } from '../../types/professional';

export interface QuoteModalProps {
  professional: Professional | null;
  onClose: () => void;
}

export function QuoteModal({ professional, onClose }: QuoteModalProps) {
  const [quoteMessage, setQuoteMessage] = useState<string>('');
  const [quoteSuccess, setQuoteSuccess] = useState<boolean>(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap e controle de teclado (Acessibilidade)
  useEffect(() => {
    if (!professional) return;

    // Salva o elemento com foco antes de abrir o modal
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    // Foca o primeiro elemento interativo
    const focusTimeout = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    // Trava scroll do body
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Gerencia Tab e Escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Devolve o foco para o elemento original
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [professional]);

  if (!professional) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteSuccess(true);
    setTimeout(() => {
      onClose();
      setQuoteSuccess(false);
      setQuoteMessage('');
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-3xl glass-panel p-6 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors"
          aria-label="Fechar modal de orçamento"
        >
          <X className="h-5 w-5" />
        </button>

        {quoteSuccess ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-rental-success mb-3 animate-scaleCheck" />
            <h3 className="text-xl font-bold text-rental-ink">Solicitação Enviada!</h3>
            <p className="mt-2 text-sm text-rental-muted">
              O profissional <strong>{professional.name}</strong> recebeu sua solicitação e entrará em contato em breve.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-base">
                {professional.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 id="quote-modal-title" className="text-lg font-bold text-rental-ink">
                  Solicitar Orçamento
                </h3>
                <p className="text-xs text-rental-muted">
                  Para {professional.name} • {professional.city || 'Atendimento local'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {professional.specialties.map((spec) => (
                <span
                  key={spec}
                  className="rounded-lg bg-rental-surface2 px-2.5 py-1 text-xs font-semibold text-rental-muted"
                >
                  {spec}
                </span>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="quote-message-input"
                  className="block text-xs font-bold text-rental-ink mb-1.5"
                >
                  Descreva o serviço necessário:
                </label>
                <textarea
                  id="quote-message-input"
                  ref={textareaRef}
                  required
                  rows={4}
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                  placeholder="Ex: Preciso trocar a fiação da sala e instalar 3 tomadas novas..."
                  className="w-full rounded-2xl glass-input p-3 text-xs sm:text-sm placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-rental-muted pt-2">
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-rental-primary" />
                  {professional.phone || 'Telefone verificado'}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-rental-primary" />
                  {professional.email}
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-all"
                >
                  <Send className="h-4 w-4" />
                  <span>Enviar Solicitação</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
