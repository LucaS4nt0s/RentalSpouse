'use client';

import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

export interface SearchErrorStateProps {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export const SearchErrorState: React.FC<SearchErrorStateProps> = ({
  message = 'Não foi possível carregar a lista de profissionais no momento. Verifique sua conexão com a internet.',
  onRetry,
  isRetrying = false,
}) => {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-3xl border border-rental-error/30 bg-rental-surface p-8 text-center shadow-panel animate-fadeIn"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-error/10 text-rental-error mb-4">
        <WifiOff className="h-7 w-7" />
      </div>

      <h3 className="text-lg font-bold text-rental-ink">
        Ops! Algo deu errado ao carregar os dados
      </h3>

      <p className="mt-2 text-sm text-rental-muted max-w-md leading-relaxed">
        {message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
        <span>{isRetrying ? 'Tentando novamente...' : 'Tentar Novamente'}</span>
      </button>
    </div>
  );
};
