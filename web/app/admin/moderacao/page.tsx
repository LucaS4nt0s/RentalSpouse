'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  RefreshCw,
  Lock,
  Mail,
  KeyRound,
  Sparkles,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { AdminNavigationHeader } from '../../../components/moderacao/AdminNavigationHeader';
import { ModerationTable } from '../../../components/moderacao/ModerationTable';
import { ModerationReviewModal } from '../../../components/moderacao/ModerationReviewModal';
import { ToastContainer, ToastData } from '../../../components/moderacao/Toast';
import { Button } from '../../../components/ui/Button';
import { TextInput } from '../../../components/ui/TextInput';
import { PasswordInput } from '../../../components/ui/PasswordInput';
import { FormFieldWrapper } from '../../../components/ui/FormFieldWrapper';
import {
  ModerationStatusFilter,
  ProfessionalModerationItem,
  ProfessionalModerationReview,
  ProfessionalRejectPayload,
} from '../../../types/moderation';
import {
  listProfessionals,
  getProfessionalReview,
  approveProfessional,
  rejectProfessional,
} from '../../../services/moderation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const ADMIN_STORAGE_KEY = 'rentalspouse_admin_token';
const GENERAL_STORAGE_KEY = 'rentalspouse_token';
const isDevEnvironment = process.env.NODE_ENV === 'development';

interface AdminSessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function AdminModerationPage() {
  const { user: authUser, token: contextToken, logout: authLogout } = useAuth();

  // Sessão Administrativa
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [isValidatingSession, setIsValidatingSession] = useState<boolean>(true);

  // Login de Admin (se não autenticado)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Lista de Profissionais
  const [professionals, setProfessionals] = useState<ProfessionalModerationItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Filtros e busca
  const [statusFilter, setStatusFilter] = useState<ModerationStatusFilter>('pending_approval');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'fifo' | 'newest'>('fifo');

  // Modal de Review
  const [reviewDetails, setReviewDetails] = useState<ProfessionalModerationReview | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Toasts de Notificação
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 1. Validação de Sessão Administrativa
  const handleLogout = useCallback(() => {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    setAdminToken(null);
    setAdminUser(null);
    setProfessionals([]);
    if (authLogout) authLogout();
  }, [authLogout]);

  const verifyAdminToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Sessão expirada');

      const data = await res.json();
      if (data.role !== 'admin') {
        throw new Error('Usuário autenticado não possui perfil de administrador');
      }

      setAdminUser(data);
      setAdminToken(token);
      return true;
    } catch {
      handleLogout();
      return false;
    } finally {
      setIsValidatingSession(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    const checkSession = async () => {
      // Prioridade 1: Token do AuthContext (se for admin)
      if (contextToken && authUser?.role === 'admin') {
        const ok = await verifyAdminToken(contextToken);
        if (ok) return;
      }

      // Prioridade 2: Token exclusivo de admin no localStorage
      const savedAdminToken = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (savedAdminToken) {
        const ok = await verifyAdminToken(savedAdminToken);
        if (ok) return;
      }

      // Prioridade 3: Token geral no localStorage
      const savedGeneralToken = localStorage.getItem(GENERAL_STORAGE_KEY);
      if (savedGeneralToken) {
        const ok = await verifyAdminToken(savedGeneralToken);
        if (ok) return;
      }

      setIsValidatingSession(false);
    };

    checkSession();
  }, [contextToken, authUser, verifyAdminToken]);

  // 2. Busca lista de profissionais para moderação
  const loadProfessionals = useCallback(async (token: string) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      // Carregamos todos para permitir filtros instantâneos na tabela
      const data = await listProfessionals(token, 'all', 0, 100);
      setProfessionals(data);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err.status === 401 || err.status === 403)) {
        handleLogout();
        setLoginError('Sua sessão de administrador expirou. Faça login novamente.');
        return;
      }
      setListError(err instanceof Error ? err.message : 'Falha ao carregar profissionais.');
    } finally {
      setIsLoadingList(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (adminToken) {
      loadProfessionals(adminToken);
    }
  }, [adminToken, loadProfessionals]);

  // 3. Login de Administrador
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || 'Credenciais inválidas. Verifique e-mail e senha.');
      }

      const token = data.access_token;
      localStorage.setItem(ADMIN_STORAGE_KEY, token);

      const isValid = await verifyAdminToken(token);
      if (!isValid) {
        setLoginError('A conta autenticada não possui permissão de administrador.');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Falha ao autenticar.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 4. Abertura do Modal de Avaliação
  const handleOpenReview = async (prof: ProfessionalModerationItem) => {
    if (!adminToken) return;
    setIsReviewModalOpen(true);
    setIsLoadingReview(true);
    setReviewDetails(null);

    try {
      const details = await getProfessionalReview(adminToken, prof.id);
      setReviewDetails(details);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Falha ao carregar auditoria',
        message: err instanceof Error ? err.message : 'Não foi possível carregar os documentos.',
      });
    } finally {
      setIsLoadingReview(false);
    }
  };

  // 5. Ação: Aprovar Profissional
  const handleApprove = async (professionalId: number) => {
    if (!adminToken) return;
    try {
      const result = await approveProfessional(adminToken, professionalId);
      addToast({
        type: 'success',
        title: 'Profissional Aprovado!',
        message: result.message || `O cadastro de ${result.name} foi liberado na vitrine pública.`,
      });
      setIsReviewModalOpen(false);
      loadProfessionals(adminToken);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Erro na aprovação',
        message: err instanceof Error ? err.message : 'Não foi possível concluir a aprovação.',
      });
      throw err;
    }
  };

  // 6. Ação: Rejeitar Profissional
  const handleReject = async (professionalId: number, payload: ProfessionalRejectPayload) => {
    if (!adminToken) return;
    try {
      const result = await rejectProfessional(adminToken, professionalId, payload);
      addToast({
        type: 'info',
        title: 'Cadastro Reprovado',
        message: `A justificativa foi gravada e enviada por e-mail para ${result.name}.`,
      });
      setIsReviewModalOpen(false);
      loadProfessionals(adminToken);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Erro na reprovação',
        message: err instanceof Error ? err.message : 'Não foi possível registrar a reprovação.',
      });
      throw err;
    }
  };

  // Contadores de estatísticas gerais
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    professionals.forEach((p) => {
      if (p.approval_status === 'approved') approved++;
      else if (p.approval_status === 'rejected') rejected++;
      else pending++;
    });

    return {
      pending,
      approved,
      rejected,
      total: professionals.length,
    };
  }, [professionals]);

  return (
    <div className="min-h-screen bg-rental-bg text-rental-ink transition-colors duration-300">
      {/* Barra Superior Administrativa */}
      <AdminNavigationHeader currentAdmin={adminUser} onLogout={adminToken ? handleLogout : undefined} />

      {/* Conteúdo Principal */}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10 space-y-8">
        {/* Loading de Checagem de Sessão */}
        {isValidatingSession && (
          <div className="glass-panel rounded-3xl p-16 text-center flex flex-col items-center gap-4 border border-rental-border">
            <RefreshCw className="h-8 w-8 text-rental-primary animate-spin" />
            <p className="text-sm font-medium text-rental-muted">
              Verificando permissões de administrador...
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 1: NÃO AUTENTICADO COMO ADMIN -> TELA DE LOGIN                       */}
        {/* ========================================================================= */}
        {!isValidatingSession && !adminToken && (
          <div className="max-w-md mx-auto my-12 animate-fadeIn">
            <div className="glass-panel-elevated rounded-3xl p-6 sm:p-8 border border-rental-border shadow-xl">
              <div className="flex items-center gap-3 text-rental-primary mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 border border-rental-primary/20">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Moderação Restrita</h2>
                  <p className="text-xs text-rental-muted">Acesso exclusivo para administradores</p>
                </div>
              </div>

              <p className="text-xs text-rental-muted mb-6 leading-relaxed">
                A moderação e auditoria de documentos exige autenticação com perfil administrativo
                ativo. Identifique-se com suas credenciais para gerenciar a fila.
              </p>

              {loginError && (
                <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs text-rental-error animate-shake">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <FormFieldWrapper id="admin-login-email" label="E-mail Administrativo" required>
                  <TextInput
                    id="admin-login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@rentalspouse.com"
                    leftIcon={<Mail className="h-4 w-4" />}
                    required
                  />
                </FormFieldWrapper>

                <FormFieldWrapper id="admin-login-password" label="Senha" required>
                  <PasswordInput
                    id="admin-login-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </FormFieldWrapper>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    isLoading={isLoggingIn}
                    loadingText="Autenticando..."
                    leftIcon={<KeyRound className="h-4 w-4" />}
                  >
                    Acessar Fila de Moderação
                  </Button>
                </div>
              </form>

              {/* Atalho de desenvolvimento local */}
              {isDevEnvironment && (
                <div className="mt-6 rounded-2xl border border-dashed border-rental-border bg-rental-surface2/60 p-4 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-rental-primary mb-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Atalho de Desenvolvimento
                  </div>
                  <p className="text-rental-muted text-[11px] mb-3">
                    Preencher automaticamente com o administrador inicial de testes:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('admin@rentalspouse.com');
                      setLoginPassword('Admin@123456');
                    }}
                    className="w-full text-center py-2 px-3 rounded-xl border border-rental-border bg-rental-surface hover:bg-rental-surface2 text-rental-primary font-bold text-[11px] transition-colors"
                  >
                    Preencher credenciais de seed (Dev)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 2: ADMIN AUTENTICADO -> PAINEL E TABELA DE MODERAÇÃO                 */}
        {/* ========================================================================= */}
        {!isValidatingSession && adminToken && (
          <div className="space-y-8 animate-fadeIn">
            {/* Cabeçalho da Página de Moderação */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-rental-border pb-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rental-border bg-rental-surface px-3 py-1 text-xs font-semibold text-rental-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-rental-primary" />
                  Moderação de Documentos • Issue #64 &amp; #17
                </span>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Fila de Moderação de Profissionais
                </h1>
                <p className="mt-1.5 text-sm text-rental-muted max-w-2xl">
                  Avalie e audite os documentos enviados pelos profissionais (RG/CNH com foto e
                  comprovante de residência). Apenas profissionais aprovados são liberados para a vitrine pública de clientes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/cadastro/admin"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rental-border bg-rental-surface hover:bg-rental-surface2 text-xs font-bold text-rental-ink transition-colors shadow-sm"
                >
                  <Users className="h-4 w-4 text-rental-primary" />
                  Cadastrar Admins
                </Link>
              </div>
            </div>

            {/* Cartões de Métricas e Resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pendentes na Fila */}
              <div
                onClick={() => setStatusFilter('pending_approval')}
                className={`rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] ${
                  statusFilter === 'pending_approval'
                    ? 'border-amber-500/40 bg-amber-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Aguardando Moderação
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {stats.pending}
                  </span>
                  <span className="text-xs text-rental-muted">
                    {stats.pending === 1 ? 'profissional na fila' : 'profissionais na fila'}
                  </span>
                </div>
              </div>

              {/* Aprovados */}
              <div
                onClick={() => setStatusFilter('approved')}
                className={`rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] ${
                  statusFilter === 'approved'
                    ? 'border-emerald-500/40 bg-emerald-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Aprovados e Ativos
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {stats.approved}
                  </span>
                  <span className="text-xs text-rental-muted">liberados na vitrine</span>
                </div>
              </div>

              {/* Rejeitados / Pendências */}
              <div
                onClick={() => setStatusFilter('rejected')}
                className={`rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] ${
                  statusFilter === 'rejected'
                    ? 'border-red-500/40 bg-red-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Rejeitados / Ajustes
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {stats.rejected}
                  </span>
                  <span className="text-xs text-rental-muted">aguardando reenvio</span>
                </div>
              </div>

              {/* Total Cadastrados */}
              <div
                onClick={() => setStatusFilter('all')}
                className={`rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] ${
                  statusFilter === 'all'
                    ? 'border-rental-primary/40 bg-rental-primary/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-primary">
                    Total Registrado
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {stats.total}
                  </span>
                  <span className="text-xs text-rental-muted">profissionais no sistema</span>
                </div>
              </div>
            </div>

            {/* Tabela de Moderação */}
            <ModerationTable
              professionals={professionals}
              isLoading={isLoadingList}
              error={listError}
              onRetry={() => adminToken && loadProfessionals(adminToken)}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              onReviewProfessional={handleOpenReview}
            />

            {/* Modal de Avaliação Detalhada e Decisão */}
            <ModerationReviewModal
              token={adminToken}
              isOpen={isReviewModalOpen}
              onClose={() => setIsReviewModalOpen(false)}
              review={reviewDetails}
              isLoading={isLoadingReview}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        )}
      </main>

      {/* Container Flutuante de Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
