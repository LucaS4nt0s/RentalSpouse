import { useMemo } from 'react';
import { evaluatePasswordStrength } from '../utils/validators';

export function usePasswordStrength(password = '') {
  return useMemo(() => {
    return evaluatePasswordStrength(password);
  }, [password]);
}
