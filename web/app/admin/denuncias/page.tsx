'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Ban,
  Clock,
  Eye,
  Flag,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  useAuth,
  TOKEN_STORAGE_KEY,
  LEGACY_ADMIN_TOKEN_KEY,
} from '../../../context/AuthContext';
import { acquireBodyScrollLock } from '../../../lib/scrollLock';
import { mensagemErro } from '../../../services/apiError';
import { AdminNavigationHeader } from '../../../components/moderacao/AdminNavigationHeader';
import { ToastContainer, ToastData } from '../../../components/moderacao/Toast';
import { Button } from '../../../components/ui/Button';
import { TextInput } from '../../../components/ui/TextInput';
import { PasswordInput } from '../../../components/ui/PasswordInput';
import { FormFieldWrapper } from '../../../components/ui/FormFieldWrapper';
import {
  DENUNCIA_MOTIVOS,
  DenunciaAdminItem,
  DenunciaAdminResumo,
  DenunciaAdminStatusFilter,
  motivoDenunciaLabel,
  statusDenunciaLabel,
} from '../../../types/denuncias';
import {
  getAdminDenunciasResumo,
  listAdminDenuncias,
} from '../../../services/denuncias';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const isDevEnvironment = process.env.NODE_ENV === 'development';
const PAGE_SIZE = 50;

interface AdminSessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

const RESUMO_INICIAL: DenunciaAdminResumo = {
  total: 0,
  pendentes: 0,
  em_analise: 0,
  resolvidas_banimento: 0,
  rejeitadas: 0,
  arquivadas: 0,
};

function normalizarIsoUtc(iso: string): string {
  if (!iso) return iso;
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
}

function formatarDataPtBr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(normalizarIsoUtc(iso)));
  } catch {
    return iso;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException
      ? err.name === 'AbortError'
      : Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'AbortError')
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'pendente' || s === 'em_analise') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        {statusDenunciaLabel(status)}
      </span>
    );
  }
  if (s === 'resolvida') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
        <Ban className="h-3 w-3" />
        {statusDenunciaLabel(status)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rental-border bg-rental-surface2 px-2.5 py-0.5 text-[11px] font-bold text-rental-muted">
      <Archive className="h-3 w-3" />
      {statusDenunciaLabel(status)}
    </span>
  );
}

export default function AdminDenunciasPage() {
  const {
    user: authUser,
    token: contextToken,
    isLoading: isAuthLoading,
    login: authLogin,
    logout: authLogout,
  } = useAuth();

  const authLoginRef = useRef(authLogin);
  authLoginRef.current = authLogin;

  // Sessão Administrativa
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [isValidatingSession, setIsValidatingSession] = useState<boolean>(true);

  // Login de Admin
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dados de Denúncias e Métricas
  const [denuncias, setDenuncias] = useState<DenunciaAdminItem[]>([]);
  const [resumo, setResumo] = useState<DenunciaAdminResumo>(RESUMO_INICIAL);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<DenunciaAdminStatusFilter>('all');
  const [motivoFilter, setMotivoFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Modal de Análise (ponto de extensão para ações da Fatia 2)
  const [selectedDenuncia, setSelectedDenuncia] = useState<DenunciaAdminItem | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Limpa apenas o estado local da tela admin sem derrubar sessões de cliente/profissional no AuthContext
  const clearAdminLocalState = useCallback((clearLegacyAdminToken = false) => {
    if (clearLegacyAdminToken && typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
    }
    setAdminToken(null);
    setAdminUser(null);
    setDenuncias([]);
    setResumo(RESUMO_INICIAL);
    setHasMore(false);
  }, []);

  // Encerramento explícito de sessão admin autenticada (botão Sair ou token admin expirado 401/403)
  const handleLogout = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    clearAdminLocalState(false);
    if (authLogout) authLogout();
  }, [authLogout, clearAdminLocalState]);

  const verifyAdminToken = useCallback(
    async (
      token: string,
      options?: { syncAuthContext?: boolean; isLegacyToken?: boolean },
    ): Promise<boolean> => {
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
        if (options?.syncAuthContext) {
          authLoginRef.current(
            {
              id: data.id,
              nome: data.name || data.nome || '',
              name: data.name,
              email: data.email,
              tipo: 'admin',
              role: 'admin',
            },
            token,
          );
        }
        return true;
      } catch {
        clearAdminLocalState(Boolean(options?.isLegacyToken));
        return false;
      } finally {
        setIsValidatingSession(false);
      }
    },
    [clearAdminLocalState],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const checkSession = async () => {
      const isContextAdmin = authUser?.role === 'admin' || authUser?.tipo === 'admin';
      const isNonAdminContextUser = Boolean(authUser) && !isContextAdmin;

      if (contextToken && isContextAdmin) {
        const ok = await verifyAdminToken(contextToken, { syncAuthContext: false });
        if (ok) return;
      }

      const savedLegacyToken = localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY);
      if (savedLegacyToken) {
        const ok = await verifyAdminToken(savedLegacyToken, {
          syncAuthContext: true,
          isLegacyToken: true,
        });
        if (ok) return;
      }

      if (!isNonAdminContextUser) {
        const savedGeneralToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (savedGeneralToken && savedGeneralToken !== contextToken) {
          const ok = await verifyAdminToken(savedGeneralToken, { syncAuthContext: true });
          if (ok) return;
        }
      }

      clearAdminLocalState(false);
      setIsValidatingSession(false);
    };

    checkSession();
  }, [
    isAuthLoading,
    contextToken,
    authUser,
    verifyAdminToken,
    clearAdminLocalState,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const carregarResumo = useCallback(
    async (token: string, signal?: AbortSignal) => {
      try {
        const stats = await getAdminDenunciasResumo(token, signal);
        if (!signal?.aborted) {
          setResumo(stats);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err.status === 401 || err.status === 403)
        ) {
          handleLogout();
          setLoginError('Sua sessão de administrador expirou. Faça login novamente.');
        }
      }
    },
    [handleLogout],
  );

  const carregarDenuncias = useCallback(
    async (
      token: string,
      options?: { skip?: number; append?: boolean; signal?: AbortSignal },
    ) => {
      const skip = options?.skip ?? 0;
      const append = Boolean(options?.append);
      const signal = options?.signal;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingList(true);
        setListError(null);
      }

      try {
        const items = await listAdminDenuncias(
          token,
          {
            status: statusFilter,
            motivo: motivoFilter,
            q: debouncedSearchQuery,
            skip,
            limit: PAGE_SIZE,
          },
          signal,
        );
        if (signal?.aborted) return;

        setDenuncias((prev) => (append ? [...prev, ...items] : items));
        setHasMore(items.length === PAGE_SIZE);
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) return;
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err.status === 401 || err.status === 403)
        ) {
          handleLogout();
          setLoginError('Sua sessão de administrador expirou. Faça login novamente.');
          return;
        }
        setListError(
          mensagemErro(err, 'Não foi possível carregar as denúncias para moderação.'),
        );
      } finally {
        if (!signal?.aborted) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setIsLoadingList(false);
          }
        }
      }
    },
    [statusFilter, motivoFilter, debouncedSearchQuery, handleLogout],
  );

  const loadDenuncias = useCallback(
    async (token: string) => {
      await Promise.all([
        carregarDenuncias(token, { skip: 0, append: false }),
        carregarResumo(token),
      ]);
    },
    [carregarDenuncias, carregarResumo],
  );

  useEffect(() => {
    if (!adminToken) return;
    const controller = new AbortController();
    carregarResumo(adminToken, controller.signal);
    return () => controller.abort();
  }, [adminToken, carregarResumo]);

  useEffect(() => {
    if (!adminToken) return;
    const controller = new AbortController();
    carregarDenuncias(adminToken, { skip: 0, append: false, signal: controller.signal });
    return () => controller.abort();
  }, [adminToken, carregarDenuncias]);

  useEffect(() => {
    if (!selectedDenuncia) return;

    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const releaseScrollLock = acquireBodyScrollLock();

    const container = modalRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    if (container) {
      const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedDenuncia(null);
        return;
      }

      if (event.key === 'Tab' && container) {
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(focusableSelector),
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      previouslyFocused?.focus();
    };
  }, [selectedDenuncia]);

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
      const isValid = await verifyAdminToken(token, { syncAuthContext: true });
      if (!isValid) {
        setLoginError('A conta autenticada não possui permissão de administrador.');
      }
    } catch (err) {
      setLoginError(mensagemErro(err, 'Falha ao autenticar.'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-rental-bg text-rental-ink transition-colors duration-300">
      <AdminNavigationHeader
        currentAdmin={adminUser}
        onLogout={adminToken ? handleLogout : undefined}
        pendingDenunciasCount={adminToken ? resumo.pendentes : undefined}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10 space-y-8">
        {isValidatingSession && (
          <div className="glass-panel rounded-3xl p-16 text-center flex flex-col items-center gap-4 border border-rental-border">
            <RefreshCw className="h-8 w-8 text-rental-primary animate-spin" />
            <p className="text-sm font-medium text-rental-muted">
              Verificando permissões de administrador...
            </p>
          </div>
        )}

        {!isValidatingSession && !adminToken && (
          <div className="max-w-md mx-auto my-12 animate-fadeIn">
            <div className="glass-panel-elevated rounded-3xl p-6 sm:p-8 border border-rental-border shadow-xl">
              <div className="flex items-center gap-3 text-rental-primary mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 border border-rental-primary/20">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Painel de Denúncias Restrito</h2>
                  <p className="text-xs text-rental-muted">Acesso exclusivo para administradores</p>
                </div>
              </div>

              <p className="text-xs text-rental-muted mb-6 leading-relaxed">
                A análise de denúncias e suspensão de contas exige autenticação com perfil
                administrativo ativo.
              </p>

              {loginError && (
                <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs text-rental-error">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <FormFieldWrapper id="admin-denuncias-email" label="E-mail Administrativo" required>
                  <TextInput
                    id="admin-denuncias-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@rentalspouse.com"
                    leftIcon={<Mail className="h-4 w-4" />}
                    required
                  />
                </FormFieldWrapper>

                <FormFieldWrapper id="admin-denuncias-password" label="Senha" required>
                  <PasswordInput
                    id="admin-denuncias-password"
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
                    Acessar Denúncias
                  </Button>
                </div>
              </form>

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

        {!isValidatingSession && adminToken && (
          <div className="space-y-8 animate-fadeIn">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-rental-border pb-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rental-border bg-rental-surface px-3 py-1 text-xs font-semibold text-rental-muted">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                  Moderação de Denúncias • Issues #99 &amp; #23
                </span>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Denúncias de Usuários
                </h1>
                <p className="mt-1.5 text-sm text-rental-muted max-w-2xl">
                  Acompanhe os relatos enviados pelos clientes sobre prestadores, filtre por status
                  ou motivo e analise o histórico de cada profissional.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => loadDenuncias(adminToken)}
                disabled={isLoadingList}
                leftIcon={<RefreshCw className={`h-4 w-4 ${isLoadingList ? 'animate-spin' : ''}`} />}
              >
                Atualizar
              </Button>
            </div>

            {/* Cards de Métricas no Topo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                aria-pressed={statusFilter === 'all'}
                className={`w-full text-left rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-rental-primary ${
                  statusFilter === 'all'
                    ? 'border-rental-primary/40 bg-rental-primary/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-primary">
                    Total de Denúncias
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
                    <Flag className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {resumo.total}
                  </span>
                  <span className="text-xs text-rental-muted">registradas</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('pendente')}
                aria-pressed={statusFilter === 'pendente'}
                className={`w-full text-left rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  statusFilter === 'pendente'
                    ? 'border-amber-500/40 bg-amber-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Pendentes de Análise
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {resumo.pendentes}
                  </span>
                  <span className="text-xs text-rental-muted">aguardando decisão</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('resolvida')}
                aria-pressed={statusFilter === 'resolvida'}
                className={`w-full text-left rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  statusFilter === 'resolvida'
                    ? 'border-red-500/40 bg-red-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Denúncias com Sanção
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                    <Ban className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {resumo.resolvidas_banimento}
                  </span>
                  <span className="text-xs text-rental-muted">resolvidas com banimento</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('arquivada')}
                aria-pressed={statusFilter === 'arquivada'}
                className={`w-full text-left rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  statusFilter === 'arquivada'
                    ? 'border-emerald-500/40 bg-emerald-500/10 shadow-sm'
                    : 'border-rental-border bg-rental-surface hover:border-rental-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Denúncias Arquivadas
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Archive className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono text-rental-ink">
                    {resumo.rejeitadas}
                  </span>
                  <span className="text-xs text-rental-muted">improcedentes</span>
                </div>
              </button>
            </div>

            {/* Barra de Filtros */}
            <div className="glass-panel rounded-2xl border border-rental-border p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { value: 'all', label: 'Todas' },
                    { value: 'pendente', label: 'Pendentes' },
                    { value: 'resolvida', label: 'Resolvidas' },
                    { value: 'arquivada', label: 'Arquivadas' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      statusFilter === tab.value
                        ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                        : 'bg-rental-surface2 text-rental-muted hover:text-rental-ink border border-rental-border'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <select
                  aria-label="Filtrar por motivo"
                  value={motivoFilter}
                  onChange={(e) => setMotivoFilter(e.target.value)}
                  className="rounded-xl border border-rental-border bg-rental-surface2 px-3 py-2 text-xs font-semibold text-rental-ink focus:outline-none focus:ring-2 focus:ring-rental-primary"
                >
                  <option value="all">Todos os motivos</option>
                  {DENUNCIA_MOTIVOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                <div className="relative min-w-[240px]">
                  <Search className="h-3.5 w-3.5 text-rental-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Buscar profissional ou cliente"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar profissional ou cliente..."
                    className="w-full rounded-xl border border-rental-border bg-rental-surface2 pl-9 pr-3 py-2 text-xs text-rental-ink placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary"
                  />
                </div>
              </div>
            </div>

            {/* Estados de Loading, Erro, Vazio e Tabela */}
            {isLoadingList && (
              <div className="glass-panel rounded-3xl p-14 text-center flex flex-col items-center gap-3 border border-rental-border">
                <RefreshCw className="h-7 w-7 text-rental-primary animate-spin" />
                <p className="text-sm font-medium text-rental-muted">
                  Carregando denúncias registradas...
                </p>
              </div>
            )}

            {!isLoadingList && listError && (
              <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rental-ink">
                    Erro ao carregar denúncias
                  </h3>
                  <p className="mt-1 text-xs text-rental-muted">{listError}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => loadDenuncias(adminToken)}
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                >
                  Tentar novamente
                </Button>
              </div>
            )}

            {!isLoadingList && !listError && denuncias.length === 0 && (
              <div className="glass-panel rounded-3xl border border-rental-border p-14 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-surface2 text-rental-muted">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-rental-ink">
                  Nenhuma denúncia encontrada
                </h3>
                <p className="text-xs text-rental-muted max-w-md mx-auto">
                  Não há denúncias correspondentes aos filtros aplicados no momento.
                </p>
              </div>
            )}

            {!isLoadingList && !listError && denuncias.length > 0 && (
              <div className="space-y-4">
                <div className="glass-panel rounded-3xl border border-rental-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-rental-border bg-rental-surface2/70 text-[11px] font-bold uppercase tracking-wider text-rental-muted">
                          <th className="py-3.5 px-4">ID / Data</th>
                          <th className="py-3.5 px-4">Profissional Denunciado</th>
                          <th className="py-3.5 px-4">Cliente Autor</th>
                          <th className="py-3.5 px-4">Motivo</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rental-border text-xs">
                        {denuncias.map((denuncia) => (
                          <tr
                            key={denuncia.id}
                            className="hover:bg-rental-surface2/40 transition-colors"
                          >
                            <td className="py-4 px-4 align-top whitespace-nowrap">
                              <span className="font-mono font-bold text-rental-ink">
                                #{denuncia.id}
                              </span>
                              <div className="text-[11px] text-rental-muted mt-0.5">
                                {formatarDataPtBr(denuncia.created_at)}
                              </div>
                            </td>

                            <td className="py-4 px-4 align-top">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-rental-ink">
                                  {denuncia.professional_name ||
                                    `Profissional #${denuncia.professional_id}`}
                                </span>
                                {denuncia.professional_is_active ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    <UserCheck className="h-2.5 w-2.5" />
                                    Ativo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/25 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                                    <Ban className="h-2.5 w-2.5" />
                                    Banido / Suspenso
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-rental-muted mt-0.5">
                                {denuncia.professional_email || 'E-mail indisponível'}
                              </div>
                              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
                                {denuncia.professional_total_denuncias}{' '}
                                {denuncia.professional_total_denuncias === 1
                                  ? 'denúncia recebida'
                                  : 'denúncias recebidas'}
                              </div>
                            </td>

                            <td className="py-4 px-4 align-top">
                              <div className="font-semibold text-rental-ink">
                                {denuncia.cliente_nome || `Cliente #${denuncia.cliente_id}`}
                              </div>
                              <div className="text-[11px] text-rental-muted mt-0.5">
                                {denuncia.cliente_email || 'E-mail indisponível'}
                              </div>
                            </td>

                            <td className="py-4 px-4 align-top max-w-[260px]">
                              <div className="font-semibold text-rental-ink">
                                {motivoDenunciaLabel(denuncia.motivo)}
                              </div>
                              <p className="text-[11px] text-rental-muted mt-1 line-clamp-2">
                                {denuncia.descricao}
                              </p>
                            </td>

                            <td className="py-4 px-4 align-top whitespace-nowrap">
                              <StatusBadge status={denuncia.status} />
                            </td>

                            <td className="py-4 px-4 align-top text-right whitespace-nowrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedDenuncia(denuncia)}
                                leftIcon={<Eye className="h-3.5 w-3.5" />}
                              >
                                Analisar Denúncia
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      isLoading={isLoadingMore}
                      loadingText="Carregando mais..."
                      onClick={() =>
                        carregarDenuncias(adminToken, {
                          skip: denuncias.length,
                          append: true,
                        })
                      }
                    >
                      Carregar mais denúncias
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Inspeção da Denúncia (ponto de extensão para decisões na Fatia 2) */}
      {selectedDenuncia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-denuncia-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedDenuncia(null);
            }
          }}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            className="glass-panel-elevated w-full max-w-2xl rounded-3xl border border-rental-border bg-rental-surface p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto focus:outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-rental-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-rental-primary">
                    Denúncia #{selectedDenuncia.id}
                  </span>
                  <StatusBadge status={selectedDenuncia.status} />
                </div>
                <h2 id="modal-denuncia-titulo" className="mt-1.5 text-xl font-extrabold">
                  {motivoDenunciaLabel(selectedDenuncia.motivo)}
                </h2>
                <p className="text-xs text-rental-muted mt-0.5">
                  Registrada em {formatarDataPtBr(selectedDenuncia.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDenuncia(null)}
                className="rounded-xl p-2 text-rental-muted hover:bg-rental-surface2 hover:text-rental-ink transition-colors"
                aria-label="Fechar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl border border-rental-border bg-rental-surface2/60 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rental-muted">
                  Profissional Denunciado
                </span>
                <p className="text-sm font-bold text-rental-ink">
                  {selectedDenuncia.professional_name ||
                    `Profissional #${selectedDenuncia.professional_id}`}
                </p>
                <p className="text-rental-muted">{selectedDenuncia.professional_email}</p>
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selectedDenuncia.professional_is_active
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {selectedDenuncia.professional_is_active ? 'Conta Ativa' : 'Conta Banida'}
                  </span>
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    Total no histórico: {selectedDenuncia.professional_total_denuncias}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-rental-border bg-rental-surface2/60 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rental-muted">
                  Cliente Autor
                </span>
                <p className="text-sm font-bold text-rental-ink">
                  {selectedDenuncia.cliente_nome || `Cliente #${selectedDenuncia.cliente_id}`}
                </p>
                <p className="text-rental-muted">{selectedDenuncia.cliente_email}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-rental-border bg-rental-surface2/40 p-4 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rental-muted">
                Relato Detalhado do Cliente
              </span>
              <p className="text-sm text-rental-ink leading-relaxed whitespace-pre-wrap">
                {selectedDenuncia.descricao}
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3.5 flex items-start gap-2.5 text-xs text-rental-muted">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                As ações de decisão administrativa (arquivar denúncia ou banir/suspender conta via{' '}
                <code>PATCH /api/admin/denuncias/{'{id}'}/moderar</code>) serão acopladas a este
                modal na Fatia 2 da Issue #99.
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t border-rental-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedDenuncia(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
