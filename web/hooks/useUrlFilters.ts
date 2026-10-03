'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export interface UrlFilters {
  specialty: string;
  city: string;
  q: string;
  setSpecialty: (specialty: string) => void;
  setCity: (city: string) => void;
  setQ: (q: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Hook para leitura e sincronização bidirecional de filtros com a URL (Next.js App Router).
 * Permite compartilhamento de links, histórico de navegação e atualização reativa.
 */
export function useUrlFilters(): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const specialty = searchParams.get('specialty') || '';
  const city = searchParams.get('city') || '';
  const q = searchParams.get('q') || '';

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParams.toString());

      Object.entries(params).forEach(([key, val]) => {
        if (!val || val.trim() === '') {
          current.delete(key);
        } else {
          current.set(key, val.trim());
        }
      });

      const query = current.toString();
      const targetUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(targetUrl, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setSpecialty = useCallback(
    (newSpecialty: string) => {
      // Regra PRD: Clicar na mesma especialidade ou em "Todas" remove o filtro
      if (!newSpecialty || newSpecialty === 'Todas' || newSpecialty === specialty) {
        updateUrl({ specialty: null });
      } else {
        updateUrl({ specialty: newSpecialty });
      }
    },
    [specialty, updateUrl]
  );

  const setCity = useCallback(
    (newCity: string) => {
      updateUrl({ city: newCity });
    },
    [updateUrl]
  );

  const setQ = useCallback(
    (newQ: string) => {
      updateUrl({ q: newQ });
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    const current = new URLSearchParams(searchParams.toString());
    current.delete('specialty');
    current.delete('city');
    current.delete('q');
    const query = current.toString();
    const targetUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(targetUrl, { scroll: false });
  }, [router, pathname, searchParams]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(specialty || city || q);
  }, [specialty, city, q]);

  return {
    specialty,
    city,
    q,
    setSpecialty,
    setCity,
    setQ,
    clearFilters,
    hasActiveFilters,
  };
}
