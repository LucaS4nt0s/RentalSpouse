'use client';

import React from 'react';
import { SearchX, RotateCcw, Sparkles } from 'lucide-react';

export interface SearchEmptyStateProps {
  onClearFilters: () => void;
  onSelectSuggestedCategory?: (category: string) => void;
}

export const SearchEmptyState: React.FC<SearchEmptyStateProps> = ({
  onClearFilters,
  onSelectSuggestedCategory,
}) => {
  const suggestions = ['Elétrica', 'Hidráulica', 'Pintura', 'Montagem de Móveis'];

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-rental-border bg-rental-surface/60 px-6 py-16 text-center animate-fadeIn">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rental-surface2 text-rental-muted mb-4 shadow-inner">
        <SearchX className="h-8 w-8 text-rental-muted" />
      </div>

      <h3 className="text-xl font-bold text-rental-ink max-w-md">
        Nenhum profissional encontrado para os filtros selecionados
      </h3>

      <p className="mt-2 text-sm text-rental-muted max-w-md leading-relaxed">
        Tente buscar por outro termo, selecionar outra especialidade ou remover o filtro de cidade para expandir o raio de busca.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-all"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Limpar todos os filtros</span>
        </button>
      </div>

      {onSelectSuggestedCategory && (
        <div className="mt-8 pt-3 flex flex-col items-center">
          <span className="text-xs font-semibold text-rental-muted flex items-center gap-1.5 mb-2.5">
            <Sparkles className="h-3.5 w-3.5 text-rental-primary" />
            Ou tente uma das categorias mais populares:
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectSuggestedCategory(cat)}
                className="rounded-lg bg-rental-surface2 px-3 py-1.5 text-xs font-semibold text-rental-muted hover:text-rental-primary hover:border-rental-primary/40 border border-rental-border transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
