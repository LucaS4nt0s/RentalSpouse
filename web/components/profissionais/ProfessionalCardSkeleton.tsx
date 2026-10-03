'use client';

import React from 'react';

export const ProfessionalCardSkeleton: React.FC = () => {
  return (
    <div
      className="flex flex-col justify-between rounded-2xl glass-panel p-5 animate-pulse"
      aria-hidden="true"
    >
      <div>
        {/* Cabeçalho: Avatar + Nome + Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Avatar circle */}
            <div className="h-12 w-12 rounded-2xl bg-rental-surface2 shrink-0" />

            <div className="space-y-2 min-w-0">
              {/* Nome */}
              <div className="h-4 w-32 rounded bg-rental-surface2" />
              {/* Localização e raio */}
              <div className="h-3 w-44 rounded bg-rental-surface2" />
            </div>
          </div>

          {/* Badge verificado */}
          <div className="h-5 w-16 rounded-full bg-rental-surface2 shrink-0" />
        </div>

        {/* Chips de Especialidades */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <div className="h-6 w-16 rounded-lg bg-rental-surface2" />
          <div className="h-6 w-20 rounded-lg bg-rental-surface2" />
          <div className="h-6 w-14 rounded-lg bg-rental-surface2" />
        </div>

        {/* Linhas de Biografia (3 linhas) */}
        <div className="mt-3 space-y-1.5">
          <div className="h-3 w-full rounded bg-rental-surface2" />
          <div className="h-3 w-11/12 rounded bg-rental-surface2" />
          <div className="h-3 w-4/6 rounded bg-rental-surface2" />
        </div>
      </div>

      {/* Botão de Ação */}
      <div className="mt-5 pt-3.5 border-t border-rental-border/60">
        <div className="h-10 w-full rounded-xl bg-rental-surface2" />
      </div>
    </div>
  );
};
