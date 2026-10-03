import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

const BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

/**
 * Hook de busca de profissionais para React Native / Expo.
 * Trata rigorosamente os 3 estados fundamentais de UI: Loading, Error (com Retry) e Data/Empty.
 */
export function useProfessionalsSearch({
  specialty = '',
  city = '',
  q = '',
  radius = null,
} = {}) {
  const [data, setData] = useState([]);
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
        let list = Array.isArray(result) ? result : [];

        // Filtro textual no cliente por nome, especialidades ou biografia
        if (q && q.trim()) {
          const query = q.trim().toLowerCase();
          list = list.filter((p) => {
            const nameMatch = p.name?.toLowerCase().includes(query);
            const bioMatch = p.bio?.toLowerCase().includes(query);
            const specMatch = p.specialties?.some((s) =>
              s.toLowerCase().includes(query)
            );
            const cityMatch = p.city?.toLowerCase().includes(query);
            return nameMatch || bioMatch || specMatch || cityMatch;
          });
        }

        // Filtro opcional de raio de atendimento
        if (radius && Number(radius) > 0) {
          const maxR = Number(radius);
          list = list.filter((p) => (p.service_radius_km || 0) <= maxR);
        }

        setData(list);
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
    [specialty, city, q, radius]
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
    refresh,
    retry,
  };
}
