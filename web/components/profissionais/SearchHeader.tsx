'use client';

import React from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export interface SearchHeaderProps {
  query: string;
  onQueryChange: (val: string) => void;
  isLoading?: boolean;
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  query,
  onQueryChange,
  isLoading = false,
}) => {
  return (
    <div className="w-full text-center sm:text-left">
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-rental-ink">
          Encontre Profissionais Qualificados
        </h1>
        <p className="mt-2 text-sm sm:text-base text-rental-muted leading-relaxed">
          Eletricistas, encanadores, montadores e mais profissionais verificados para o seu lar.
        </p>
      </div>

      <div className="mt-6 relative w-full max-w-2xl">
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-rental-muted">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-rental-primary" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nome, especialidade ou termo..."
            aria-label="Buscar profissionais por especialidade ou nome"
            className="w-full rounded-2xl glass-input py-3 pl-11 pr-10 text-sm sm:text-base placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 shadow-sm"
          />

          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-rental-muted hover:text-rental-ink transition-colors"
              title="Limpar busca"
              aria-label="Limpar campo de busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
