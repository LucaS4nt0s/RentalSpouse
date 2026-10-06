'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Professional } from '../types/professional';
import { filterProfessionalsIntelligent } from '../utils/searchMatching';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UseProfessionalsSearchOptions {
  specialty?: string;
  city?: string;
  q?: string;
}

export interface UseProfessionalsSearchResult {
  data: Professional[];
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  isEmpty: boolean;
  detectedSuggestion: string | null;
  refetch: () => void;
  retry: () => void;
}

/**
 * Hook central de busca de profissionais no RentalSpouse.
 * Implementa com rigor os 3 estados obrigatórios e busca inteligente com tolerância
 * a erros ortográficos (estilo YouTube/Spotify) e insensibilidade a acentos.
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  q = '',
}: UseProfessionalsSearchOptions): UseProfessionalsSearchResult {
  const [data, setData] = useState<Professional[]>([]);
  const [detectedSuggestion, setDetectedSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Cancela requisição anterior em andamento
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(`${API_BASE_URL}/api/professionals`);
      if (specialty && specialty !== 'Todas') {
        url.searchParams.set('specialty', specialty);
      }
      url.searchParams.set('approval_status', 'approved');
      url.searchParams.set('limit', '100');

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Falha ao consultar profissionais (status ${response.status})`
        );
      }

      const result: Professional[] = await response.json();

      // Motor de busca inteligente: acentos, aproximações (fuzzy), sinônimos e ranking
      const { results: filtered, detectedSuggestion: sugg } = filterProfessionalsIntelligent(
        result,
        { q, specialty, city }
      );

      setData(filtered);
      setDetectedSuggestion(sugg);
      setIsLoading(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(
        'Não foi possível carregar a lista de profissionais no momento. Verifique sua conexão com a internet.'
      );
      setIsLoading(false);
    }
  }, [specialty, city, q]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    await fetchData();
    setIsRetrying(false);
  }, [fetchData]);

  const isEmpty = !isLoading && !error && data.length === 0;

  return {
    data,
    isLoading,
    isRetrying,
    error,
    isEmpty,
    detectedSuggestion,
    refetch: fetchData,
    retry,
  };
}

