'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';
import {
  RadiusFilterValue,
  SortOrderValue,
  parseRadiusFilter,
  parseSortOrder,
} from '../lib/professionalsSearchQuery';

export interface UrlFilters {
  specialty: string;
  city: string;
  state: string;
  q: string;
  radius: RadiusFilterValue;
  orderBy: SortOrderValue;
  setSpecialty: (specialty: string) => void;
  setCity: (city: string) => void;
  setState: (state: string) => void;
  setQ: (q: string) => void;
  setRadius: (radius: RadiusFilterValue) => void;
  setOrderBy: (orderBy: SortOrderValue) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Hook para leitura e sincronização bidirecional de filtros com a URL (Next.js App Router).
 * Utiliza referências estáveis de callbacks para evitar re-execução desnecessária
 * de effects e múltiplos calls de router.replace.
 */
export function useUrlFilters(): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const pendingParamsRef = useRef<URLSearchParams>(new URLSearchParams(searchParamsString));
  pendingParamsRef.current = new URLSearchParams(searchParamsString);

  const specialty = searchParams.get('specialty') || '';
  const city = searchParams.get('city') || '';
  const state = searchParams.get('state') || '';
  const q = searchParams.get('q') || '';
  const radius = parseRadiusFilter(searchParams.get('radius'));
  const orderBy = parseSortOrder(searchParams.get('order_by'));

  const specialtyRef = useRef(specialty);
  specialtyRef.current = specialty;

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const current = pendingParamsRef.current;
      let hasChanged = false;

      Object.entries(params).forEach(([key, val]) => {
        const trimmed = val ? val.trim() : '';
        const currentVal = current.get(key) || '';

        if (!trimmed) {
          if (current.has(key)) {
            current.delete(key);
            hasChanged = true;
          }
        } else if (currentVal !== trimmed) {
          current.set(key, trimmed);
          hasChanged = true;
        }
      });

      // Se nenhum parâmetro de fato mudou, aborta sem disparar re-render
      if (!hasChanged) return;

      const query = current.toString();
      const targetUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(targetUrl, { scroll: false });
    },
    [router, pathname]
  );

  const setSpecialty = useCallback(
    (newSpecialty: string) => {
      const currentSpec = specialtyRef.current;
      // Regra PRD: Clicar na mesma especialidade ou em "Todas" remove o filtro
      if (!newSpecialty || newSpecialty === 'Todas' || newSpecialty === currentSpec) {
        updateUrl({ specialty: null });
      } else {
        updateUrl({ specialty: newSpecialty });
      }
    },
    [updateUrl]
  );

  const setCity = useCallback(
    (newCity: string) => {
      updateUrl({ city: newCity });
    },
    [updateUrl]
  );

  const setState = useCallback(
    (newState: string) => {
      updateUrl({ state: newState ? newState.toUpperCase() : null });
    },
    [updateUrl]
  );

  const setQ = useCallback(
    (newQ: string) => {
      updateUrl({ q: newQ });
    },
    [updateUrl]
  );

  const setRadius = useCallback(
    (newRadius: RadiusFilterValue) => {
      updateUrl({ radius: newRadius || null });
    },
    [updateUrl]
  );

  const setOrderBy = useCallback(
    (newOrderBy: SortOrderValue) => {
      updateUrl({ order_by: newOrderBy || null });
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    const current = pendingParamsRef.current;
    const keys = ['specialty', 'city', 'state', 'q', 'radius', 'order_by'];
    const hadFilters = keys.some((k) => current.has(k));

    if (!hadFilters) return;

    keys.forEach((k) => current.delete(k));
    const query = current.toString();
    const targetUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(targetUrl, { scroll: false });
  }, [router, pathname]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(specialty || city || state || q || radius || orderBy);
  }, [specialty, city, state, q, radius, orderBy]);

  return {
    specialty,
    city,
    state,
    q,
    radius,
    orderBy,
    setSpecialty,
    setCity,
    setState,
    setQ,
    setRadius,
    setOrderBy,
    clearFilters,
    hasActiveFilters,
  };
}
