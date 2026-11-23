'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Professional } from '../types/professional';
import {
  RadiusFilterValue,
  SortOrderValue,
  buildProfessionalsSearchUrl,
} from '../lib/professionalsSearchQuery';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UseProfessionalsSearchOptions {
  specialty?: string;
  city?: string;
  state?: string;
  q?: string;
  radius?: RadiusFilterValue;
  orderBy?: SortOrderValue;
}

export interface UseProfessionalsSearchResult {
  data: Professional[];
  total: number;
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  isEmpty: boolean;
  detectedSuggestion: string | null;
  refetch: () => void;
  retry: () => void;
}

interface PaginatedProfessionalsResponse {
  items: Professional[];
  total: number;
  detected_suggestion?: string | null;
}

/**
 * Hook central de busca de profissionais no RentalSpouse.
 * Envia todos os filtros ativos (`q`, `specialty`, `city`, `state`, `min_radius_km` /
 * `max_radius_km` e `order_by`) diretamente ao motor de busca do backend e trata os
 * 3 estados obrigatórios (loading, error com retry e success/empty).
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  state = '',
  q = '',
  radius = '',
  orderBy = '',
}: UseProfessionalsSearchOptions): UseProfessionalsSearchResult {
  const [data, setData] = useState<Professional[]>([]);
  const [total, setTotal] = useState<number>(0);
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
      const requestUrl = buildProfessionalsSearchUrl(API_BASE_URL, {
        specialty,
        city,
        state,
        q,
        radius,
        orderBy,
        approvalStatus: 'approved',
        limit: 50,
      });

      const response = await fetch(requestUrl, {
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

      const payload: PaginatedProfessionalsResponse | Professional[] = await response.json();

      if (Array.isArray(payload)) {
        setData(payload);
        setTotal(payload.length);
        setDetectedSuggestion(null);
      } else {
        const items = Array.isArray(payload.items) ? payload.items : [];
        setData(items);
        setTotal(typeof payload.total === 'number' ? payload.total : items.length);
        setDetectedSuggestion(payload.detected_suggestion ?? null);
      }
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
  }, [specialty, city, state, q, radius, orderBy]);

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
    total,
    isLoading,
    isRetrying,
    error,
    isEmpty,
    detectedSuggestion,
    refetch: fetchData,
    retry,
  };
}

