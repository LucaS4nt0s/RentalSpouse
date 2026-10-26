'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Zap,
  ArrowLeft,
  CalendarOff,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  MapPin,
  LogOut,
  ListChecks,
  Clock,
} from 'lucide-react';
import { ThemeToggle } from '../../../../components/ui/ThemeToggle';
import { NotificationBell } from '../../../../components/notificacoes/NotificationBell';
import { Calendario } from '../../../../components/agenda/Calendario';
import { GradeHorarios } from '../../../../components/agenda/GradeHorarios';
import { ConfirmacaoAgendamento } from '../../../../components/agenda/ConfirmacaoAgendamento';
import { useAgenda } from '../../../../hooks/useAgenda';
import {
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
} from '../../../../services/agenda';

export default function AgendarProfissionalPage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const professionalId = Number(rawId);

  const {
    user,
    isAuthenticated,
    ehCliente,
    profissional,
    dias,
    diaSelecionado,
    diaAtual,
    slotSelecionado,
    agendaVazia,
    isLoading,
    isRefreshing,
    error,
    isSubmitting,
    submitError,
    conflito409,
    agendamentoCriado,
    meusAgendamentos,
    nomesProfissionais,
    loadingMeus,
    erroMeus,
    selecionarDia,
    selecionarSlot,
    recarregarAgenda,
    confirmarAgendamento,
    carregarMeusAgendamentos,
    iniciarNovoAgendamento,
  } = useAgenda(professionalId);

  const [exibirMeus, setExibirMeus] = useState<boolean>(false);

  const handleVerMeusAgendamentos = () => {
    setExibirMeus(true);
    carregarMeusAgendamentos();
  };

  const localizacao = [
    profissional?.city,
    profissional?.state ? profissional.state.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  return (
    <div className="flex min-h-screen flex-col bg-rental-bg text-rental-ink">
      {/* Header Global */}
      <header className="sticky top-0 z-30 bg-rental-bg/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)]">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              RentalSpouse
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/profissionais"
              className="hidden sm:inline-block text-xs font-semibold text-rental-muted transition-colors hover:text-rental-primary"
            >
              Profissionais
            </Link>

            {isAuthenticated && ehCliente && (
              <button
                type="button"
                onClick={handleVerMeusAgendamentos}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
              >
                <ListChecks className="h-3.5 w-3.5" />
                <span>Meus agendamentos</span>
              </button>
            )}

            {isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rental-primary/10 text-xs font-bold text-rental-primary">
                  {user.nome.charAt(0).toUpperCase()}
                </span>
                <NotificationBell />
              </div>
            ) : (
              <Link
                href="/entrar"
                className="rounded-xl bg-rental-primary px-3.5 py-1.5 text-xs font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
              >
                Entrar
              </Link>
            )}

            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {/* Navegação de retorno */}
        <div>
          <Link
            href="/profissionais"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rental-muted transition-colors hover:text-rental-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para busca de profissionais</span>
          </Link>
        </div>

        {/* Cabeçalho do Profissional */}
        <section className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm">
          {isLoading && !profissional ? (
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 animate-pulse rounded-2xl bg-rental-surface2" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-48 animate-pulse rounded-lg bg-rental-surface2" />
                <div className="h-4 w-72 animate-pulse rounded-lg bg-rental-surface2" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold text-rental-ink sm:text-2xl">
                    Agendar com{' '}
                    {profissional?.name ?? `Profissional #${professionalId}`}
                  </h1>
                  {profissional?.approval_status === 'approved' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rental-success/10 px-2.5 py-0.5 text-xs font-semibold text-rental-success">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Verificado</span>
                    </span>
                  )}
                </div>

                {localizacao && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-rental-muted">
                    <MapPin className="h-3.5 w-3.5 text-rental-primary" />
                    <span>{localizacao}</span>
                  </p>
                )}

                {profissional?.specialties &&
                  profissional.specialties.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {profissional.specialties.map((esp) => (
                        <span
                          key={esp}
                          className="rounded-lg border border-rental-border bg-rental-surface2 px-2.5 py-0.5 text-[11px] font-medium text-rental-muted"
                        >
                          {esp}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              {isRefreshing && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rental-primary">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Atualizando grade...</span>
                </span>
              )}
            </div>
          )}
        </section>

        {/* Tratamento obrigatório dos 3 estados da agenda (.cursorrules §2.2) */}
        {isLoading ? (
          /* Estado 1: Loading (Skeleton do calendário e da grade) */
          <div className="space-y-6">
            <Calendario
              dias={[]}
              diaSelecionado={null}
              onSelecionarDia={() => {}}
              isLoading
            />
            <GradeHorarios
              dia={null}
              slotSelecionado={null}
              onSelecionarSlot={() => {}}
              isLoading
            />
          </div>
        ) : error ? (
          /* Estado 2: Error (Mensagem clara com botão de retry) */
          <section
            role="alert"
            className="flex flex-col items-center justify-center rounded-2xl border border-[var(--rs-error)]/40 bg-rental-surface p-8 text-center shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rs-error)]/10 text-[var(--rs-error)]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-base font-extrabold text-rental-ink">
              Não foi possível carregar a agenda
            </h2>
            <p className="mt-1 max-w-md text-xs text-rental-muted">{error}</p>
            <button
              type="button"
              onClick={() => recarregarAgenda(false)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)]"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Tentar novamente</span>
            </button>
          </section>
        ) : agendaVazia && !agendamentoCriado ? (
          /* Estado 3: Empty ("este profissional ainda não abriu a agenda") */
          <section className="flex flex-col items-center justify-center rounded-2xl border border-rental-border bg-rental-surface p-10 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
              <CalendarOff className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-extrabold text-rental-ink">
              Este profissional ainda não abriu a agenda
            </h2>
            <p className="mt-1 max-w-md text-xs text-rental-muted">
              Não há horários disponíveis nos próximos 30 dias para este
              profissional. Você pode voltar ao catálogo ou escolher outro
              prestador.
            </p>
            <Link
              href="/profissionais"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Ver outros profissionais</span>
            </Link>
          </section>
        ) : (
          /* Estado 4: Sucesso com dados (Calendário + Grade + Confirmação) */
          <div className="space-y-6">
            {!agendamentoCriado && (
              <>
                <Calendario
                  dias={dias}
                  diaSelecionado={diaSelecionado}
                  onSelecionarDia={selecionarDia}
                />

                <GradeHorarios
                  dia={diaAtual}
                  slotSelecionado={slotSelecionado}
                  onSelecionarSlot={selecionarSlot}
                />
              </>
            )}

            <ConfirmacaoAgendamento
              profissional={profissional}
              professionalId={professionalId}
              slotSelecionado={slotSelecionado}
              agendamentoCriado={agendamentoCriado}
              isAuthenticated={isAuthenticated}
              ehCliente={ehCliente}
              isSubmitting={isSubmitting}
              submitError={submitError}
              conflito409={conflito409}
              onConfirmar={confirmarAgendamento}
              onVerMeusAgendamentos={handleVerMeusAgendamentos}
              onNovoAgendamento={iniciarNovoAgendamento}
            />
          </div>
        )}

        {/* Seção "Meus agendamentos" (acionada pelo link da tela de sucesso ou topo) */}
        {exibirMeus && (
          <section
            id="meus-agendamentos"
            aria-label="Meus agendamentos"
            className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm animate-fadeIn"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-rental-primary" />
                <h2 className="text-base font-bold text-rental-ink">
                  Meus agendamentos
                </h2>
              </div>
              <button
                type="button"
                onClick={carregarMeusAgendamentos}
                disabled={loadingMeus}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rental-border px-2.5 py-1 text-xs font-semibold text-rental-muted hover:text-rental-ink"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loadingMeus ? 'animate-spin' : ''}`}
                />
                <span>Atualizar</span>
              </button>
            </div>

            {loadingMeus ? (
              <div className="space-y-2.5">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-14 animate-pulse rounded-xl bg-rental-surface2"
                  />
                ))}
              </div>
            ) : erroMeus ? (
              <div className="flex items-center justify-between rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3.5 text-xs">
                <span>{erroMeus}</span>
                <button
                  type="button"
                  onClick={carregarMeusAgendamentos}
                  className="font-bold text-rental-primary hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : meusAgendamentos.length === 0 ? (
              <p className="text-xs text-rental-muted">
                Você ainda não possui agendamentos registrados.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {meusAgendamentos.map((ag) => {
                  const dataIso = extrairDataIso(ag.data_hora_inicio);
                  const hIni = extrairHoraCurta(ag.data_hora_inicio);
                  const hFim = extrairHoraCurta(ag.data_hora_fim);
                  return (
                    <li
                      key={ag.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-rental-border bg-rental-surface2/50 p-3.5 text-xs sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 text-rental-primary shrink-0" />
                        <div>
                          <p className="font-bold capitalize text-rental-ink">
                            {formatarDataCompleta(dataIso)} • {hIni} às {hFim}
                          </p>
                          <p className="text-rental-muted">
                            {nomesProfissionais[ag.professional_id] ??
                              (profissional?.id === ag.professional_id
                                ? profissional.name
                                : `Profissional #${ag.professional_id}`)}{' '}
                            • Reserva #{ag.id}
                          </p>
                        </div>
                      </div>
                      <span className="self-start rounded-full bg-rental-success/15 px-2.5 py-0.5 text-[11px] font-bold uppercase text-rental-success sm:self-auto">
                        {ag.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
