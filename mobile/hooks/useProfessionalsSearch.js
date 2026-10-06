import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { filterProfessionalsIntelligent } from '../utils/searchMatching';

const BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

/**
 * Hook de busca de profissionais para React Native / Expo.
 * Trata os 3 estados fundamentais de UI, busca inteligente com tolerância
 * a erros ortográficos (estilo YouTube/Spotify) e insensibilidade a acentos.
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  q = '',
} = {}) {
  const [data, setData] = useState([]);
  const [detectedSuggestion, setDetectedSuggestion] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchProfessionals = useCallback(
    async (isPullToRefresh = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isPullToRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        let endpoint = `${BASE_URL}/api/professionals?limit=50`;
        if (specialty && specialty !== 'Todas') {
          endpoint += `&specialty=${encodeURIComponent(specialty)}`;
        }
        if (city && city.trim()) {
          endpoint += `&city=${encodeURIComponent(city.trim())}`;
        }
        if (q && q.trim()) {
          endpoint += `&q=${encodeURIComponent(q.trim())}`;
        }

        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Falha na API (${response.status})`);
        }

        const result = await response.json();

        // Motor de busca inteligente: acentos, aproximações (fuzzy), sinônimos e ranking
        const { results: list, detectedSuggestion: sugg } = filterProfessionalsIntelligent(result, {
          q,
          specialty,
          city,
        });

        setData(list);
        setDetectedSuggestion(sugg);
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setError(
          'Não foi possível carregar os profissionais. Verifique sua conexão com a internet.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [specialty, city, q]
  );

  useEffect(() => {
    fetchProfessionals();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProfessionals]);

  const refresh = () => fetchProfessionals(true);
  const retry = () => fetchProfessionals(false);
  const isEmpty = !isLoading && !error && data.length === 0;

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    isEmpty,
    detectedSuggestion,
    refresh,
    retry,
  };
}
