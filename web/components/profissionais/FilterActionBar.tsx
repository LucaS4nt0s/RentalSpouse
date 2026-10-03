'use client';

import React from 'react';
import { MapPin, X, RotateCcw } from 'lucide-react';

export interface FilterActionBarProps {
  city: string;
  onCityChange: (city: string) => void;
  resultsCount: number;
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
}

export const FilterActionBar: React.FC<FilterActionBarProps> = ({
  city,
  onCityChange,
  resultsCount,
  isLoading,
  hasActiveFilters,
  onClearAllFilters,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2 border-y border-rental-border/60">
      {/* Filtro de Cidade */}
      <div className="flex items-center gap-2 max-w-xs">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-rental-muted">
            <MapPin className="h-4 w-4 text-rental-primary" />
          </div>
          <input
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="Filtrar por cidade..."
            aria-label="Filtrar por cidade"
            className="w-full rounded-xl glass-input py-2 pl-9 pr-8 text-xs sm:text-sm placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40"
          />
          {city && (
            <button
              type="button"
              onClick={() => onCityChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-rental-muted hover:text-rental-ink"
              title="Limpar cidade"
              aria-label="Limpar filtro de cidade"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contador e Ação de Limpeza */}
      <div className="flex items-center justify-between sm:justify-end gap-3 text-xs sm:text-sm">
        <span className="font-medium text-rental-muted">
          {isLoading ? (
            <span className="inline-block h-4 w-28 animate-pulse rounded bg-rental-surface2" />
          ) : (
            <>
              <strong className="text-rental-ink font-semibold">{resultsCount}</strong>{' '}
              {resultsCount === 1 ? 'profissional encontrado' : 'profissionais encontrados'}
            </>
          )}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAllFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rental-border bg-rental-surface px-2.5 py-1.5 text-xs font-semibold text-rental-muted hover:text-rental-primary hover:border-rental-primary/40 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>
    </div>
  );
};
