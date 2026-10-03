'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Professional } from '../types/professional';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UseProfessionalsSearchOptions {
  specialty?: string;
  city?: string;
  q?: string;
}

export interface UseProfessionalsSearchResult {
  data: Professional[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  refetch: () => void;
  retry: () => void;
}

/**
 * Hook central de busca de profissionais no RentalSpouse.
 * Implementa com rigor os 3 estados obrigatórios (Loading, Error com Retry, Success/Empty).
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  q = '',
}: UseProfessionalsSearchOptions): UseProfessionalsSearchResult {
  const [data, setData] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
      if (city && city.trim()) {
        url.searchParams.set('city', city.trim());
      }
      url.searchParams.set('limit', '50');

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

      // Filtro de texto refinado no cliente (q) por nome, especialidades ou biografia
      let filtered = Array.isArray(result) ? result : [];
      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        filtered = filtered.filter((p) => {
          const matchName = p.name?.toLowerCase().includes(queryTerm);
          const matchBio = p.bio?.toLowerCase().includes(queryTerm);
          const matchSpecialty = p.specialties?.some((s) =>
            s.toLowerCase().includes(queryTerm)
          );
          const matchCity = p.city?.toLowerCase().includes(queryTerm);
          return matchName || matchBio || matchSpecialty || matchCity;
        });
      }

      setData(filtered);
      setIsLoading(false);
    } catch (err: unknown) {
      // Ignora erro de abort proposital ao digitar ou trocar filtro rapidamente
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

  const isEmpty = !isLoading && !error && data.length === 0;

  return {
    data,
    isLoading,
    error,
    isEmpty,
    refetch: fetchData,
    retry: fetchData,
  };
}
