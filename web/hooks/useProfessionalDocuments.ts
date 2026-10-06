'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deleteDocument,
  getDocumentsSummary,
  submitDocumentsForReview,
  uploadDocument,
} from '../services/professionalDocuments';
import {
  DocumentType,
  ProfessionalDocumentsSummary,
} from '../types/professionalDocuments';

export function useProfessionalDocuments() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [summary, setSummary] = useState<ProfessionalDocumentsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const isProfessional =
    user?.tipo === 'profissional' || user?.role === 'professional';

  const clearSuccessMessage = useCallback(() => {
    setActionSuccessMessage(null);
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!token || !isAuthenticated || !isProfessional) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getDocumentsSummary(token);
      setSummary(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar documentos do profissional.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [token, isAuthenticated, isProfessional]);

  useEffect(() => {
    if (!authLoading) {
      fetchSummary();
    }
  }, [authLoading, fetchSummary]);

  const handleUpload = async (documentType: DocumentType, file: File) => {
    if (!token) throw new Error('Usuário não autenticado.');
    setError(null);

    await uploadDocument(token, documentType, file);
    setActionSuccessMessage('Documento enviado e salvo com sucesso!');
    await fetchSummary();
  };

  const handleDelete = async (documentId: number) => {
    if (!token) throw new Error('Usuário não autenticado.');
    setError(null);

    await deleteDocument(token, documentId);
    setActionSuccessMessage('Documento removido com sucesso.');
    await fetchSummary();
  };

  const handleSubmitForReview = async () => {
    if (!token) throw new Error('Usuário não autenticado.');
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await submitDocumentsForReview(token);
      setSummary(updated);
      setActionSuccessMessage(
        'Documentos submetidos com sucesso para a análise do administrador!',
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha ao submeter documentos para análise.';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    user,
    token,
    isAuthenticated,
    authLoading,
    isProfessional,
    summary,
    isLoading,
    isSubmitting,
    error,
    actionSuccessMessage,
    clearSuccessMessage,
    fetchSummary,
    handleUpload,
    handleDelete,
    handleSubmitForReview,
  };
}
