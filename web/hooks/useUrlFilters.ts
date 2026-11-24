'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
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

interface FilterState {
  specialty: string;
  city: string;
  state: string;
  q: string;
  radius: RadiusFilterValue;
  orderBy: SortOrderValue;
}

/**
 * Hook para leitura e sincronização instantânea de filtros com a URL via history.replaceState,
 * evitando round-trips do Next.js App Router a cada tecla ou movimento do slider.
 */
export function useUrlFilters(): UrlFilters {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => ({
    specialty: searchParams.get('specialty') || '',
    city: searchParams.get('city') || '',
    state: searchParams.get('state') || '',
    q: searchParams.get('q') || '',
    radius: parseRadiusFilter(searchParams.get('radius')),
    orderBy: parseSortOrder(searchParams.get('order_by')),
  }));

  const syncUrl = useCallback(
    (next: FilterState) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      if (next.specialty.trim()) params.set('specialty', next.specialty.trim());
      if (next.city.trim()) params.set('city', next.city.trim());
      if (next.state.trim()) params.set('state', next.state.trim().toUpperCase());
      if (next.q.trim()) params.set('q', next.q.trim());
      if (next.radius) params.set('radius', next.radius);
      if (next.orderBy) params.set('order_by', next.orderBy);
      const query = params.toString();
      window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  const patchFilters = useCallback(
    (updater: (prev: FilterState) => FilterState) => {
      setFilters((prev) => {
        const next = updater(prev);
        syncUrl(next);
        return next;
      });
    },
    [syncUrl],
  );

  const setSpecialty = useCallback(
    (newSpecialty: string) => {
      patchFilters((prev) => ({
        ...prev,
        specialty: !newSpecialty || newSpecialty === 'Todas' || newSpecialty === prev.specialty ? '' : newSpecialty,
      }));
    },
    [patchFilters],
  );

  const setCity = useCallback((city: string) => patchFilters((prev) => ({ ...prev, city })), [patchFilters]);
  const setState = useCallback(
    (state: string) => patchFilters((prev) => ({ ...prev, state: state ? state.toUpperCase() : '' })),
    [patchFilters],
  );
  const setQ = useCallback((q: string) => patchFilters((prev) => ({ ...prev, q })), [patchFilters]);
  const setRadius = useCallback((radius: RadiusFilterValue) => patchFilters((prev) => ({ ...prev, radius })), [patchFilters]);
  const setOrderBy = useCallback((orderBy: SortOrderValue) => patchFilters((prev) => ({ ...prev, orderBy })), [patchFilters]);

  const clearFilters = useCallback(() => {
    const empty: FilterState = { specialty: '', city: '', state: '', q: '', radius: '', orderBy: '' };
    setFilters(empty);
    syncUrl(empty);
  }, [syncUrl]);

  const hasActiveFilters = useMemo(
    () => Boolean(filters.specialty || filters.city || filters.state || filters.q || filters.radius || filters.orderBy),
    [filters],
  );

  return {
    ...filters,
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
