'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { DocumentUploadCard } from '../../../components/documentos/DocumentUploadCard';
import { SubmissionStatusBanner } from '../../../components/documentos/SubmissionStatusBanner';
import { useProfessionalDocuments } from '../../../hooks/useProfessionalDocuments';
import {
  DOCUMENT_TYPES_CONFIG,
  DocumentType,
} from '../../../types/professionalDocuments';

const ORDERED_DOCUMENT_TYPES: DocumentType[] = [
  'photo_id',
  'proof_of_residence',
  'technical_certificate',
  'profile_photo',
];

export default function ProfessionalDocumentsPage() {
  const {
    user,
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
  } = useProfessionalDocuments();

  // 1. Estado de Carregamento da Sessão ou Dados Iniciais (Skeleton)
  if (authLoading || (isLoading && !summary)) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-48 bg-rental-surface2 rounded-xl animate-pulse" />
            <div className="h-10 w-10 bg-rental-surface2 rounded-full animate-pulse" />
          </div>
          <div className="h-28 bg-rental-surface2 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 bg-rental-surface2 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 2. Não Autenticado
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Autenticação Necessária
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Você precisa estar conectado à sua conta de profissional para enviar e gerenciar seus documentos.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/entrar">
              <Button variant="primary" className="w-full">
                Entrar na Minha Conta
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Voltar para a Página Inicial
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 3. Usuário autenticado mas não é Profissional (ex: Cliente ou Administrador)
  if (!isProfessional) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
            <UserX className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Área Restrita a Profissionais
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Esta página de verificação de documentos é destinada exclusivamente a prestadores de serviços cadastrados.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/cadastro/profissional">
              <Button variant="primary" className="w-full">
                Cadastrar-se como Profissional
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Ir para a Página Inicial
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 4. Erro ao Carregar Documentos
  if (error && !summary) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-[var(--rs-error)]/30 bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--rs-error)]/10 text-[var(--rs-error)] flex items-center justify-center">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Falha ao Carregar Documentos
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              {error}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={fetchSummary}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="w-full"
          >
            Tentar Novamente
          </Button>
        </div>
      </main>
    );
  }

  // Documentos estão sob análise quando já foram enviados e não estão rejeitados
  const isLocked = Boolean(
    summary?.submitted_at && summary?.approval_status !== 'rejected',
  );

  return (
    <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10 transition-colors duration-300">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        {/* Topo / Barra de Navegação Superior */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-rental-border">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-rental-surface border border-rental-border hover:border-rental-primary/40 text-rental-muted hover:text-rental-ink transition-colors"
              title="Voltar para a página inicial"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-rental-ink tracking-tight">
                Envio de Documentos para Análise
              </h1>
              <p className="text-xs sm:text-sm text-rental-muted">
                Profissional: <span className="font-semibold text-rental-ink">{user?.nome || user?.name || user?.email}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchSummary}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Atualizar
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* Feedback Temporário de Sucesso */}
        {actionSuccessMessage && (
          <div className="rounded-2xl border border-[var(--rs-success)]/40 bg-[var(--rs-success)]/10 p-4 text-sm text-[var(--rs-success)] flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
            <button
              onClick={clearSuccessMessage}
              className="text-xs font-bold hover:underline"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Alerta de Erro Geral */}
        {error && (
          <div className="rounded-2xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-4 text-sm text-[var(--rs-error)] flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Banner do Status Geral */}
        {summary && <SubmissionStatusBanner summary={summary} />}

        {/* Grade de Cards de Documentos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-rental-ink flex items-center gap-2">
              <span>Documentos Exigidos</span>
              {summary && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rental-surface2 text-rental-muted border border-rental-border font-medium">
                  {summary.documents.length} de {ORDERED_DOCUMENT_TYPES.length} anexados
                </span>
              )}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {ORDERED_DOCUMENT_TYPES.map((type) => {
              const config = DOCUMENT_TYPES_CONFIG[type];
              const doc = summary?.documents.find((d) => d.document_type === type);

              return (
                <DocumentUploadCard
                  key={type}
                  config={config}
                  document={doc}
                  isLocked={isLocked}
                  onUpload={(file) => handleUpload(type, file)}
                  onDelete={doc ? () => handleDelete(doc.id) : undefined}
                />
              );
            })}
          </div>
        </section>

        {/* Painel Inferior de Submissão para Análise */}
        {summary && summary.approval_status !== 'approved' && (
          <section className="rounded-3xl border border-rental-border bg-rental-surface p-6 sm:p-8 shadow-panel space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-rental-ink flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-rental-primary" />
                  <span>Submissão dos Documentos</span>
                </h3>
                <p className="text-xs sm:text-sm text-rental-muted leading-relaxed max-w-2xl">
                  {isLocked
                    ? 'Seus documentos foram encaminhados com sucesso e estão sob avaliação da equipe de administração. O envio está bloqueado para edições.'
                    : summary.is_complete
                    ? 'Todos os documentos obrigatórios foram anexados. Ao enviar para análise, a equipe de administração será notificada para conferência.'
                    : 'Para habilitar o envio para análise, anexe obrigatoriamente um Documento com Foto e um Comprovante de Residência.'}
                </p>
              </div>

              {!isLocked && (
                <div className="shrink-0">
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!summary.can_submit || isSubmitting}
                    isLoading={isSubmitting}
                    loadingText="Enviando para análise..."
                    onClick={handleSubmitForReview}
                    leftIcon={<Send className="h-4 w-4" />}
                    className="w-full sm:w-auto"
                  >
                    Enviar para Análise
                  </Button>
                </div>
              )}
            </div>

            {!isLocked && !summary.can_submit && (
              <div className="pt-2 border-t border-rental-border/60 flex items-center gap-2 text-xs text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  O botão permanecerá desabilitado até que todos os documentos obrigatórios tenham sido enviados.
                </span>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
