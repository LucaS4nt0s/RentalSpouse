'use client';

import React from 'react';
import { MapPin, X, RotateCcw, Radar, ArrowUpDown } from 'lucide-react';
import {
  DISTANCE_STEP_KM,
  MAX_DISTANCE_KM,
  MIN_DISTANCE_KM,
  RadiusFilterValue,
  SORT_ORDER_OPTIONS,
  SortOrderValue,
} from '../../lib/professionalsSearchQuery';

export interface FilterActionBarProps {
  city: string;
  onCityChange: (city: string) => void;
  radius: RadiusFilterValue;
  onRadiusChange: (radius: RadiusFilterValue) => void;
  orderBy: SortOrderValue;
  onOrderByChange: (orderBy: SortOrderValue) => void;
  resultsCount: number;
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
}

export const FilterActionBar: React.FC<FilterActionBarProps> = ({
  city,
  onCityChange,
  radius,
  onRadiusChange,
  orderBy,
  onOrderByChange,
  resultsCount,
  isLoading,
  hasActiveFilters,
  onClearAllFilters,
}) => {
  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 py-1">
      {/* Filtros Secundários: Cidade, Raio de Atendimento e Ordenação */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
        {/* Filtro de Cidade */}
        <div className="relative sm:max-w-xs flex-1">
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

        {/* Filtro de Distância Estilo Tinder */}
        <div className="sm:w-64 rounded-xl glass-input px-3 py-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-rental-muted">
              <Radar className="h-3.5 w-3.5 text-rental-primary shrink-0" />
              <span>Distância</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-rental-primary">
                {/^\d+$/.test(radius) ? `Até ${radius} km` : 'Qualquer'}
              </span>
              {radius && (
                <button
                  type="button"
                  onClick={() => onRadiusChange('')}
                  title="Remover limite de distância"
                  aria-label="Limpar filtro de distância"
                  className="text-rental-muted hover:text-rental-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min={MIN_DISTANCE_KM}
            max={MAX_DISTANCE_KM}
            step={DISTANCE_STEP_KM}
            value={/^\d+$/.test(radius) ? Number(radius) : MAX_DISTANCE_KM}
            onChange={(e) => onRadiusChange(e.target.value)}
            aria-label="Filtrar por distância máxima em km"
            className="w-full h-1.5 accent-[var(--rs-primary)] cursor-pointer"
          />
        </div>

        {/* Ordenação */}
        <div className="relative sm:w-48">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-rental-muted">
            <ArrowUpDown className="h-4 w-4 text-rental-primary" />
          </div>
          <select
            value={orderBy}
            onChange={(e) => onOrderByChange(e.target.value as SortOrderValue)}
            aria-label="Ordenar profissionais"
            className="w-full rounded-xl glass-input py-2 pl-9 pr-7 text-xs sm:text-sm text-rental-ink focus:outline-none focus:ring-2 focus:ring-rental-primary/40 cursor-pointer"
          >
            {SORT_ORDER_OPTIONS.map((option) => (
              <option key={option.value || 'relevance'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Contador e Ação de Limpeza */}
      <div className="flex items-center justify-between lg:justify-end gap-3 text-xs sm:text-sm shrink-0">
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
