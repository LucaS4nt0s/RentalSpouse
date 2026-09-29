'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Lock,
  Mail,
  User,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Zap,
  KeyRound,
  Shield,
  Sparkles,
} from 'lucide-react';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { Button } from '../../../components/ui/Button';
import { TextInput } from '../../../components/ui/TextInput';
import { PasswordInput } from '../../../components/ui/PasswordInput';
import { FormFieldWrapper } from '../../../components/ui/FormFieldWrapper';
import { PasswordStrengthMeter } from '../../../components/ui/PasswordStrengthMeter';
import { usePasswordStrength } from '../../../hooks/usePasswordStrength';
import { validateEmail, validatePasswordMatch } from '../../../utils/validators';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const STORAGE_KEY = 'rentalspouse_admin_token';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

export default function CadastroAdminPage() {
  // Estado da sessão do administrador autenticado
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [isValidatingSession, setIsValidatingSession] = useState<boolean>(true);

  // Estado do formulário de login (quando deslogado)
  const [loginEmail, setLoginEmail] = useState<string>('admin@rentalspouse.com');
  const [loginPassword, setLoginPassword] = useState<string>('Admin@123456');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Estado do formulário de cadastro de novo admin
  const [newName, setNewName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Erros de campo
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // Feedback global do formulário
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdAdmin, setCreatedAdmin] = useState<AdminUser | null>(null);

  // Lista de administradores cadastrados
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);

  // Medidor de força da senha
  const passwordEvaluation = usePasswordStrength(newPassword);

  // 1. Carrega sessão salva no localStorage ao montar a página
  const verifySession = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Sessão expirada');
      }

      const user: AdminUser = await res.json();
      if (user.role !== 'admin') {
        throw new Error('Usuário autenticado não possui perfil de administrador');
      }

      setCurrentAdmin(user);
      setAuthToken(token);
      return true;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken(null);
      setCurrentAdmin(null);
      return false;
    } finally {
      setIsValidatingSession(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_KEY);
    if (savedToken) {
      verifySession(savedToken);
    } else {
      setIsValidatingSession(false);
    }
  }, [verifySession]);

  // 2. Busca lista de administradores
  const fetchAdmins = useCallback(async (token: string) => {
    setIsLoadingList(true);
    try {
      const res = await fetch(`${API_URL}/api/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminsList(data);
      }
    } catch {
      // Ignora erro de rede silenciosamente
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      fetchAdmins(authToken);
    }
  }, [authToken, fetchAdmins]);

  // 3. Login do Administrador
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Credenciais inválidas. Verifique e-mail e senha.');
      }

      const token = data.access_token;
      localStorage.setItem(STORAGE_KEY, token);

      const isValid = await verifySession(token);
      if (isValid) {
        fetchAdmins(token);
      } else {
        setLoginError('A conta autenticada não possui permissão de administrador.');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Falha ao autenticar.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 4. Logout
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setCurrentAdmin(null);
    setCreatedAdmin(null);
    setAdminsList([]);
  };

  // 5. Submissão do cadastro de novo admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreatedAdmin(null);

    // Validações locais
    const errors: typeof fieldErrors = {};
    if (!newName.trim() || newName.trim().length < 2) {
      errors.name = 'O nome deve ter no mínimo 2 caracteres.';
    }

    const emailCheck = validateEmail(newEmail);
    if (!emailCheck.isValid) {
      errors.email = emailCheck.message;
    }

    if (!newPassword || newPassword.length < 8) {
      errors.password = 'A senha deve conter no mínimo 8 caracteres.';
    }

    const matchCheck = validatePasswordMatch(newPassword, confirmPassword);
    if (!matchCheck.isValid) {
      errors.confirmPassword = matchCheck.message;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        setCreatedAdmin(data);
        setNewName('');
        setNewEmail('');
        setNewPassword('');
        setConfirmPassword('');
        if (authToken) {
          fetchAdmins(authToken);
        }
        return;
      }

      if (res.status === 409) {
        setFormError('Já existe um usuário cadastrado com este e-mail.');
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setFormError('Sua sessão de administrador expirou ou não possui permissão. Faça login novamente.');
        handleLogout();
        return;
      }

      if (res.status === 422) {
        const detailMsg = Array.isArray(data.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
          : 'Dados inválidos. Revise os campos preenchidos.';
        setFormError(detailMsg);
        return;
      }

      throw new Error(data.detail || `Erro ${res.status}: Não foi possível cadastrar o administrador.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha na conexão com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-rental-bg text-rental-ink relative overflow-hidden transition-colors duration-300">
      {/* Luzes decorativas ambientais */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#1D4ED8]/10 dark:bg-[#1D4ED8]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-[#16263F]/10 dark:bg-[var(--rs-surface)]/30 rounded-full blur-[160px] pointer-events-none" />

      {/* Topo / Barra de Navegação */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 border-b border-rental-border">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)] shadow-primary transition-transform hover:scale-105"
            title="Voltar ao início"
          >
            <Zap className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rental-primary/10 border border-rental-primary/20 px-2 py-0.5 text-[11px] font-bold text-rental-primary">
                <Shield className="h-3 w-3" /> Admin
              </span>
            </div>
            <p className="text-xs text-rental-muted">Portal de Gestão e Segurança</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rental-muted hover:text-rental-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <ThemeToggle showLabel={false} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Cabeçalho da Página */}
        <div className="mb-8 text-center sm:text-left sm:flex sm:items-center sm:justify-between border-b border-rental-border pb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rental-border bg-rental-surface px-3 py-1 text-xs font-semibold text-rental-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-rental-primary" />
              Camada de Segurança • Issue #37
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Cadastro de Administradores
            </h1>
            <p className="mt-1.5 text-sm text-rental-muted max-w-xl">
              Gerencie os administradores do RentalSpouse. O registro de novos administradores é
              restrito exclusivamente a usuários com privilégios de administrador autenticados.
            </p>
          </div>
        </div>

        {/* Loading de verificação de sessão */}
        {isValidatingSession && (
          <div className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center gap-4">
            <RefreshCw className="h-8 w-8 text-rental-primary animate-spin" />
            <p className="text-sm font-medium text-rental-muted">Verificando credenciais de administrador...</p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 1: NÃO AUTENTICADO COMO ADMIN -> FORMULÁRIO DE LOGIN              */}
        {/* ========================================================================= */}
        {!isValidatingSession && !authToken && (
          <div className="glass-panel-elevated rounded-3xl p-6 sm:p-10 max-w-xl mx-auto animate-fadeIn border border-rental-border">
            <div className="flex items-center gap-3 text-rental-primary mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 border border-rental-primary/20">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Autenticação Obrigatória</h2>
                <p className="text-xs text-rental-muted">Acesso restrito a administradores</p>
              </div>
            </div>

            <p className="text-xs text-rental-muted mt-3 mb-6 leading-relaxed">
              Pelo princípio de menor privilégio e pela regra de segurança da aplicação, apenas administradores
              ativos podem cadastrar novos administradores. Autentique-se com sua conta para continuar.
            </p>

            {loginError && (
              <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs text-rental-error animate-shake">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <FormFieldWrapper id="login-email" label="E-mail de Administrador" required>
                <TextInput
                  id="login-email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@rentalspouse.com"
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
              </FormFieldWrapper>

              <FormFieldWrapper id="login-password" label="Senha" required>
                <PasswordInput
                  id="login-password"
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
                  Entrar como Administrador
                </Button>
              </div>
            </form>

            {/* Dica / Preenchimento de dev */}
            <div className="mt-6 rounded-2xl border border-dashed border-rental-border bg-rental-surface2/60 p-4 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-rental-primary mb-1">
                <Sparkles className="h-3.5 w-3.5" />
                Atalho para Desenvolvimento (Seed Inicial)
              </div>
              <p className="text-rental-muted text-[11px] leading-relaxed mb-3">
                Caso seja o primeiro acesso local, o backend semeou o administrador padrão automaticamente:
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-rental-surface rounded-xl p-2.5 border border-rental-border font-mono text-[11px]">
                <span>admin@rentalspouse.com • Admin@123456</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('admin@rentalspouse.com');
                    setLoginPassword('Admin@123456');
                  }}
                  className="text-rental-primary hover:underline font-bold text-[11px] shrink-0"
                >
                  Usar estas credenciais
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 2: ADMIN AUTENTICADO -> FORMULÁRIO DE CADASTRO E LISTA              */}
        {/* ========================================================================= */}
        {!isValidatingSession && authToken && currentAdmin && (
          <div className="space-y-8 animate-fadeIn">
            {/* Banner de Sessão Ativa */}
            <div className="glass-card-subtle rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-rental-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-rental-muted">Sessão Ativa:</span>
                    <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                      ADMIN AUTENTICADO
                    </span>
                  </div>
                  <p className="text-sm font-bold text-rental-ink">
                    {currentAdmin.name}{' '}
                    <span className="font-normal text-xs text-rental-muted">({currentAdmin.email})</span>
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLogout}
                leftIcon={<LogOut className="h-3.5 w-3.5" />}
              >
                Encerrar Sessão
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Formulário de Cadastro (7 colunas) */}
              <div className="lg:col-span-7">
                <div className="glass-panel-elevated rounded-3xl p-6 sm:p-8 border border-rental-border">
                  <div className="flex items-center gap-2.5 mb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rental-primary/10 text-rental-primary">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Novo Administrador</h2>
                      <p className="text-xs text-rental-muted">Preencha as credenciais de acesso</p>
                    </div>
                  </div>

                  {/* Feedback de Sucesso */}
                  {createdAdmin && (
                    <div className="mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-xs animate-fadeIn">
                      <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400 text-sm mb-1">
                        <CheckCircle2 className="h-5 w-5" />
                        Administrador cadastrado com sucesso!
                      </div>
                      <p className="text-rental-muted mb-2">
                        O novo administrador já pode efetuar login e gerenciar a plataforma.
                      </p>
                      <div className="bg-rental-surface rounded-xl p-3 border border-rental-border font-mono text-[11px] space-y-1">
                        <div>
                          <strong>ID:</strong> #{createdAdmin.id}
                        </div>
                        <div>
                          <strong>Nome:</strong> {createdAdmin.name}
                        </div>
                        <div>
                          <strong>E-mail:</strong> {createdAdmin.email}
                        </div>
                        <div>
                          <strong>Papel:</strong> {createdAdmin.role}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feedback de Erro */}
                  {formError && (
                    <div className="mb-6 flex items-start gap-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-rental-error animate-shake">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleCreateAdmin} className="space-y-4" noValidate>
                    <FormFieldWrapper
                      id="admin-name"
                      label="Nome Completo"
                      required
                      error={fieldErrors.name}
                    >
                      <TextInput
                        id="admin-name"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value);
                          if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        placeholder="Ex: Carlos Oliveira"
                        leftIcon={<User className="h-4 w-4" />}
                        hasError={!!fieldErrors.name}
                        required
                      />
                    </FormFieldWrapper>

                    <FormFieldWrapper
                      id="admin-email"
                      label="E-mail Institucional"
                      required
                      error={fieldErrors.email}
                    >
                      <TextInput
                        id="admin-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => {
                          setNewEmail(e.target.value);
                          if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                        }}
                        placeholder="carlos.admin@rentalspouse.com"
                        leftIcon={<Mail className="h-4 w-4" />}
                        hasError={!!fieldErrors.email}
                        required
                      />
                    </FormFieldWrapper>

                    <FormFieldWrapper
                      id="admin-password"
                      label="Senha de Acesso"
                      required
                      error={fieldErrors.password}
                    >
                      <PasswordInput
                        id="admin-password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }}
                        placeholder="Mínimo 8 caracteres"
                        hasError={!!fieldErrors.password}
                        required
                      />
                    </FormFieldWrapper>

                    {newPassword.length > 0 && (
                      <PasswordStrengthMeter evaluation={passwordEvaluation} />
                    )}

                    <FormFieldWrapper
                      id="admin-confirm-password"
                      label="Confirmar Senha"
                      required
                      error={fieldErrors.confirmPassword}
                    >
                      <PasswordInput
                        id="admin-confirm-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (fieldErrors.confirmPassword) {
                            setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                          }
                        }}
                        placeholder="Repita a senha digitada"
                        hasError={!!fieldErrors.confirmPassword}
                        required
                      />
                    </FormFieldWrapper>

                    <div className="pt-3">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        isLoading={isSubmitting}
                        loadingText="Gravando administrador..."
                        leftIcon={<UserPlus className="h-4 w-4" />}
                      >
                        Cadastrar Novo Administrador
                      </Button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Lista de Administradores Cadastrados (5 colunas) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-panel rounded-3xl p-6 border border-rental-border">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-rental-border">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-rental-primary" />
                      <h3 className="text-sm font-bold">Administradores Ativos</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => authToken && fetchAdmins(authToken)}
                      disabled={isLoadingList}
                      className="p-1.5 rounded-lg text-rental-muted hover:text-rental-primary hover:bg-rental-surface2 transition-colors"
                      title="Atualizar lista"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingList ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {isLoadingList && adminsList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-rental-muted">
                      Carregando administradores...
                    </div>
                  ) : adminsList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-rental-muted">
                      Nenhum administrador encontrado.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                      {adminsList.map((adm) => (
                        <div
                          key={adm.id}
                          className="glass-card-subtle rounded-2xl p-3.5 border border-rental-border flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold truncate">{adm.name}</span>
                              {adm.id === currentAdmin.id && (
                                <span className="bg-rental-primary/10 text-rental-primary font-bold text-[10px] px-1.5 py-0.2 rounded">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-rental-muted truncate text-[11px] font-mono">
                              {adm.email}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                            ATIVO
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-rental-border text-[11px] text-rental-muted flex items-center justify-between">
                    <span>Total cadastrados:</span>
                    <span className="font-bold font-mono text-rental-ink">{adminsList.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
