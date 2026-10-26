'use client';

import React from 'react';
import { Clock, CalendarX2 } from 'lucide-react';
import {
  AgendaDia,
  AgendaSlot,
  calcularDuracaoMinutos,
  extrairHoraCurta,
  formatarDataCompleta,
} from '../../services/agenda';

export interface GradeHorariosProps {
  dia: AgendaDia | null;
  slotSelecionado: AgendaSlot | null;
  onSelecionarSlot: (slot: AgendaSlot) => void;
  isLoading?: boolean;
}

export const GradeHorarios: React.FC<GradeHorariosProps> = ({
  dia,
  slotSelecionado,
  onSelecionarSlot,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <section
        aria-label="Carregando horários disponíveis"
        className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-52 animate-pulse rounded-lg bg-rental-surface2" />
          <div className="h-4 w-32 animate-pulse rounded-lg bg-rental-surface2" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-14 animate-pulse rounded-xl border border-rental-border bg-rental-surface2"
            />
          ))}
        </div>
      </section>
    );
  }

  const slots = dia?.slots ?? [];

  return (
    <section
      aria-label="Grade de horários do dia selecionado"
      className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-rental-primary" />
          <h2 className="text-base font-bold text-rental-ink">
            2. Selecione o horário de atendimento
          </h2>
        </div>
        {dia && (
          <span className="text-xs font-semibold capitalize text-rental-muted">
            {formatarDataCompleta(dia.data)}
          </span>
        )}
      </div>

      {!dia || slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rental-border bg-rental-surface2/40 px-4 py-8 text-center">
          <CalendarX2 className="h-8 w-8 text-rental-muted" />
          <p className="mt-2 text-sm font-bold text-rental-ink">
            Nenhum horário disponível para esta data
          </p>
          <p className="mt-1 text-xs text-rental-muted">
            Escolha outro dia habilitado no calendário acima para ver os
            horários livres.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {slots.map((slot) => {
            const horaInicio = extrairHoraCurta(slot.data_hora_inicio);
            const horaFim = extrairHoraCurta(slot.data_hora_fim);
            const duracao = calcularDuracaoMinutos(
              slot.data_hora_inicio,
              slot.data_hora_fim,
            );
            const selecionado =
              slotSelecionado?.data_hora_inicio === slot.data_hora_inicio;

            return (
              <button
                key={slot.data_hora_inicio}
                type="button"
                aria-pressed={selecionado}
                onClick={() => onSelecionarSlot(slot)}
                className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 text-center transition-all ${
                  selecionado
                    ? 'border-rental-primary bg-rental-primary text-white shadow-primary'
                    : 'border-rental-border bg-rental-surface text-rental-ink hover:border-rental-primary/50 hover:bg-rental-surface2'
                }`}
              >
                <span className="text-sm font-extrabold">
                  {horaInicio} – {horaFim}
                </span>
                <span
                  className={`mt-0.5 text-[11px] font-medium ${
                    selecionado ? 'text-white/90' : 'text-rental-muted'
                  }`}
                >
                  {duracao ? `${duracao} min` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
