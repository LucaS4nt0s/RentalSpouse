'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Ban,
  Briefcase,
  Calendar,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  RefreshCw,
  Star,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import {
  Agendamento,
  AgendamentoStatus,
  cancelarAgendamento,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
  listarMeusAgendamentos,
  obterProfissionalPorId,
  verificarPermissaoCancelamento,
} from '../../../services/agenda';
import { mensagemErro } from '../../../services/apiError';
import { Button } from '../../../components/ui/Button';
import { AppHeader } from '../../../components/layout/AppHeader';
import { CancelarAgendamentoModal } from '../../../components/agenda/CancelarAgendamentoModal';
import { AvaliarProfissionalModal } from '../../../components/avaliacoes/AvaliarProfissionalModal';

type FilterTab = 'todos' | AgendamentoStatus;

const FILTROS: Array<{ id: FilterTab; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'agendado', label: 'Agendados' },
  { id: 'concluido', label: 'Concluídos' },
  { id: 'cancelado', label: 'Cancelados' },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  agendado: {
    label: 'Agendado',
    className: 'bg-rental-success/15 text-rental-success',
  },
  concluido: {
    label: 'Concluído',
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-red-500/15 text-red-600 dark:text-red-400',
  },
};

function ordenarMeusAgendamentos(
  lista: Agendamento[],
  filtro: FilterTab,
): Agendamento[] {
  const compararAsc = (a: Agendamento, b: Agendamento) =>
    a.data_hora_inicio.localeCompare(b.data_hora_inicio) || a.id - b.id;
  const compararDesc = (a: Agendamento, b: Agendamento) =>
    b.data_hora_inicio.localeCompare(a.data_hora_inicio) || b.id - a.id;

  if (filtro === 'agendado') {
    return [...lista].sort(compararAsc);
  }
  if (filtro === 'concluido' || filtro === 'cancelado') {
    return [...lista].sort(compararDesc);
  }

  const agendados = lista
    .filter((ag) => ag.status === 'agendado')
    .sort(compararAsc);
  const historico = lista
    .filter((ag) => ag.status !== 'agendado')
    .sort(compararDesc);
  return [...agendados, ...historico];
}

export default function ClienteAgendamentosPage() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const { notificacoes } = useNotifications();

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [nomesProfissionais, setNomesProfissionais] = useState<
    Record<number, string>
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');

  const [agendamentoParaCancelar, setAgendamentoParaCancelar] =
    useState<Agendamento | null>(null);
  const [agendamentoParaAvaliar, setAgendamentoParaAvaliar] =
    useState<Agendamento | null>(null);

  const requestIdRef = useRef(0);

  const carregarAgendamentos = useCallback(async () => {
    if (!token) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const lista = await listarMeusAgendamentos(token);
      if (requestId !== requestIdRef.current) return;
      setAgendamentos(lista);

      const idsUnicos = Array.from(
        new Set(lista.map((ag) => ag.professional_id)),
      );
      const pares = await Promise.all(
        idsUnicos.map(async (id) => {
          const p = await obterProfissionalPorId(id).catch(() => null);
          return p ? ([id, p.name] as const) : null;
        }),
      );
      if (requestId !== requestIdRef.current) return;

      setNomesProfissionais((prev) => {
        const proximo = { ...prev };
        for (const par of pares) {
          if (par) proximo[par[0]] = par[1];
        }
        return proximo;
      });
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(
        mensagemErro(err, 'Não foi possível carregar seus agendamentos.'),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      carregarAgendamentos();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [isAuthenticated, token, authLoading, carregarAgendamentos, notificacoes]);

  const contadores = useMemo(() => {
    let agendados = 0;
    let concluidos = 0;
    let cancelados = 0;
    for (const ag of agendamentos) {
      if (ag.status === 'agendado') agendados += 1;
      else if (ag.status === 'concluido') concluidos += 1;
      else if (ag.status === 'cancelado') cancelados += 1;
    }
    return {
      total: agendamentos.length,
      agendados,
      concluidos,
      cancelados,
    };
  }, [agendamentos]);

  const agendamentosFiltrados = useMemo(() => {
    const base =
      activeTab === 'todos'
        ? agendamentos
        : agendamentos.filter((ag) => ag.status === activeTab);
    return ordenarMeusAgendamentos(base, activeTab);
  }, [agendamentos, activeTab]);

  const handleConfirmarCancelamento = async (
    agendamentoId: number,
    motivo?: string,
  ): Promise<boolean> => {
    if (!token) return false;
    const atualizado = await cancelarAgendamento(token, agendamentoId, motivo);
    setAgendamentos((prev) =>
      prev.map((ag) =>
        ag.id === agendamentoId ? { ...ag, ...atualizado } : ag,
      ),
    );
    setFeedbackBanner(
      `Agendamento #${agendamentoId} cancelado com sucesso. O horário foi liberado na agenda do profissional.`,
    );
    return true;
  };

  // 1. Loading inicial de autenticação
  if (authLoading) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="h-8 w-52 bg-rental-surface2 rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 bg-rental-surface2 rounded-2xl animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 bg-rental-surface2 rounded-3xl animate-pulse" />
        </div>
      </main>
    );
  }

  // 2. Não autenticado: tela de login amigável
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Acesse seus Agendamentos
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Faça login na sua conta de cliente para acompanhar seus horários
              reservados, cancelar atendimentos ou avaliar serviços concluídos.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/entrar">
              <Button variant="primary" className="w-full">
                Entrar na Conta
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Voltar à Página Inicial
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-rental-bg text-rental-ink">
      <AppHeader />

      <main className="flex-1 p-4 sm:p-6 lg:p-10 space-y-6 animate-fadeIn">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Cabeçalho da Página */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rental-border/60">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-rental-ink tracking-tight flex items-center gap-2.5">
                <Calendar className="h-6 w-6 text-rental-primary" />
                <span>Meus Agendamentos</span>
              </h1>
              <p className="text-xs text-rental-muted mt-0.5">
                Acompanhe suas reservas, gerencie cancelamentos e avalie atendimentos concluídos.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFeedbackBanner(null);
                  carregarAgendamentos();
                }}
                disabled={isLoading}
                leftIcon={
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                  />
                }
                className="text-xs font-semibold"
              >
                Atualizar
              </Button>
              <Link href="/profissionais">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  className="text-xs font-bold"
                >
                  Novo Agendamento
                </Button>
              </Link>
            </div>
          </div>

          {/* Resumo / Métricas Rápidas */}
          <section
            aria-label="Resumo dos agendamentos"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
          >
            <div className="rounded-2xl border border-rental-border bg-rental-surface p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rental-muted uppercase tracking-wider">
                  Total
                </span>
                <Calendar className="h-4 w-4 text-rental-primary" />
              </div>
              <div className="text-2xl font-black text-rental-ink">
                {contadores.total}
              </div>
              <span className="text-[11px] text-rental-muted block truncate">
                {contadores.total === 1 ? '1 reserva' : `${contadores.total} reservas`}
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                  Agendados
                </span>
                <CalendarCheck2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-500">
                {contadores.agendados}
              </div>
              <span className="text-[11px] text-rental-muted block truncate">
                Atendimentos previstos
              </span>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">
                  Concluídos
                </span>
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-500">
                {contadores.concluidos}
              </div>
              <span className="text-[11px] text-rental-muted block truncate">
                Serviços finalizados
              </span>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">
                  Cancelados
                </span>
                <Ban className="h-4 w-4 text-red-500" />
              </div>
              <div className="text-2xl font-black text-red-500">
                {contadores.cancelados}
              </div>
              <span className="text-[11px] text-rental-muted block truncate">
                Horários liberados
              </span>
            </div>
          </section>

          {/* Abas de Filtro por Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map((tab) => {
              const ativo = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    ativo
                      ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                      : 'bg-rental-surface border border-rental-border text-rental-muted hover:text-rental-ink hover:border-rental-primary/30'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Banner de Feedback */}
          {feedbackBanner && (
            <div
              role="status"
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedbackBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="p-1 rounded-lg hover:bg-emerald-500/15 transition-colors"
                aria-label="Dispensar aviso"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Estados obrigatórios: Loading, Error, Empty, Success */}
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-rental-surface2/60 animate-pulse border border-rental-border"
                />
              ))}
            </div>
          ) : error ? (
            <section
              role="alert"
              className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-6 text-xs text-[var(--rs-error)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2.5 font-semibold">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={carregarAgendamentos}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Tentar novamente
              </Button>
            </section>
          ) : agendamentosFiltrados.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-rental-border bg-rental-surface p-10 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
                <Calendar className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-extrabold text-rental-ink">
                  {activeTab === 'todos'
                    ? 'Você ainda não possui agendamentos'
                    : 'Nenhum agendamento encontrado para este filtro'}
                </h2>
                <p className="text-xs text-rental-muted max-w-md mx-auto">
                  {activeTab === 'todos'
                    ? 'Explore os profissionais verificados da plataforma e reserve um horário disponível.'
                    : 'Altere o filtro acima para visualizar agendamentos com outros status.'}
                </p>
              </div>
              {activeTab === 'todos' && (
                <Link href="/profissionais" className="inline-block">
                  <Button variant="primary" size="sm">
                    Buscar Profissionais
                  </Button>
                </Link>
              )}
            </section>
          ) : (
            <ul className="space-y-3">
              {agendamentosFiltrados.map((ag) => {
                const dataIso = extrairDataIso(ag.data_hora_inicio);
                const hIni = extrairHoraCurta(ag.data_hora_inicio);
                const hFim = extrairHoraCurta(ag.data_hora_fim);
                const nomeProf =
                  nomesProfissionais[ag.professional_id] ??
                  `Profissional #${ag.professional_id}`;
                const badge = STATUS_BADGE[ag.status] ?? {
                  label: ag.status,
                  className: 'bg-rental-surface2 text-rental-muted',
                };

                return (
                  <li
                    key={ag.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-rental-border bg-rental-surface p-4 sm:p-5 text-xs shadow-sm sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rental-primary/10 text-rental-primary">
                        <Clock className="h-4 w-4" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-bold capitalize text-rental-ink">
                          {formatarDataCompleta(dataIso)} · {hIni} às {hFim}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-rental-muted">
                          <Link
                            href={`/profissionais/${ag.professional_id}/agendar`}
                            className="inline-flex items-center gap-1.5 font-semibold text-rental-ink hover:text-rental-primary hover:underline"
                          >
                            <User className="h-3.5 w-3.5 shrink-0 text-rental-primary" />
                            <span>{nomeProf}</span>
                          </Link>
                          <span>Reserva #{ag.id}</span>
                          {ag.orcamento_id && (
                            <Link
                              href="/cliente/orcamentos"
                              className="inline-flex items-center gap-1 font-semibold text-rental-primary hover:underline"
                            >
                              <Briefcase className="h-3 w-3 shrink-0" />
                              <span>Orçamento #{ag.orcamento_id}</span>
                            </Link>
                          )}
                        </div>
                        {ag.status === 'cancelado' && ag.motivo_cancelamento && (
                          <p className="text-[11px] italic text-rental-muted">
                            Motivo: {ag.motivo_cancelamento}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${badge.className}`}
                      >
                        {badge.label}
                      </span>

                      {ag.status === 'agendado' && (() => {
                        const permissao = verificarPermissaoCancelamento(
                          ag.data_hora_inicio,
                        );
                        if (permissao.podeCancelar) {
                          return (
                            <button
                              type="button"
                              onClick={() => setAgendamentoParaCancelar(ag)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
                              title="Cancelar este agendamento"
                            >
                              Cancelar
                            </button>
                          );
                        }
                        return (
                          <div
                            className="flex items-center gap-1.5"
                            title={permissao.motivo}
                          >
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-lg border border-rental-border bg-rental-surface2/60 px-3 py-1.5 text-xs font-semibold text-rental-muted opacity-60"
                              title={permissao.motivo}
                            >
                              Cancelar
                            </button>
                            <span
                              className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                              title={permissao.motivo}
                            >
                              &lt;24h
                            </span>
                          </div>
                        );
                      })()}

                      {ag.status === 'concluido' && (
                        <button
                          type="button"
                          onClick={() => setAgendamentoParaAvaliar(ag)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rental-primary px-3 py-1.5 text-xs font-bold text-[var(--rs-primary-text)] transition-opacity hover:opacity-90"
                        >
                          <Star className="h-3.5 w-3.5" />
                          <span>Avaliar serviço</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <CancelarAgendamentoModal
        isOpen={agendamentoParaCancelar !== null}
        onClose={() => setAgendamentoParaCancelar(null)}
        agendamento={agendamentoParaCancelar}
        nomeProfissional={
          agendamentoParaCancelar
            ? nomesProfissionais[agendamentoParaCancelar.professional_id]
            : undefined
        }
        onConfirmar={handleConfirmarCancelamento}
      />

      {agendamentoParaAvaliar && (
        <AvaliarProfissionalModal
          isOpen={Boolean(agendamentoParaAvaliar)}
          onClose={() => setAgendamentoParaAvaliar(null)}
          professionalId={agendamentoParaAvaliar.professional_id}
          professionalName={
            nomesProfissionais[agendamentoParaAvaliar.professional_id] ??
            `Profissional #${agendamentoParaAvaliar.professional_id}`
          }
          agendamentoId={agendamentoParaAvaliar.id}
          orcamentoId={agendamentoParaAvaliar.orcamento_id}
          onSuccess={() => {
            setFeedbackBanner(
              'Avaliação registrada com sucesso! Obrigado pelo seu feedback.',
            );
            carregarAgendamentos();
          }}
        />
      )}
    </div>
  );
}
