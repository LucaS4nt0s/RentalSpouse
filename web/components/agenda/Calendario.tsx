'use client';

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { AgendaDia } from '../../services/agenda';

export interface CalendarioProps {
  dias: AgendaDia[];
  diaSelecionado: string | null;
  onSelecionarDia: (dataIso: string) => void;
  isLoading?: boolean;
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function extrairPartesData(dataIso: string): {
  diaSemana: string;
  numeroDia: string;
  mesCurto: string;
} {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const d = new Date(ano, (mes || 1) - 1, dia || 1);
  return {
    diaSemana: DIAS_CURTOS[d.getDay()] ?? '',
    numeroDia: String(dia || '').padStart(2, '0'),
    mesCurto: MESES_CURTOS[(mes || 1) - 1] ?? '',
  };
}

export const Calendario: React.FC<CalendarioProps> = ({
  dias,
  diaSelecionado,
  onSelecionarDia,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <section
        aria-label="Carregando calendário de 30 dias"
        className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-48 animate-pulse rounded-lg bg-rental-surface2" />
          <div className="h-4 w-28 animate-pulse rounded-lg bg-rental-surface2" />
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className="h-20 animate-pulse rounded-xl border border-rental-border bg-rental-surface2"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Calendário de disponibilidade para os próximos 30 dias"
      className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-rental-primary" />
          <h2 className="text-base font-bold text-rental-ink">
            1. Escolha uma data (próximos 30 dias)
          </h2>
        </div>
        <span className="text-xs text-rental-muted">
          Dias sem horários livres aparecem desabilitados
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-6">
        {dias.map((item) => {
          const slotsLivres = item.slots.filter((s) => s.disponivel).length;
          const semGrade = slotsLivres === 0;
          const ativo = diaSelecionado === item.data;
          const { diaSemana, numeroDia, mesCurto } = extrairPartesData(
            item.data,
          );

          return (
            <button
              key={item.data}
              type="button"
              disabled={semGrade}
              aria-pressed={ativo}
              aria-label={`${diaSemana}, ${numeroDia} de ${mesCurto} — ${
                semGrade
                  ? 'sem horários disponíveis'
                  : `${slotsLivres} horário(s) disponível(is)`
              }`}
              onClick={() => onSelecionarDia(item.data)}
              className={`flex flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-center transition-all ${
                semGrade
                  ? 'cursor-not-allowed border-rental-border/50 bg-rental-surface2/40 text-rental-muted opacity-50'
                  : ativo
                  ? 'border-rental-primary bg-rental-primary text-white shadow-primary'
                  : 'border-rental-border bg-rental-surface text-rental-ink hover:border-rental-primary/50 hover:bg-rental-surface2'
              }`}
            >
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  ativo ? 'text-white/90' : 'text-rental-muted'
                }`}
              >
                {diaSemana}
              </span>
              <span className="mt-0.5 text-lg font-extrabold leading-tight">
                {numeroDia}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  ativo ? 'text-white/90' : 'text-rental-muted'
                }`}
              >
                {mesCurto}
              </span>
              <span
                className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  semGrade
                    ? 'bg-rental-border/40 text-rental-muted'
                    : ativo
                    ? 'bg-white/20 text-white'
                    : 'bg-rental-primary/10 text-rental-primary'
                }`}
              >
                {semGrade
                  ? 'Indisponível'
                  : `${slotsLivres} ${slotsLivres === 1 ? 'vaga' : 'vagas'}`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
