'use client';

import { useMemo } from 'react';
import { evaluatePasswordStrength, PasswordStrengthResult } from '../utils/validators';

/**
 * Hook para validação reativa e síncrona dos 5 critérios de Senha Forte.
 * Execução instantânea na thread de UI (<10ms).
 */
export function usePasswordStrength(password: string): PasswordStrengthResult {
  return useMemo(() => {
    return evaluatePasswordStrength(password);
  }, [password]);
}
