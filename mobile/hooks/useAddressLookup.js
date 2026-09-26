import { useState, useEffect, useRef } from 'react';
import { cleanDigits } from '../utils/formatters';

export function useAddressLookup(cepValue = '', options = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSearchedCep, setLastSearchedCep] = useState('');

  const onSuccessRef = useRef(options?.onSuccess);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess;
    onErrorRef.current = options?.onError;
  }, [options?.onSuccess, options?.onError]);

  useEffect(() => {
    const digits = cleanDigits(cepValue);

    if (digits.length !== 8) {
      setError(null);
      return;
    }

    if (digits === lastSearchedCep) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      setLastSearchedCep(digits);

      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (!response.ok) {
          throw new Error('Falha de comunicação com o serviço de CEP.');
        }

        const data = await response.json();

        if (data.erro) {
          const msg = 'CEP não encontrado. Por favor, preencha manualmente.';
          setError(msg);
          onErrorRef.current?.(msg);
          return;
        }

        const address = {
          cep: digits,
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          estado_uf: data.uf || '',
        };

        onSuccessRef.current?.(address);
      } catch (err) {
        const fallbackMsg =
          'Não foi possível localizar o CEP automaticamente. Preencha manualmente.';
        setError(fallbackMsg);
        onErrorRef.current?.(fallbackMsg);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [cepValue, lastSearchedCep]);

  return {
    isLoading,
    error,
    resetError: () => setError(null),
  };
}
