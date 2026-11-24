'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AvaliacaoPublicRead,
  ProfissionalAvaliacoesResumo,
} from '../types/avaliacoes';
import { ApiError, getAvaliacoesProfissional } from '../services/avaliacoes';

export interface UseAvaliacoesProfissionalOptions {
  professionalId: number | null;
  pageSize?: number;
  onResumoCarregado?: (resumo: ProfissionalAvaliacoesResumo) => void;
}

export interface UseAvaliacoesProfissionalResult {
  resumo: ProfissionalAvaliacoesResumo | null;
  items: AvaliacaoPublicRead[];
  filtroNota: number | null;
  setFiltroNota: (nota: number | null) => void;
  isLoading: boolean;
  isRetrying: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  isEmpty: boolean;
  isFilterEmpty: boolean;
  carregarMais: () => Promise<void>;
  retry: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook para consulta das avaliações, nota média, distribuição de 1 a 5 estrelas
 * e comentários públicos de um profissional (issue #21).
 *
 * Implementa os 3 estados obrigatórios (`AI_RULES.md` §2.2):
 * - `isLoading`: carregamento com skeleton;
 * - `error` + `retry`: tratamento de falha com botão de nova tentativa;
 * - `isEmpty` / `isFilterEmpty`: estado vazio global ou para o filtro selecionado.
 */
export function useAvaliacoesProfissional({
  professionalId,
  pageSize = 10,
  onResumoCarregado,
}: UseAvaliacoesProfissionalOptions): UseAvaliacoesProfissionalResult {
  const [resumo, setResumo] = useState<ProfissionalAvaliacoesResumo | null>(null);
  const [items, setItems] = useState<AvaliacaoPublicRead[]>([]);
  const [filtroNota, setFiltroNotaState] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const onResumoCarregadoRef = useRef(onResumoCarregado);

  useEffect(() => {
    onResumoCarregadoRef.current = onResumoCarregado;
  }, [onResumoCarregado]);

  // Reseta filtro quando troca de profissional
  useEffect(() => {
    setFiltroNotaState(null);
    setResumo(null);
    setItems([]);
    setError(null);
    setHasMore(false);
  }, [professionalId]);

  const fetchAvaliacoes = useCallback(
    async (notaFiltro: number | null) => {
      if (!professionalId) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const resultado = await getAvaliacoesProfissional(
          professionalId,
          {
            nota: notaFiltro,
            skip: 0,
            limit: pageSize,
          },
          controller.signal,
        );

        setResumo(resultado);
        setItems(resultado.items);
        setHasMore(resultado.items.length >= pageSize);
        setIsLoading(false);

        if (onResumoCarregadoRef.current) {
          onResumoCarregadoRef.current(resultado);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const mensagem =
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar as avaliações do profissional no momento. Verifique sua conexão e tente novamente.';
        setError(mensagem);
        setIsLoading(false);
      }
    },
    [professionalId, pageSize],
  );

  useEffect(() => {
    if (!professionalId) return;
    fetchAvaliacoes(filtroNota);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [professionalId, filtroNota, fetchAvaliacoes]);

  const setFiltroNota = useCallback((novaNota: number | null) => {
    setFiltroNotaState((atual) => (atual === novaNota ? null : novaNota));
  }, []);

  const carregarMais = useCallback(async () => {
    if (!professionalId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const resultado = await getAvaliacoesProfissional(professionalId, {
        nota: filtroNota,
        skip: items.length,
        limit: pageSize,
      });

      setItems((prev) => [...prev, ...resultado.items]);
      setHasMore(resultado.items.length >= pageSize);
    } catch (err: unknown) {
      const mensagem =
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar mais comentários.';
      setError(mensagem);
    } finally {
      setIsLoadingMore(false);
    }
  }, [professionalId, filtroNota, items.length, pageSize, isLoadingMore, hasMore]);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    await fetchAvaliacoes(filtroNota);
    setIsRetrying(false);
  }, [fetchAvaliacoes, filtroNota]);

  const refetch = useCallback(async () => {
    await fetchAvaliacoes(filtroNota);
  }, [fetchAvaliacoes, filtroNota]);

  const isEmpty =
    !isLoading &&
    !error &&
    resumo !== null &&
    resumo.total_avaliacoes === 0;

  const isFilterEmpty =
    !isLoading &&
    !error &&
    resumo !== null &&
    resumo.total_avaliacoes > 0 &&
    items.length === 0;

  return {
    resumo,
    items,
    filtroNota,
    setFiltroNota,
    isLoading,
    isRetrying,
    isLoadingMore,
    hasMore,
    error,
    isEmpty,
    isFilterEmpty,
    carregarMais,
    retry,
    refetch,
  };
}
