'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{
  toast: ToastData;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: {
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />,
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      titleColor: 'text-emerald-600 dark:text-emerald-400',
    },
    error: {
      icon: <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />,
      border: 'border-red-500/30',
      bg: 'bg-red-500/10',
      titleColor: 'text-red-600 dark:text-red-400',
    },
    info: {
      icon: <Info className="h-5 w-5 text-rental-primary shrink-0 mt-0.5" />,
      border: 'border-rental-primary/30',
      bg: 'bg-rental-primary/10',
      titleColor: 'text-rental-primary',
    },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto rounded-2xl p-4 border ${config.border} ${config.bg} bg-rental-surface shadow-lg text-rental-ink flex items-start gap-3 animate-fadeIn transition-all`}
    >
      {config.icon}
      <div className="flex-1 min-w-0">
        <h4 className={`text-xs font-bold ${config.titleColor}`}>{toast.title}</h4>
        {toast.message && (
          <p className="text-xs text-rental-muted mt-0.5 leading-relaxed break-words">
            {toast.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-rental-muted hover:text-rental-ink p-1 rounded-lg transition-colors shrink-0"
        aria-label="Fechar notificação"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
