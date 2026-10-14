'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X, ArrowRight, Zap } from 'lucide-react';
import { Button } from '../ui/Button';

export interface ToastData {
  id: number;
  titulo: string;
  mensagem: string;
  referencia_id?: number | null;
}

interface NotificationToastProps {
  toast: ToastData | null;
  onClose: () => void;
  onViewQuote: (orcamentoId: number) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toast,
  onClose,
  onViewQuote,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!toast) return;

    setProgress(100);
    const duration = 8000; // 8 segundos de exibição
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-md rounded-2xl border border-rental-primary/40 bg-rental-surface p-4 shadow-2xl backdrop-blur-md transition-all duration-300 animate-fadeIn"
    >
      <div className="flex items-start gap-3.5">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)] shadow-sm">
          <Zap className="h-5 w-5 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rental-primary opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-rental-primary" />
          </span>
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold text-rental-ink tracking-tight truncate">
              {toast.titulo}
            </h4>
            <button
              type="button"
              onClick={onClose}
              className="text-rental-muted hover:text-rental-ink transition-colors p-1 -mr-1 -mt-1 rounded-lg"
              title="Fechar notificação"
              aria-label="Fechar notificação"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1 text-xs text-rental-muted line-clamp-2 leading-relaxed">
            {toast.mensagem}
          </p>

          {toast.referencia_id && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => onViewQuote(toast.referencia_id!)}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                className="text-xs py-1.5 px-3"
              >
                Ver Orçamento
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de progresso do auto-dismiss */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-rental-surface2">
        <div
          className="h-full bg-rental-primary transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
