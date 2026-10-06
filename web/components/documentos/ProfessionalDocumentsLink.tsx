'use client';

import React from 'react';
import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

export const PROFESSIONAL_DOCUMENTS_HREF = '/profissional/documentos';

type ProfessionalDocumentsLinkVariant = 'header' | 'hero' | 'card';

interface ProfessionalDocumentsLinkProps {
  /** Onde o link é exibido: define o estilo e o rótulo. */
  variant: ProfessionalDocumentsLinkVariant;
}

/**
 * Hook com a regra de papel usada para exibir o acesso aos documentos.
 * Mesma regra da página /profissional/documentos (useProfessionalDocuments).
 */
export function useIsProfessional(): boolean {
  const { user, isAuthenticated } = useAuth();
  return (
    isAuthenticated &&
    (user?.tipo === 'profissional' || user?.role === 'professional')
  );
}

/**
 * Atalho para a tela de envio de documentos.
 * Renderiza apenas para profissionais autenticados; para qualquer outro
 * usuário (visitante, cliente, administrador) não renderiza nada.
 */
export const ProfessionalDocumentsLink: React.FC<ProfessionalDocumentsLinkProps> = ({
  variant,
}) => {
  const isProfessional = useIsProfessional();

  if (!isProfessional) return null;

  if (variant === 'header') {
    return (
      <Link
        href={PROFESSIONAL_DOCUMENTS_HREF}
        title="Meus documentos"
        className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
      >
        <FileCheck2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Meus documentos</span>
        <span className="sr-only sm:hidden">Meus documentos</span>
      </Link>
    );
  }

  if (variant === 'hero') {
    return (
      <Link
        href={PROFESSIONAL_DOCUMENTS_HREF}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
      >
        <FileCheck2 className="h-4 w-4 text-rental-primary" />
        Meus documentos
      </Link>
    );
  }

  return (
    <Link href={PROFESSIONAL_DOCUMENTS_HREF}>
      <Button
        variant="secondary"
        size="md"
        className="w-full"
        leftIcon={<FileCheck2 className="h-4 w-4" />}
      >
        Enviar meus documentos
      </Button>
    </Link>
  );
};
