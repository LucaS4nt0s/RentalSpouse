'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CalendarCheck2,
  CalendarOff,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  calcularQuantidadeSlots,
  consultarMinhaDisponibilidade,
  converterHoraParaMinutos,
  definirMinhaDisponibilidade,
  DIAS_SEMANA_PT,
  DisponibilidadeJanela,
  DisponibilidadePayload,
  MAX_JANELAS_POR_GRADE,
  normalizarHoraCurta,
  validarGradeDisponibilidade,
} from '../../../services/agenda';
import { Button } from '../../../components/ui/Button';
import { AppHeader } from '../../../components/layout/AppHeader';

interface JanelaEditor {
  localId: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  duracao_slot_min: number;
}

const DURACOES_PADRAO = [15, 30, 45, 60, 90, 120, 180, 240];

function formatarMinutosParaHora(totalMin: number): string {
  const clamped = Math.max(0, Math.min(totalMin, 23 * 60 + 59));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function serializarGrade(janelas: JanelaEditor[]): string {
  const ordenadas = [...janelas]
    .map((j) => ({
      dia_semana: j.dia_semana,
      hora_inicio: normalizarHoraCurta(j.hora_inicio),
      hora_fim: normalizarHoraCurta(j.hora_fim),
      duracao_slot_min: Number(j.duracao_slot_min),
    }))
    .sort((a, b) =>
      a.dia_semana !== b.dia_semana
        ? a.dia_semana - b.dia_semana
        : a.hora_inicio.localeCompare(b.hora_inicio),
    );
  return JSON.stringify(ordenadas);
}

export default function ProfissionalAgendaPage() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const nextIdRef = useRef(1);

  const gerarLocalId = useCallback(() => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return `janela-${id}`;
  }, []);

  const mapearParaEditor = useCallback(
    (lista: DisponibilidadeJanela[]): JanelaEditor[] =>
      lista.map((item) => ({
        localId: gerarLocalId(),
        dia_semana: item.dia_semana,
        hora_inicio: normalizarHoraCurta(item.hora_inicio),
        hora_fim: normalizarHoraCurta(item.hora_fim),
        duracao_slot_min: item.duracao_slot_min,
      })),
    [gerarLocalId],
  );

  const [janelas, setJanelas] = useState<JanelaEditor[]>([]);
  const [assinaturaSalva, setAssinaturaSalva] = useState<string>('[]');
  const [totalSalvo, setTotalSalvo] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isProfessional =
    isAuthenticated &&
    (user?.tipo === 'profissional' || user?.role === 'professional');

  const carregarDisponibilidade = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const dados = await consultarMinhaDisponibilidade(token);
      const editaveis = mapearParaEditor(dados);
      setJanelas(editaveis);
      setAssinaturaSalva(serializarGrade(editaveis));
      setTotalSalvo(editaveis.length);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar sua grade de disponibilidade.';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, mapearParaEditor]);

  useEffect(() => {
    if (isAuthenticated && isProfessional) {
      carregarDisponibilidade();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [isAuthenticated, isProfessional, authLoading, carregarDisponibilidade]);

  const temAlteracoesPendentes = useMemo(
    () => serializarGrade(janelas) !== assinaturaSalva,
    [janelas, assinaturaSalva],
  );

  const erroValidacao = useMemo(
    () => validarGradeDisponibilidade(janelas),
    [janelas],
  );

  const resumoSemana = useMemo(() => {
    const diasComAtendimento = new Set<number>();
    let totalSlots = 0;

    for (const j of janelas) {
      const qtd = calcularQuantidadeSlots(
        j.hora_inicio,
        j.hora_fim,
        j.duracao_slot_min,
      );
      if (qtd > 0) {
        diasComAtendimento.add(j.dia_semana);
        totalSlots += qtd;
      }
    }

    return {
      diasAtivos: diasComAtendimento.size,
      totalSlots,
    };
  }, [janelas]);

  const adicionarJanela = (diaSemana: number) => {
    setSaveError(null);
    setSuccessMessage(null);

    if (janelas.length >= MAX_JANELAS_POR_GRADE) {
      setSaveError(
        `A grade pode conter no máximo ${MAX_JANELAS_POR_GRADE} janelas no total.`,
      );
      return;
    }

    const doDia = janelas
      .filter((j) => j.dia_semana === diaSemana)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    let horaInicio = '09:00';
    let horaFim = '17:00';
    let duracao = 60;

    if (doDia.length > 0) {
      const ultima = doDia[doDia.length - 1];
      duracao = ultima.duracao_slot_min || 60;
      const fimMin = converterHoraParaMinutos(ultima.hora_fim);
      if (fimMin !== null && fimMin < 23 * 60) {
        const novoIni = Math.min(fimMin + 60, 22 * 60);
        const novoFim = Math.min(novoIni + 240, 23 * 60);
        if (novoFim - novoIni >= duracao) {
          horaInicio = formatarMinutosParaHora(novoIni);
          horaFim = formatarMinutosParaHora(novoFim);
        }
      }
    }

    setJanelas((prev) => [
      ...prev,
      {
        localId: gerarLocalId(),
        dia_semana: diaSemana,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        duracao_slot_min: duracao,
      },
    ]);
  };

  const atualizarJanela = (
    localId: string,
    campo: 'hora_inicio' | 'hora_fim' | 'duracao_slot_min',
    valor: string | number,
  ) => {
    setSaveError(null);
    setSuccessMessage(null);
    setJanelas((prev) =>
      prev.map((j) => (j.localId === localId ? { ...j, [campo]: valor } : j)),
    );
  };

  const removerJanela = (localId: string) => {
    setSaveError(null);
    setSuccessMessage(null);
    setJanelas((prev) => prev.filter((j) => j.localId !== localId));
  };

  const copiarParaDiasUteis = (diaOrigem: number) => {
    setSaveError(null);
    setSuccessMessage(null);

    const origem = janelas.filter((j) => j.dia_semana === diaOrigem);
    if (origem.length === 0) return;

    const diasUteis = [0, 1, 2, 3, 4];
    const mantidas = janelas.filter(
      (j) => !diasUteis.includes(j.dia_semana) || j.dia_semana === diaOrigem,
    );

    const novas: JanelaEditor[] = [];
    for (const dia of diasUteis) {
      if (dia === diaOrigem) continue;
      for (const j of origem) {
        novas.push({
          localId: gerarLocalId(),
          dia_semana: dia,
          hora_inicio: j.hora_inicio,
          hora_fim: j.hora_fim,
          duracao_slot_min: j.duracao_slot_min,
        });
      }
    }

    const resultado = [...mantidas, ...novas];
    if (resultado.length > MAX_JANELAS_POR_GRADE) {
      setSaveError(
        `A cópia ultrapassaria o limite de ${MAX_JANELAS_POR_GRADE} janelas na semana.`,
      );
      return;
    }

    setJanelas(resultado);
  };

  const aplicarHorarioComercial = () => {
    setSaveError(null);
    setSuccessMessage(null);
    const padrao: JanelaEditor[] = [0, 1, 2, 3, 4].map((dia) => ({
      localId: gerarLocalId(),
      dia_semana: dia,
      hora_inicio: '08:00',
      hora_fim: '18:00',
      duracao_slot_min: 60,
    }));
    setJanelas(padrao);
  };

  const limparAgenda = () => {
    setSaveError(null);
    setSuccessMessage(null);
    setJanelas([]);
  };

  const handleSalvar = async () => {
    if (!token) return;
    setSaveError(null);
    setSuccessMessage(null);

    const erro = validarGradeDisponibilidade(janelas);
    if (erro) {
      setSaveError(erro);
      return;
    }

    const payload: DisponibilidadePayload[] = janelas.map((j) => ({
      dia_semana: j.dia_semana,
      hora_inicio: normalizarHoraCurta(j.hora_inicio),
      hora_fim: normalizarHoraCurta(j.hora_fim),
      duracao_slot_min: Number(j.duracao_slot_min),
    }));

    setIsSaving(true);
    try {
      const salva = await definirMinhaDisponibilidade(token, payload);
      const editaveis = mapearParaEditor(salva);
      setJanelas(editaveis);
      setAssinaturaSalva(serializarGrade(editaveis));
      setTotalSalvo(editaveis.length);
      setSuccessMessage(
        editaveis.length > 0
          ? 'Agenda salva com sucesso! Seus horários já estão disponíveis para os clientes.'
          : 'Agenda fechada com sucesso. Nenhum horário está aberto para novos agendamentos.',
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar sua grade de disponibilidade.';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Loading inicial de autenticação
  if (authLoading) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="h-10 w-64 bg-rental-surface2 rounded-xl animate-pulse" />
          <div className="h-24 bg-rental-surface2 rounded-2xl animate-pulse" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 bg-rental-surface2 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 2. Não autenticado ou não é profissional
  if (!isAuthenticated || !isProfessional) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Acesso Restrito ao Profissional
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Você precisa estar conectado à sua conta de profissional para
              configurar sua agenda e liberar horários para os clientes.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/entrar">
              <Button variant="primary" className="w-full">
                Entrar como Profissional
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
      <main className="flex-1 p-4 sm:p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-rental-border">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-rental-ink tracking-tight flex items-center gap-2.5">
                <Calendar className="h-7 w-7 text-rental-primary" />
                <span>Minha Agenda de Disponibilidade</span>
              </h1>
              <p className="text-xs sm:text-sm text-rental-muted">
                Defina os dias e horários da sua grade semanal para que clientes
                possam agendar atendimentos com você.
              </p>
            </div>
          </div>

        {/* Estado de erro de carregamento */}
        {loadError ? (
          <section
            role="alert"
            className="rounded-2xl border border-[var(--rs-error)]/40 bg-rental-surface p-8 text-center space-y-4 shadow-sm"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--rs-error)]/10 text-[var(--rs-error)]">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-rental-ink">
                Não foi possível carregar sua agenda
              </h2>
              <p className="text-xs sm:text-sm text-rental-muted">{loadError}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={carregarDisponibilidade}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Tentar novamente
            </Button>
          </section>
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="h-24 bg-rental-surface2 rounded-2xl animate-pulse" />
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 bg-rental-surface2 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Resumo do status atual da agenda */}
            <section className="rounded-2xl border border-rental-border bg-rental-surface p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    totalSalvo > 0
                      ? 'bg-[var(--rs-success)]/15 text-[var(--rs-success)]'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {totalSalvo > 0 ? (
                    <CalendarCheck2 className="h-5 w-5" />
                  ) : (
                    <CalendarOff className="h-5 w-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-rental-ink">
                      {totalSalvo > 0
                        ? 'Sua agenda está aberta para clientes'
                        : 'Sua agenda ainda está fechada'}
                    </h2>
                    {temAlteracoesPendentes && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Alterações não salvas
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-rental-muted">
                    {totalSalvo > 0
                      ? `Grade configurada: ${resumoSemana.diasAtivos} dia(s) com ${resumoSemana.totalSlots} horário(s) semanais.`
                      : 'Adicione pelo menos uma janela de horário abaixo e clique em "Salvar agenda" para liberar agendamentos.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={aplicarHorarioComercial}
                  leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  Padrão Seg–Sex (08h–18h)
                </Button>
                {janelas.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={limparAgenda}
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    className="text-rental-muted hover:text-[var(--rs-error)]"
                  >
                    Limpar tudo
                  </Button>
                )}
              </div>
            </section>

            {/* Feedbacks de sucesso ou erro */}
            {successMessage && (
              <div
                role="status"
                className="rounded-2xl border border-[var(--rs-success)]/40 bg-[var(--rs-success)]/10 p-4 text-xs sm:text-sm text-[var(--rs-success)] flex items-center gap-2.5"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="font-semibold">{successMessage}</span>
              </div>
            )}

            {(saveError || (temAlteracoesPendentes && erroValidacao)) && (
              <div
                role="alert"
                className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-4 text-xs sm:text-sm text-[var(--rs-error)] flex items-center gap-2.5"
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span className="font-semibold">
                  {saveError ?? erroValidacao}
                </span>
              </div>
            )}

            {/* Grade semanal por dia */}
            <section className="space-y-3" aria-label="Grade semanal de disponibilidade">
              {DIAS_SEMANA_PT.map(({ dia, nome }) => {
                const janelasDia = janelas
                  .filter((j) => j.dia_semana === dia)
                  .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

                const slotsDia = janelasDia.reduce(
                  (acc, j) =>
                    acc +
                    calcularQuantidadeSlots(
                      j.hora_inicio,
                      j.hora_fim,
                      j.duracao_slot_min,
                    ),
                  0,
                );

                return (
                  <div
                    key={dia}
                    className="rounded-2xl border border-rental-border bg-rental-surface p-4 sm:p-5 shadow-sm space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm sm:text-base font-extrabold text-rental-ink">
                          {nome}
                        </span>
                        {janelasDia.length > 0 ? (
                          <span className="rounded-full bg-rental-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-rental-primary">
                            {slotsDia} horário{slotsDia === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="rounded-full bg-rental-surface2 px-2.5 py-0.5 text-[11px] font-medium text-rental-muted">
                            Indisponível
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {janelasDia.length > 0 && dia <= 4 && (
                          <button
                            type="button"
                            onClick={() => copiarParaDiasUteis(dia)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rental-border px-2.5 py-1 text-[11px] font-semibold text-rental-muted transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
                            title="Aplicar estes mesmos horários de segunda a sexta-feira"
                          >
                            <Copy className="h-3 w-3" />
                            <span>Copiar para Seg–Sex</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => adicionarJanela(dia)}
                          className="inline-flex items-center gap-1 rounded-xl bg-rental-primary/10 px-3 py-1.5 text-xs font-bold text-rental-primary transition-colors hover:bg-rental-primary/20"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Adicionar horário</span>
                        </button>
                      </div>
                    </div>

                    {janelasDia.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        {janelasDia.map((janela) => {
                          const qtdSlots = calcularQuantidadeSlots(
                            janela.hora_inicio,
                            janela.hora_fim,
                            janela.duracao_slot_min,
                          );
                          const opcoesDuracao = DURACOES_PADRAO.includes(
                            janela.duracao_slot_min,
                          )
                            ? DURACOES_PADRAO
                            : [...DURACOES_PADRAO, janela.duracao_slot_min].sort(
                                (a, b) => a - b,
                              );

                          return (
                            <div
                              key={janela.localId}
                              className="flex flex-wrap items-end gap-3 rounded-xl border border-rental-border bg-rental-surface2/50 p-3"
                            >
                              <div className="flex flex-col gap-1">
                                <label
                                  htmlFor={`${janela.localId}-inicio`}
                                  className="text-[11px] font-semibold text-rental-muted"
                                >
                                  Início
                                </label>
                                <input
                                  id={`${janela.localId}-inicio`}
                                  type="time"
                                  value={janela.hora_inicio}
                                  onChange={(e) =>
                                    atualizarJanela(
                                      janela.localId,
                                      'hora_inicio',
                                      e.target.value,
                                    )
                                  }
                                  className="h-9 rounded-lg border border-rental-border bg-rental-surface px-2.5 text-xs font-semibold text-rental-ink focus:border-rental-primary focus:outline-none"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label
                                  htmlFor={`${janela.localId}-fim`}
                                  className="text-[11px] font-semibold text-rental-muted"
                                >
                                  Fim
                                </label>
                                <input
                                  id={`${janela.localId}-fim`}
                                  type="time"
                                  value={janela.hora_fim}
                                  onChange={(e) =>
                                    atualizarJanela(
                                      janela.localId,
                                      'hora_fim',
                                      e.target.value,
                                    )
                                  }
                                  className="h-9 rounded-lg border border-rental-border bg-rental-surface px-2.5 text-xs font-semibold text-rental-ink focus:border-rental-primary focus:outline-none"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label
                                  htmlFor={`${janela.localId}-duracao`}
                                  className="text-[11px] font-semibold text-rental-muted"
                                >
                                  Duração do slot
                                </label>
                                <select
                                  id={`${janela.localId}-duracao`}
                                  value={janela.duracao_slot_min}
                                  onChange={(e) =>
                                    atualizarJanela(
                                      janela.localId,
                                      'duracao_slot_min',
                                      Number(e.target.value),
                                    )
                                  }
                                  className="h-9 rounded-lg border border-rental-border bg-rental-surface px-2.5 text-xs font-semibold text-rental-ink focus:border-rental-primary focus:outline-none"
                                >
                                  {opcoesDuracao.map((min) => (
                                    <option key={min} value={min}>
                                      {min} min
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs text-rental-muted pb-2">
                                <Clock className="h-3.5 w-3.5 text-rental-primary" />
                                <span>
                                  {qtdSlots > 0
                                    ? `${qtdSlots} horário${qtdSlots === 1 ? '' : 's'} por dia`
                                    : 'Janela inválida'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => removerJanela(janela.localId)}
                                className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg border border-rental-border px-2.5 text-xs font-semibold text-rental-muted transition-colors hover:border-[var(--rs-error)]/40 hover:text-[var(--rs-error)]"
                                aria-label={`Remover janela de ${nome}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Remover</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {/* Barra de salvamento */}
            <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-rental-border bg-rental-surface/95 backdrop-blur-md p-4 shadow-panel">
              <div className="text-xs text-rental-muted">
                {janelas.length === 0
                  ? 'Nenhuma janela configurada. Salvar agora fechará sua agenda.'
                  : `${janelas.length} janela(s) na semana · ${resumoSemana.totalSlots} horário(s) disponíveis por semana.`}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={carregarDisponibilidade}
                  disabled={isSaving || isLoading}
                  className="flex-1 sm:flex-initial"
                >
                  Descartar
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSalvar}
                  isLoading={isSaving}
                  disabled={Boolean(erroValidacao) || !temAlteracoesPendentes}
                  leftIcon={<Save className="h-4 w-4" />}
                  className="flex-1 sm:flex-initial"
                >
                  Salvar agenda
                </Button>
              </div>
            </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
