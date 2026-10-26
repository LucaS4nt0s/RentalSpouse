'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  AgendaDia,
  AgendaSlot,
  Agendamento,
  ApiError,
  consultarAgendaProfissional,
  criarAgendamento,
  listarMeusAgendamentos,
  obterProfissionalPorId,
} from '../services/agenda';
import { Professional } from '../types/professional';

const JANELA_DIAS = 30;

function formatarIsoDataUTC(data: Date): string {
  const yyyy = data.getUTCFullYear();
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(data.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function obterJanela30Dias(): { dataInicio: string; dataFim: string } {
  const hoje = new Date();
  const fim = new Date(hoje);
  fim.setUTCDate(hoje.getUTCDate() + (JANELA_DIAS - 1));
  return {
    dataInicio: formatarIsoDataUTC(hoje),
    dataFim: formatarIsoDataUTC(fim),
  };
}

export function useAgenda(professionalId: number) {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const ehCliente = user?.tipo === 'cliente' || user?.role === 'client';

  const [profissional, setProfissional] = useState<Professional | null>(null);
  const [dias, setDias] = useState<AgendaDia[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [slotSelecionado, setSlotSelecionado] = useState<AgendaSlot | null>(
    null,
  );

  // Estados obrigatórios de carregamento da grade (.cursorrules §2.2)
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Estados da confirmação (POST /api/agendamentos)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflito409, setConflito409] = useState<string | null>(null);
  const [agendamentoCriado, setAgendamentoCriado] =
    useState<Agendamento | null>(null);

  // Lista de "Meus agendamentos" (GET /api/agendamentos/meus)
  const [meusAgendamentos, setMeusAgendamentos] = useState<Agendamento[]>([]);
  const [nomesProfissionais, setNomesProfissionais] = useState<
    Record<number, string>
  >({});
  const [loadingMeus, setLoadingMeus] = useState<boolean>(false);
  const [erroMeus, setErroMeus] = useState<string | null>(null);

  const recarregarAgenda = useCallback(
    async (silencioso = false) => {
      if (!Number.isFinite(professionalId) || professionalId <= 0) {
        setError('Identificador de profissional inválido.');
        setIsLoading(false);
        return;
      }

      try {
        if (silencioso) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const { dataInicio, dataFim } = obterJanela30Dias();
        const [agendaResp, profResp] = await Promise.all([
          consultarAgendaProfissional(professionalId, dataInicio, dataFim),
          obterProfissionalPorId(professionalId).catch(() => null),
        ]);

        if (profResp) {
          setProfissional(profResp);
          setNomesProfissionais((prev) => ({
            ...prev,
            [profResp.id]: profResp.name,
          }));
        }
        setDias(agendaResp);

        setDiaSelecionado((diaAnterior) => {
          const mantendoAtual = agendaResp.find(
            (d) =>
              d.data === diaAnterior &&
              d.slots.some((slot) => slot.disponivel),
          );
          if (mantendoAtual) {
            return mantendoAtual.data;
          }
          const primeiroComHorarios = agendaResp.find((d) =>
            d.slots.some((slot) => slot.disponivel),
          );
          return primeiroComHorarios?.data ?? agendaResp[0]?.data ?? null;
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar a agenda do profissional.';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [professionalId],
  );

  useEffect(() => {
    recarregarAgenda(false);
  }, [recarregarAgenda]);

  /** `true` quando o profissional não possui nenhum horário disponível em toda a janela de 30 dias. */
  const agendaVazia = useMemo(
    () =>
      !isLoading &&
      !error &&
      dias.every((dia) => dia.slots.every((slot) => !slot.disponivel)),
    [dias, isLoading, error],
  );

  const diaAtual = useMemo(
    () => dias.find((d) => d.data === diaSelecionado) ?? null,
    [dias, diaSelecionado],
  );

  const selecionarDia = useCallback((dataIso: string) => {
    setDiaSelecionado(dataIso);
    setSlotSelecionado(null);
    setSubmitError(null);
    setConflito409(null);
  }, []);

  const selecionarSlot = useCallback((slot: AgendaSlot) => {
    if (!slot.disponivel) return;
    setSlotSelecionado(slot);
    setSubmitError(null);
    setConflito409(null);
  }, []);

  const confirmarAgendamento = useCallback(async (): Promise<boolean> => {
    if (!slotSelecionado) {
      setSubmitError('Selecione um horário disponível antes de confirmar.');
      return false;
    }
    if (!token || !isAuthenticated) {
      setSubmitError('Entre na sua conta de cliente para confirmar o agendamento.');
      return false;
    }
    if (!ehCliente) {
      setSubmitError('Apenas contas de cliente podem reservar horários na agenda.');
      return false;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setConflito409(null);

      const criado = await criarAgendamento(token, {
        professional_id: professionalId,
        data_hora_inicio: slotSelecionado.data_hora_inicio,
      });

      setAgendamentoCriado(criado);
      await recarregarAgenda(true);
      return true;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflito409(
          err.message ||
            'Este horário acabou de ser ocupado. Atualizamos a grade para você escolher outro horário.',
        );
        setSlotSelecionado(null);
        await recarregarAgenda(true);
        return false;
      }

      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar o agendamento. Tente novamente.',
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    slotSelecionado,
    token,
    isAuthenticated,
    ehCliente,
    professionalId,
    recarregarAgenda,
  ]);

  const carregarMeusAgendamentos = useCallback(async () => {
    if (!token || !isAuthenticated || !ehCliente) {
      setMeusAgendamentos([]);
      return;
    }

    try {
      setLoadingMeus(true);
      setErroMeus(null);
      const lista = await listarMeusAgendamentos(token);
      setMeusAgendamentos(lista);

      const idsUnicos = Array.from(
        new Set(lista.map((ag) => ag.professional_id)),
      );
      const pares = await Promise.all(
        idsUnicos.map(async (id) => {
          if (profissional && profissional.id === id) {
            return [id, profissional.name] as const;
          }
          const p = await obterProfissionalPorId(id).catch(() => null);
          return p ? ([id, p.name] as const) : null;
        }),
      );
      setNomesProfissionais((prev) => {
        const proximo = { ...prev };
        for (const par of pares) {
          if (par) proximo[par[0]] = par[1];
        }
        return proximo;
      });
    } catch (err: unknown) {
      setErroMeus(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar seus agendamentos.',
      );
    } finally {
      setLoadingMeus(false);
    }
  }, [token, isAuthenticated, ehCliente, profissional]);

  const iniciarNovoAgendamento = useCallback(() => {
    setAgendamentoCriado(null);
    setSlotSelecionado(null);
    setSubmitError(null);
    setConflito409(null);
  }, []);

  return {
    user,
    isAuthenticated,
    authLoading,
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
  };
}
