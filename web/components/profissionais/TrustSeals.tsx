'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { consultarAgendaProfissional } from '../../services/agenda';

/**
 * Selos de confiança dos cards de profissionais (#114 · Ideia 4.3).
 * Mostram, antes do clique, as informações que mais pesam na decisão:
 * documentação conferida e dias com horário livre.
 */

/** Selo textual "Verificado" — legível sem depender de tooltip ou de ícone isolado. */
export const VerifiedBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full bg-rental-success/10 px-2 py-0.5 text-[11px] font-bold text-rental-success ${className}`}
    title="Documento de identidade e comprovante de residência conferidos pela moderação do RentalSpouse"
  >
    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
    Verificado
  </span>
);

// Rótulos na ordem de `datetime.weekday()` do backend: 0 = segunda ... 6 = domingo.
const WEEKDAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Converte `YYYY-MM-DD` no índice de dia da semana com segunda = 0. */
const mondayIndex = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
};

type RulerState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; openDays: boolean[] };

/**
 * Mini-régua semanal (S T Q Q S S D): dias com horário livre na agenda pública
 * do profissional nos próximos 7 dias (`GET /api/professionals/{id}/agenda`).
 */
export const WeeklyRuler: React.FC<{ professionalId: number; className?: string }> = ({
  professionalId,
  className = '',
}) => {
  const [state, setState] = useState<RulerState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 6);

    consultarAgendaProfissional(professionalId, toIsoDate(start), toIsoDate(end))
      .then((dias) => {
        if (!active) return;
        const openDays = Array(7).fill(false) as boolean[];
        dias.forEach((dia) => {
          if (dia.slots && dia.slots.length > 0) openDays[mondayIndex(dia.data)] = true;
        });
        setState({ status: 'success', openDays });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [professionalId, attempt]);

  if (state.status === 'error') {
    return (
      <button
        type="button"
        onClick={() => setAttempt((n) => n + 1)}
        className={`text-[11px] font-semibold text-rental-muted underline-offset-2 hover:text-rental-primary hover:underline ${className}`}
      >
        Agenda indisponível · tentar novamente
      </button>
    );
  }

  const openDays = state.status === 'success' ? state.openDays : null;
  const openCount = openDays ? openDays.filter(Boolean).length : 0;
  const summary = openDays
    ? openCount === 0
      ? 'Sem horários livres nos próximos 7 dias'
      : `Horários livres na ${WEEKDAY_NAMES.filter((_, i) => openDays[i]).join(', ')}`
    : 'Carregando agenda da semana';

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-[11px] font-semibold text-rental-muted">
        {state.status === 'loading'
          ? 'Agenda da semana'
          : openCount === 0
          ? 'Sem horário esta semana'
          : `${openCount} ${openCount === 1 ? 'dia livre' : 'dias livres'} esta semana`}
      </span>
      <ol className="flex items-center gap-1" aria-label={summary} aria-busy={state.status === 'loading'}>
        {WEEKDAY_LABELS.map((label, i) => {
          const open = openDays?.[i] ?? false;
          return (
            <li
              key={i}
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold leading-none ${
                state.status === 'loading'
                  ? 'animate-pulse bg-rental-surface2 text-transparent'
                  : open
                  ? 'bg-rental-primary text-[var(--rs-primary-text)]'
                  : 'bg-rental-surface2 text-rental-muted/60'
              }`}
            >
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
