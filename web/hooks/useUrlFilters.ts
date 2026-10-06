'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';

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
 * Utiliza referências estáveis de callbacks para evitar re-execução desnecessária
 * de effects e múltiplos calls de router.replace.
 */
export function useUrlFilters(): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const specialty = searchParams.get('specialty') || '';
  const city = searchParams.get('city') || '';
  const q = searchParams.get('q') || '';

  const specialtyRef = useRef(specialty);
  specialtyRef.current = specialty;

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParamsRef.current.toString());
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

  const setQ = useCallback(
    (newQ: string) => {
      updateUrl({ q: newQ });
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    const current = new URLSearchParams(searchParamsRef.current.toString());
    const hadFilters = current.has('specialty') || current.has('city') || current.has('q');

    if (!hadFilters) return;

    current.delete('specialty');
    current.delete('city');
    current.delete('q');
    const query = current.toString();
    const targetUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(targetUrl, { scroll: false });
  }, [router, pathname]);

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
