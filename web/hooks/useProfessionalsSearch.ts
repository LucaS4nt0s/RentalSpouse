'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Professional } from '../types/professional';
import { cleanText } from '../utils/searchMatching';
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
 * Consulta `specialty`, `state`, `q` e `order_by` no backend e aplica cidade e distância
 * instantaneamente em memória para zero latência ao digitar ou deslizar a barra.
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  state = '',
  q = '',
  radius = '',
  orderBy = '',
}: UseProfessionalsSearchOptions): UseProfessionalsSearchResult {
  const [rawItems, setRawItems] = useState<Professional[]>([]);
  const [detectedSuggestion, setDetectedSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
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
        state,
        q,
        orderBy,
        approvalStatus: 'approved',
        limit: 50,
      });

      const token =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('rentalspouse_token')
          : null;

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(requestUrl, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `Falha ao consultar profissionais (status ${response.status})`
        );
      }

      const payload: PaginatedProfessionalsResponse | Professional[] = await response.json();

      if (Array.isArray(payload)) {
        setRawItems(payload);
        setDetectedSuggestion(null);
      } else {
        const items = Array.isArray(payload.items) ? payload.items : [];
        setRawItems(items);
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
  }, [specialty, state, q, orderBy]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  // ponytail: filtro instantâneo em memória para cidade/distância sobre a página (limit=50); mover para SQL se > 50 ativos
  const data = useMemo(() => {
    let items = rawItems;
    const normCity = cleanText(city);
    if (normCity) {
      items = items.filter((p) => cleanText(p.city).includes(normCity));
    }

    if (/^\d+$/.test(radius)) {
      const maxKm = Number(radius);
      items = items.filter((p) => typeof p.distance_km === 'number' && p.distance_km <= maxKm);
      if (!orderBy) {
        items = [...items].sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      }
    } else if (radius === 'max_10') {
      items = items.filter((p) => p.service_radius_km <= 10);
    } else if (radius === 'min_10') {
      items = items.filter((p) => p.service_radius_km >= 10);
    } else if (radius === 'min_25') {
      items = items.filter((p) => p.service_radius_km >= 25);
    } else if (radius === 'min_50') {
      items = items.filter((p) => p.service_radius_km >= 50);
    }

    return items;
  }, [rawItems, city, radius, orderBy]);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    await fetchData();
    setIsRetrying(false);
  }, [fetchData]);

  const isEmpty = !isLoading && !error && data.length === 0;

  return {
    data,
    total: data.length,
    isLoading,
    isRetrying,
    error,
    isEmpty,
    detectedSuggestion,
    refetch: fetchData,
    retry,
  };
}

