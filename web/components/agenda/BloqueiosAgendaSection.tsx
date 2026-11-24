'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  BloqueioAgenda,
  MOTIVO_BLOQUEIO_MAX_CHARS,
  criarBloqueioAgenda,
  formatarPeriodoBloqueio,
  listarMeusBloqueios,
  montarPayloadBloqueio,
  removerBloqueioAgenda,
  somarDiasDataIso,
} from '../../services/bloqueios';
import { mensagemErro } from '../../services/apiError';

export interface BloqueiosAgendaSectionProps {
  token: string;
  /** Callback opcional acionado após criar ou remover um bloqueio com sucesso. */
  onBloqueiosAtualizados?: (bloqueios: BloqueioAgenda[]) => void;
}

const MOTIVOS_SUGERIDOS = [
  'Folga',
  'Feriado',
  'Compromisso médico',
  'Compromisso pessoal',
] as const;

function obterDataHojeIso(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Seção completa para gerenciar bloqueios pontuais (folgas, feriados ou faixas
 * horárias indisponíveis) na agenda do profissional (issue #16).
 *
 * Projetada para funcionar tanto em `/profissional/bloqueios` quanto embutida
 * na tela de configuração de agenda (`/profissional/agenda`).
 */
export const BloqueiosAgendaSection: React.FC<BloqueiosAgendaSectionProps> = ({
  token,
  onBloqueiosAtualizados,
}) => {
  const hojeIso = useMemo(() => obterDataHojeIso(), []);
  const amanhaIso = useMemo(() => somarDiasDataIso(hojeIso, 1), [hojeIso]);

  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado do formulário de criação
  const [data, setData] = useState<string>(amanhaIso);
  const [diaInteiro, setDiaInteiro] = useState<boolean>(true);
  const [horaInicio, setHoraInicio] = useState<string>('09:00');
  const [horaFim, setHoraFim] = useState<string>('12:00');
  const [motivo, setMotivo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado de remoção por ID
  const [removingId, setRemovingId] = useState<number | null>(null);

  const carregarBloqueios = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const lista = await listarMeusBloqueios(token);
      setBloqueios(lista);
      onBloqueiosAtualizados?.(lista);
    } catch (err: unknown) {
      const msg = mensagemErro(err, 'Não foi possível carregar seus bloqueios de agenda.');
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, onBloqueiosAtualizados]);

  useEffect(() => {
    carregarBloqueios();
  }, [carregarBloqueios]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await carregarBloqueios();
    setIsRetrying(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const validacao = montarPayloadBloqueio({
      data,
      diaInteiro,
      horaInicio,
      horaFim,
      motivo,
    });

    if (!validacao.ok) {
      setFormError(validacao.erro);
      return;
    }

    setIsSubmitting(true);
    try {
      const criado = await criarBloqueioAgenda(token, validacao.payload);
      const atualizados = [...bloqueios, criado].sort((a, b) =>
        a.data_hora_inicio.localeCompare(b.data_hora_inicio),
      );
      setBloqueios(atualizados);
      onBloqueiosAtualizados?.(atualizados);
      setMotivo('');
      setSuccessMessage(
        'Bloqueio registrado! Os horários selecionados já foram ocultados da sua agenda pública.',
      );
    } catch (err: unknown) {
      const msg = mensagemErro(err, 'Não foi possível criar o bloqueio de agenda.');
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemover = async (bloqueioId: number) => {
    setRemovingId(bloqueioId);
    setFormError(null);
    setSuccessMessage(null);
    try {
      await removerBloqueioAgenda(token, bloqueioId);
      const atualizados = bloqueios.filter((b) => b.id !== bloqueioId);
      setBloqueios(atualizados);
      onBloqueiosAtualizados?.(atualizados);
      setSuccessMessage(
        'Bloqueio removido! Os horários correspondentes voltaram a ficar disponíveis conforme sua grade semanal.',
      );
    } catch (err: unknown) {
      const msg = mensagemErro(err, 'Não foi possível remover o bloqueio.');
      setFormError(msg);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section
      aria-labelledby="bloqueios-agenda-heading"
      className="space-y-6"
    >
      {/* Card de Cadastro de Novo Bloqueio */}
      <div className="rounded-3xl border border-rental-border bg-rental-surface p-6 shadow-panel space-y-5">
        <div className="flex items-start gap-3">
          <div>
            <h2
              id="bloqueios-agenda-heading"
              className="text-base sm:text-lg font-extrabold text-rental-ink"
            >
              Bloquear Folga ou Horário Pontual
            </h2>
            <p className="text-xs sm:text-sm text-rental-muted mt-0.5 leading-relaxed">
              Sinalize dias inteiros de folga, feriados ou faixas específicas de horário sem
              precisar alterar sua grade semanal fixa.
            </p>
          </div>
        </div>

        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 animate-fadeIn"
          >
            <span>{successMessage}</span>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs sm:text-sm text-rose-700 dark:text-rose-300 animate-fadeIn"
          >
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {/* Data */}
            <div className="space-y-1.5">
              <label
                htmlFor="bloqueio-data"
                className="block text-xs font-bold text-rental-ink"
              >
                Data do bloqueio <span className="text-rose-500">*</span>
              </label>
              <input
                id="bloqueio-data"
                type="date"
                min={hojeIso}
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  if (formError) setFormError(null);
                }}
                required
                disabled={isSubmitting}
                className="w-full rounded-xl glass-input px-3.5 py-2.5 text-xs sm:text-sm text-rental-ink focus:outline-none focus:ring-2 focus:ring-rental-primary/40 disabled:opacity-50"
              />
            </div>

            {/* Checkbox Dia Inteiro */}
            <div className="flex items-center h-10 sm:h-[42px]">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={diaInteiro}
                  onChange={(e) => {
                    setDiaInteiro(e.target.checked);
                    if (formError) setFormError(null);
                  }}
                  disabled={isSubmitting}
                  className="h-4 w-4 rounded border-rental-border text-rental-primary focus:ring-rental-primary"
                />
                <span className="text-xs sm:text-sm font-semibold text-rental-ink">
                  Dia inteiro
                </span>
              </label>
            </div>

            {/* Faixa Horária (quando não for dia inteiro) */}
            {!diaInteiro && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="bloqueio-hora-inicio"
                    className="block text-xs font-bold text-rental-ink"
                  >
                    Hora de início <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="bloqueio-hora-inicio"
                    type="time"
                    value={horaInicio}
                    onChange={(e) => {
                      setHoraInicio(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required={!diaInteiro}
                    disabled={isSubmitting}
                    className="w-full rounded-xl glass-input px-3.5 py-2.5 text-xs sm:text-sm text-rental-ink focus:outline-none focus:ring-2 focus:ring-rental-primary/40 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="bloqueio-hora-fim"
                    className="block text-xs font-bold text-rental-ink"
                  >
                    Hora de término <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="bloqueio-hora-fim"
                    type="time"
                    value={horaFim}
                    onChange={(e) => {
                      setHoraFim(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required={!diaInteiro}
                    disabled={isSubmitting}
                    className="w-full rounded-xl glass-input px-3.5 py-2.5 text-xs sm:text-sm text-rental-ink focus:outline-none focus:ring-2 focus:ring-rental-primary/40 disabled:opacity-50"
                  />
                </div>
              </>
            )}
          </div>

          {/* Motivo Opcional */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="bloqueio-motivo"
                className="text-xs font-bold text-rental-ink"
              >
                Motivo (opcional)
              </label>
              <span className="text-[11px] text-rental-muted">
                {motivo.length} / {MOTIVO_BLOQUEIO_MAX_CHARS}
              </span>
            </div>
            <input
              id="bloqueio-motivo"
              type="text"
              maxLength={MOTIVO_BLOQUEIO_MAX_CHARS}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex.: Feriado, Consulta médica, Folga programada..."
              className="w-full rounded-xl glass-input px-3.5 py-2.5 text-xs sm:text-sm text-rental-ink placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_SUGERIDOS.map((sugestao) => (
                <button
                  key={sugestao}
                  type="button"
                  onClick={() => setMotivo(sugestao)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-rental-border bg-rental-surface2 px-2.5 py-1 text-[11px] font-medium text-rental-muted hover:border-rental-primary/40 hover:text-rental-primary transition-colors"
                >
                  {sugestao}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Salvando bloqueio...</span>
                </>
              ) : (
                <>
                  <span>Adicionar bloqueio</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Bloqueios Ativos (3 estados obrigatórios: Loading, Error com Retry, Empty/Success) */}
      <div className="rounded-3xl border border-rental-border bg-rental-surface p-6 shadow-panel space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-rental-ink">
              Bloqueios e Folgas Ativos
            </h3>
            <p className="text-xs text-rental-muted">
              Os horários listados abaixo não são exibidos para agendamento pelos clientes.
            </p>
          </div>
          {!isLoading && !loadError && (
            <span className="rounded-full bg-rental-surface2 border border-rental-border px-3 py-1 text-xs font-bold text-rental-ink">
              {bloqueios.length} {bloqueios.length === 1 ? 'bloqueio' : 'bloqueios'}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Carregando bloqueios ativos">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-16 w-full rounded-2xl bg-rental-surface2 animate-pulse"
              />
            ))}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center space-y-3"
          >
            <p className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300">
              {loadError}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rental-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Tentando novamente...' : 'Tentar novamente'}</span>
            </button>
          </div>
        ) : bloqueios.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rental-border bg-rental-surface2/30 p-7 text-center space-y-2">
            <CalendarOff className="mx-auto h-7 w-7 text-rental-muted/70" />
            <p className="text-xs sm:text-sm font-bold text-rental-ink">
              Nenhum bloqueio futuro cadastrado
            </p>
            <p className="text-xs text-rental-muted max-w-md mx-auto">
              Sua agenda segue normalmente a sua grade semanal. Use o formulário acima sempre que
              precisar reservar uma folga ou bloquear horários específicos.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5" aria-label="Lista de bloqueios ativos">
            {bloqueios.map((bloqueio) => {
              const periodo = formatarPeriodoBloqueio(bloqueio);
              const removendo = removingId === bloqueio.id;

              return (
                <li
                  key={bloqueio.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rental-border bg-rental-surface2/40 p-4 transition-colors hover:border-rental-primary/30"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {periodo.diaInteiro ? (
                        <CalendarOff className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-rental-ink">
                          {periodo.tituloData}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            periodo.diaInteiro
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-rental-primary/15 text-rental-primary'
                          }`}
                        >
                          {periodo.faixaHorario}
                        </span>
                      </div>
                      <p className="text-xs text-rental-muted truncate">
                        {bloqueio.motivo || 'Sem motivo informado'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemover(bloqueio.id)}
                    disabled={removendo}
                    aria-label={`Remover bloqueio de ${periodo.tituloData}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rental-border px-3.5 py-2 text-xs font-semibold text-rental-muted hover:border-rose-500/40 hover:text-rose-500 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {removendo ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Removendo...</span>
                      </>
                    ) : (
                      <>
                        <span>Remover</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
