'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createDenuncia, getMinhasDenuncias } from '../services/denuncias';
import {
  Denuncia,
  DenunciaCreatePayload,
  denunciaEmAberto,
} from '../types/denuncias';

/**
 * Estado do fluxo de denúncia de profissionais (issue #68).
 *
 * Os três estados obrigatórios de UI são expostos separadamente:
 * - carregamento da lista: `isLoading` / `error` (com retry via `carregarDenuncias`);
 * - envio: `isSubmitting` / `submitError` (com retry via novo `submeterDenuncia`);
 * - sucesso: `successMessage`.
 */
export function useDenuncias() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const ehCliente = user?.tipo === 'cliente' || user?.role === 'client';

  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const carregarDenuncias = useCallback(async () => {
    if (!token || !isAuthenticated || !ehCliente) {
      setDenuncias([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const lista = await getMinhasDenuncias(token);
      setDenuncias(lista);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao carregar suas denúncias.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token, isAuthenticated, ehCliente]);

  useEffect(() => {
    if (!authLoading) {
      carregarDenuncias();
    }
  }, [authLoading, carregarDenuncias]);

  const denunciasEmAberto = useMemo(
    () => denuncias.filter(denunciaEmAberto),
    [denuncias],
  );

  /** True quando o cliente já tem uma denúncia em aberto contra o profissional. */
  const temDenunciaEmAberto = useCallback(
    (professionalId: number) =>
      denunciasEmAberto.some(
        (denuncia) => denuncia.professional_id === professionalId,
      ),
    [denunciasEmAberto],
  );

  const submeterDenuncia = useCallback(
    async (payload: DenunciaCreatePayload): Promise<boolean> => {
      if (!token) {
        setSubmitError('Sessão expirada. Entre novamente para registrar a denúncia.');
        return false;
      }

      try {
        setIsSubmitting(true);
        setSubmitError(null);
        setSuccessMessage(null);

        const criada = await createDenuncia(token, payload);
        setDenuncias((anteriores) => [criada, ...anteriores]);
        setSuccessMessage(
          'Denúncia registrada! A equipe de moderação vai analisar o caso.',
        );
        return true;
      } catch (err: unknown) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Não foi possível registrar a denúncia.',
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [token],
  );

  const limparFeedback = useCallback(() => {
    setSubmitError(null);
    setSuccessMessage(null);
  }, []);

  return {
    user,
    isAuthenticated,
    authLoading,
    ehCliente,
    denuncias,
    denunciasEmAberto,
    isLoading,
    error,
    isSubmitting,
    submitError,
    successMessage,
    carregarDenuncias,
    temDenunciaEmAberto,
    submeterDenuncia,
    limparFeedback,
  };
}
