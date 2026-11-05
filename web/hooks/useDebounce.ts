import { useEffect, useState } from 'react';

/**
 * Hook utilitário para debounce de valores (ex: digitação de busca).
 * @param value O valor de entrada.
 * @param delay Atraso em milissegundos (padrão: 350ms, conforme PRD).
 */
export function useDebounce<T>(value: T, delay: number = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
