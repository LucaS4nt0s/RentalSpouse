'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  User,
} from 'lucide-react';
import {
  AgendamentoRecebido,
  AgendamentoStatus,
  concluirAgendamento,
  extrairDataIso,
  extrairHoraCurta,
  formatarDataCompleta,
  listarAgendamentosRecebidos,
} from '../../services/agenda';

export interface AgendamentosRecebidosSectionProps {
  token: string;
}

type FiltroStatus = 'todos' | AgendamentoStatus;

const FILTROS: Array<{ valor: FiltroStatus; label: string }> = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'agendado', label: 'Agendados' },
  { valor: 'concluido', label: 'Concluídos' },
  { valor: 'cancelado', label: 'Cancelados' },
];

export function AgendamentosRecebidosSection({
  token,
}: AgendamentosRecebidosSectionProps) {
  const [agendamentos, setAgendamentos] = useState<AgendamentoRecebido[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [concluindoId, setConcluindoId] = useState<number | null>(null);
  const [acaoErro, setAcaoErro] = useState<string | null>(null);
  const [acaoSucesso, setAcaoSucesso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const statusParam = filtroStatus === 'todos' ? undefined : filtroStatus;
      const lista = await listarAgendamentosRecebidos(token, statusParam);
      setAgendamentos(lista);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os agendamentos recebidos.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token, filtroStatus]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleConcluir = async (agendamentoId: number) => {
    try {
      setConcluindoId(agendamentoId);
      setAcaoErro(null);
      setAcaoSucesso(null);
      const atualizado = await concluirAgendamento(token, agendamentoId);
      setAgendamentos((prev) => {
        const atualizados = prev.map((ag) =>
          ag.id === agendamentoId ? { ...ag, ...atualizado } : ag,
        );
        if (filtroStatus !== 'todos' && atualizado.status !== filtroStatus) {
          return atualizados.filter((ag) => ag.id !== agendamentoId);
        }
        return atualizados;
      });
      setAcaoSucesso(`Atendimento #${agendamentoId} marcado como concluído.`);
    } catch (err: unknown) {
      setAcaoErro(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o atendimento.',
      );
    } finally {
      setConcluindoId(null);
    }
  };

  return (
    <section
      aria-labelledby="agendamentos-recebidos-title"
      className="rounded-2xl border border-rental-border bg-rental-surface p-5 sm:p-6 shadow-panel space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rental-primary/10 text-rental-primary">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div>
            <h2
              id="agendamentos-recebidos-title"
              className="text-base font-extrabold text-rental-ink"
            >
              Agendamentos recebidos
            </h2>
            <p className="text-xs text-rental-muted">
              Acompanhe os atendimentos marcados por clientes e conclua os serviços realizados.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:bg-rental-surface2 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = filtroStatus === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              onClick={() => {
                setFiltroStatus(f.valor);
                setAcaoSucesso(null);
                setAcaoErro(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                ativo
                  ? 'bg-rental-primary text-[var(--rs-primary-text)]'
                  : 'border border-rental-border bg-rental-surface2/60 text-rental-muted hover:text-rental-ink'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Banners de feedback de ação */}
      {acaoSucesso && (
        <div className="flex items-center gap-2 rounded-xl border border-rental-success/30 bg-rental-success/10 p-3 text-xs text-rental-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{acaoSucesso}</span>
        </div>
      )}

      {acaoErro && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{acaoErro}</span>
        </div>
      )}

      {/* Estados obrigatórios: Loading, Error, Empty/Success */}
      {isLoading ? (
        <div className="space-y-2.5" aria-busy="true">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-16 animate-pulse rounded-xl border border-rental-border bg-rental-surface2/50"
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-4 text-xs text-[var(--rs-error)]">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={carregar}
            className="font-bold text-rental-primary hover:underline self-start sm:self-auto"
          >
            Tentar novamente
          </button>
        </div>
      ) : agendamentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rental-border bg-rental-surface2/30 p-6 text-center text-xs text-rental-muted">
          Nenhum agendamento encontrado para este filtro.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {agendamentos.map((ag) => {
            const dataIso = extrairDataIso(ag.data_hora_inicio);
            const hIni = extrairHoraCurta(ag.data_hora_inicio);
            const hFim = extrairHoraCurta(ag.data_hora_fim);
            const emConclusao = concluindoId === ag.id;

            return (
              <li
                key={ag.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-rental-border bg-rental-surface2/50 p-4 text-xs sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-rental-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold capitalize text-rental-ink">
                      {formatarDataCompleta(dataIso)} · {hIni} às {hFim}
                    </p>
                    <p className="flex items-center gap-1.5 text-rental-muted">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {ag.cliente_nome || `Cliente #${ag.cliente_id}`} · Reserva #{ag.id}
                      </span>
                    </p>
                    {ag.status === 'cancelado' && ag.motivo_cancelamento && (
                      <p className="text-[11px] italic text-rental-muted">
                        Motivo do cancelamento: {ag.motivo_cancelamento}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                      ag.status === 'cancelado'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                        : ag.status === 'concluido'
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'bg-rental-success/15 text-rental-success'
                    }`}
                  >
                    {ag.status}
                  </span>

                  {ag.status === 'agendado' && (
                    <button
                      type="button"
                      onClick={() => handleConcluir(ag.id)}
                      disabled={emConclusao}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rental-primary px-3 py-1.5 text-xs font-bold text-[var(--rs-primary-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {emConclusao ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Concluindo...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Concluir atendimento</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
