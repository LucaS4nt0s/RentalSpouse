'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Calendar,
  Clock,
  Timer,
  User,
  AlertTriangle,
  RefreshCw,
  LogIn,
  ListChecks,
} from 'lucide-react';
import {
  AgendaSlot,
  Agendamento,
  calcularDuracaoMinutos,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
} from '../../services/agenda';
import { Professional } from '../../types/professional';

export interface ConfirmacaoAgendamentoProps {
  profissional: Professional | null;
  professionalId: number;
  slotSelecionado: AgendaSlot | null;
  agendamentoCriado: Agendamento | null;
  isAuthenticated: boolean;
  ehCliente: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  conflito409: string | null;
  onConfirmar: () => void;
  onVerMeusAgendamentos: () => void;
  onNovoAgendamento: () => void;
}

export const ConfirmacaoAgendamento: React.FC<ConfirmacaoAgendamentoProps> = ({
  profissional,
  professionalId,
  slotSelecionado,
  agendamentoCriado,
  isAuthenticated,
  ehCliente,
  isSubmitting,
  submitError,
  conflito409,
  onConfirmar,
  onVerMeusAgendamentos,
  onNovoAgendamento,
}) => {
  const nomeProfissional =
    profissional?.name ?? `Profissional #${professionalId}`;

  // Estado de Sucesso após POST /api/agendamentos (201 Created)
  if (agendamentoCriado) {
    const dataIso = extrairDataIso(agendamentoCriado.data_hora_inicio);
    const horaIni = extrairHoraCurta(agendamentoCriado.data_hora_inicio);
    const horaFim = extrairHoraCurta(agendamentoCriado.data_hora_fim);
    const duracao = calcularDuracaoMinutos(
      agendamentoCriado.data_hora_inicio,
      agendamentoCriado.data_hora_fim,
    );

    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-rental-success/40 bg-rental-surface p-6 shadow-sm animate-fadeIn"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rental-success/15 text-rental-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <span className="inline-block rounded-full bg-rental-success/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rental-success">
              Reserva confirmada #{agendamentoCriado.id}
            </span>
            <h2 className="mt-1 text-lg font-extrabold text-rental-ink">
              Agendamento realizado com sucesso!
            </h2>
            <p className="text-xs text-rental-muted">
              Seu horário foi reservado na agenda de{' '}
              <strong className="font-semibold text-rental-ink">
                {nomeProfissional}
              </strong>
              .
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-rental-border bg-rental-surface2/60 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-rental-muted">Profissional</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {nomeProfissional}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-rental-muted">Data</dt>
            <dd className="mt-0.5 font-bold capitalize text-rental-ink">
              {formatarDataCompleta(dataIso)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-rental-muted">Horário</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {horaIni} às {horaFim}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-rental-muted">Duração</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {duracao} minutos
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="#meus-agendamentos"
            onClick={(e) => {
              e.preventDefault();
              onVerMeusAgendamentos();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)]"
          >
            <ListChecks className="h-4 w-4" />
            <span>Meus agendamentos</span>
          </a>

          <button
            type="button"
            onClick={onNovoAgendamento}
            className="inline-flex items-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-4 py-2.5 text-xs sm:text-sm font-bold text-rental-ink transition-colors hover:border-rental-primary/40 hover:bg-rental-surface2"
          >
            Agendar outro horário
          </button>

          <Link
            href="/profissionais"
            className="text-xs font-semibold text-rental-muted transition-colors hover:text-rental-primary"
          >
            Voltar ao catálogo de profissionais
          </Link>
        </div>
      </section>
    );
  }

  const dataResumo = slotSelecionado
    ? formatarDataCompleta(extrairDataIso(slotSelecionado.data_hora_inicio))
    : null;
  const horaInicioResumo = slotSelecionado
    ? extrairHoraCurta(slotSelecionado.data_hora_inicio)
    : null;
  const horaFimResumo = slotSelecionado
    ? extrairHoraCurta(slotSelecionado.data_hora_fim)
    : null;
  const duracaoResumo = slotSelecionado
    ? calcularDuracaoMinutos(
        slotSelecionado.data_hora_inicio,
        slotSelecionado.data_hora_fim,
      )
    : null;

  return (
    <section
      aria-label="Resumo e confirmação do agendamento"
      className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm"
    >
      <h2 className="text-base font-bold text-rental-ink">
        3. Resumo e confirmação
      </h2>
      <p className="mt-0.5 text-xs text-rental-muted">
        Confira os dados do atendimento antes de confirmar sua reserva.
      </p>

      {/* Alerta específico para 409 (slot ocupado no meio do caminho) */}
      {conflito409 && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-rental-ink"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Horário indisponível (conflito 409)</p>
            <p className="mt-0.5 text-rental-muted">{conflito409}</p>
          </div>
        </div>
      )}

      {/* Erro geral de submissão com opção de retry */}
      {submitError && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3.5 text-xs text-rental-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--rs-error)] mt-0.5" />
            <span>{submitError}</span>
          </div>
          {slotSelecionado && isAuthenticated && ehCliente && (
            <button
              type="button"
              onClick={onConfirmar}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-rental-border bg-rental-surface px-3 py-1.5 text-xs font-bold text-rental-ink hover:border-rental-primary/40 sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Tentar novamente</span>
            </button>
          )}
        </div>
      )}

      {/* Resumo dos 4 itens exigidos: profissional, data, hora, duração */}
      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-rental-border bg-rental-surface2/50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-2.5">
          <User className="h-4 w-4 shrink-0 text-rental-primary mt-0.5" />
          <div>
            <dt className="text-rental-muted">Profissional</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {nomeProfissional}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Calendar className="h-4 w-4 shrink-0 text-rental-primary mt-0.5" />
          <div>
            <dt className="text-rental-muted">Data</dt>
            <dd className="mt-0.5 font-bold capitalize text-rental-ink">
              {dataResumo ?? 'Selecione um dia'}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-rental-primary mt-0.5" />
          <div>
            <dt className="text-rental-muted">Horário</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {horaInicioResumo && horaFimResumo
                ? `${horaInicioResumo} às ${horaFimResumo}`
                : 'Selecione um horário'}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Timer className="h-4 w-4 shrink-0 text-rental-primary mt-0.5" />
          <div>
            <dt className="text-rental-muted">Duração</dt>
            <dd className="mt-0.5 font-bold text-rental-ink">
              {duracaoResumo ? `${duracaoResumo} minutos` : '—'}
            </dd>
          </div>
        </div>
      </dl>

      {/* Ação de confirmação / aviso de autenticação */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!isAuthenticated ? (
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <p className="text-xs text-rental-muted">
              Você precisa entrar com sua conta de cliente para reservar um
              horário.
            </p>
            <Link
              href="/entrar"
              className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
            >
              <LogIn className="h-4 w-4" />
              <span>Entrar para agendar</span>
            </Link>
          </div>
        ) : !ehCliente ? (
          <p className="text-xs text-rental-muted">
            Apenas usuários com perfil de{' '}
            <strong className="text-rental-ink">cliente</strong> podem realizar
            agendamentos.
          </p>
        ) : (
          <>
            <p className="text-xs text-rental-muted">
              {slotSelecionado
                ? 'Clique em confirmar para concluir a reserva deste horário.'
                : 'Escolha uma data e um horário livre acima para habilitar a confirmação.'}
            </p>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={!slotSelecionado || isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Confirmando reserva...</span>
                </>
              ) : (
                <span>Confirmar agendamento</span>
              )}
            </button>
          </>
        )}
      </div>
    </section>
  );
};
