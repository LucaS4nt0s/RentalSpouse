'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Chips dos filtros aplicados (visibilidade do estado do sistema):
 * o usuário vê o que está filtrando e remove cada filtro com um clique,
 * sem precisar "limpar tudo".
 */
export const ActiveFilterChips: React.FC<{ filters: ActiveFilter[] }> = ({ filters }) => {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
      <span className="text-xs font-semibold text-rental-muted">Filtrando por:</span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          aria-label={`Remover filtro ${f.label}`}
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-rental-primary/30 bg-rental-primary/10 pl-3 pr-2 text-xs font-semibold text-rental-primary transition-colors hover:bg-rental-primary/20"
        >
          {f.label}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};
