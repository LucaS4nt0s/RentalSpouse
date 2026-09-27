'use client';

import { useState, useEffect, useRef } from 'react';
import { cleanDigits } from '../utils/formatters';

export interface AddressResult {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado_uf: string;
}

interface UseAddressLookupOptions {
  onSuccess?: (address: AddressResult) => void;
  onError?: (errorMessage: string) => void;
}

export function useAddressLookup(cepValue: string, options?: UseAddressLookupOptions) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchedCep, setLastSearchedCep] = useState<string>('');

  const onSuccessRef = useRef(options?.onSuccess);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess;
    onErrorRef.current = options?.onError;
  }, [options?.onSuccess, options?.onError]);

  useEffect(() => {
    const digits = cleanDigits(cepValue);

    // Só dispara quando tem exatamente 8 dígitos e é diferente do último consultado
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
          const msg = 'CEP não encontrado. Por favor, preencha os dados do endereço manualmente.';
          setError(msg);
          onErrorRef.current?.(msg);
          return;
        }

        const address: AddressResult = {
          cep: digits,
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          estado_uf: data.uf || '',
        };

        onSuccessRef.current?.(address);
      } catch (err) {
        const fallbackMsg =
          'Não foi possível localizar o CEP automaticamente. Por favor, preencha o endereço manualmente.';
        setError(fallbackMsg);
        onErrorRef.current?.(fallbackMsg);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [cepValue, lastSearchedCep]);

  return {
    isLoading,
    error,
    resetError: () => setError(null),
  };
}
