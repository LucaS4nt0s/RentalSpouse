'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  User,
  Wrench,
  ShieldCheck,
  Zap,
  PaintRoller,
  Hammer,
  Droplets,
  Star,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Button } from '../../components/ui/Button';
import { ProfessionalDocumentsLink } from '../../components/documentos/ProfessionalDocumentsLink';
import { useAuth, AuthUser } from '../../context/AuthContext';
import { validateEmail } from '../../utils/validators';

type Mode = 'signin' | 'signup';

export default function EntrarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-rental-bg text-rental-ink">
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-rental-primary border-t-transparent" />
            <span className="text-sm font-medium text-rental-muted">Carregando...</span>
          </div>
        </div>
      }
    >
      <EntrarPageContent />
    </Suspense>
  );
}

function EntrarPageContent() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const [mode, setMode] = useState<Mode>(() => (modeParam === 'signup' ? 'signup' : 'signin'));

  useEffect(() => {
    if (modeParam === 'signup' || modeParam === 'signin') {
      setMode(modeParam);
    }
  }, [modeParam]);

  return (
    <main className="min-h-screen bg-rental-bg text-rental-ink">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Painel de marca (esquerda) — full-bleed */}
        <section className="relative hidden overflow-hidden bg-[#1d4ed8] p-10 text-white md:flex md:min-h-screen md:w-1/2 md:flex-col md:justify-between md:p-12 lg:p-16">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -left-16 top-10 h-64 w-64 rounded-full bg-[#3b82f6] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#0e1b2e] blur-3xl" />
          </div>

          <div className="relative flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2 transition-opacity hover:opacity-90">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Zap className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
            </Link>
          </div>

          <div className="relative space-y-6">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight lg:text-4xl">
              O jeito mais fácil de contratar (e oferecer) serviços residenciais.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/85">
              Encontre profissionais avaliados perto de você — elétrica, hidráulica, montagem,
              pintura e muito mais. Rápido, seguro e sem sair de casa.
            </p>

            <div className="flex flex-wrap gap-3 pt-2 text-white/90">
              {[Wrench, Droplets, PaintRoller, Hammer].map((Icon, i) => (
                <span
                  key={i}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20"
                >
                  <Icon className="h-5 w-5" />
                </span>
              ))}
              <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold ring-1 ring-white/20">
                <Star className="h-3.5 w-3.5 fill-current" /> +12 mil profissionais
              </span>
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-white/80">
            <ShieldCheck className="h-4 w-4" />
            Pagamento protegido e profissionais verificados
          </div>
        </section>

        {/* Painel do formulário (direita) */}
        <section className="flex flex-1 flex-col px-5 py-8 sm:px-10">
          <header className="mb-6 flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-rental-muted transition-colors hover:text-rental-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Início
            </Link>
            <ThemeToggle showLabel={false} />
          </header>

          {/* Marca no mobile */}
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-white">
                <Zap className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
            </Link>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto w-full max-w-md">
              {/* Seletor de abas: Entrar / Criar Conta */}
              <div className="mb-6 flex rounded-xl border border-rental-border bg-rental-surface2 p-1">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                    mode === 'signin'
                      ? 'bg-rental-surface text-rental-ink shadow-sm'
                      : 'text-rental-muted hover:text-rental-ink'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                    mode === 'signup'
                      ? 'bg-rental-surface text-rental-ink shadow-sm'
                      : 'text-rental-muted hover:text-rental-ink'
                  }`}
                >
                  Criar conta
                </button>
              </div>

              {mode === 'signin' ? <SignIn onSwitchToSignUp={() => setMode('signup')} /> : <SignUp />}

              <p className="mt-8 text-center text-sm text-rental-muted">
                {mode === 'signin' ? (
                  <>
                    Ainda não tem conta?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className="font-bold text-rental-primary hover:underline"
                    >
                      Cadastre-se
                    </button>
                  </>
                ) : (
                  <>
                    Já tem uma conta?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className="font-bold text-rental-primary hover:underline"
                    >
                      Entrar
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SignIn({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { user, login, logout, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordNotice, setForgotPasswordNotice] = useState(false);

  // Estados de formulário e validação
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<{
    type: 'invalid_credentials' | 'network' | 'validation' | 'unverified_email';
    message: string;
  } | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<AuthUser | null>(null);

  // Segura renderização para evitar flash de "deslogado" (FOUC)
  if (authLoading) {
    return (
      <div className="animate-pulse space-y-4 rounded-2xl border border-rental-border bg-rental-surface p-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-rental-surface2" />
        <div className="mx-auto h-5 w-48 rounded bg-rental-surface2" />
        <div className="mx-auto h-4 w-64 rounded bg-rental-surface2" />
      </div>
    );
  }

  // Se já estiver logado, exibe cartão de perfil ativo
  if (isAuthenticated && user && !loginSuccess) {
    return (
      <div className="animate-fadeIn rounded-2xl border border-rental-border bg-rental-surface p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
          <User className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-rental-ink">Você já está conectado</h2>
        <p className="mt-1 text-sm text-rental-muted">
          Conectado como <strong className="text-rental-ink">{user.nome}</strong> ({user.email})
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link href="/">
            <Button variant="primary" size="md" className="w-full" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Ir para a Página Inicial
            </Button>
          </Link>
          <ProfessionalDocumentsLink variant="card" />
          <Button
            variant="secondary"
            size="md"
            onClick={logout}
            className="w-full"
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Sair ou entrar com outra conta
          </Button>
        </div>
      </div>
    );
  }

  // Estado 3: Sucesso de Autenticação
  if (loginSuccess) {
    return (
      <div className="animate-fadeIn rounded-2xl border border-[var(--rs-success)]/30 bg-rental-surface p-6 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--rs-success)]/10 text-[var(--rs-success)]">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-rental-ink">Bem-vindo(a) de volta!</h2>
        <p className="mt-1.5 text-sm text-rental-muted">
          Olá, <strong className="text-rental-ink">{loginSuccess.nome}</strong>. Seu login foi realizado com sucesso.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => router.push('/')}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Acessar Plataforma
          </Button>
          <ProfessionalDocumentsLink variant="card" />
        </div>
      </div>
    );
  }

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      errors.email = 'Informe o seu e-mail cadastrado.';
    } else {
      const emailValidation = validateEmail(cleanEmail);
      if (!emailValidation.isValid) {
        errors.email = emailValidation.message ?? 'Formato de e-mail inválido.';
      }
    }

    if (!password) {
      errors.password = 'Informe sua senha de acesso.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const authUser: AuthUser = data.user;
        const authToken: string = data.access_token;
        if (!authUser || !authToken) {
          throw new Error('Resposta de autenticação inválida do servidor.');
        }
        login(authUser, authToken);
        setLoginSuccess(authUser);
      } else if (response.status === 401) {
        setServerError({
          type: 'invalid_credentials',
          message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.',
        });
      } else if (response.status === 403) {
        const errorData = await response.json().catch(() => null);
        const detailMsg =
          typeof errorData?.detail === 'string'
            ? errorData.detail
            : 'E-mail pendente de confirmação. Por favor, verifique sua caixa de entrada.';
        setServerError({
          type: 'unverified_email',
          message: detailMsg,
        });
      } else if (response.status === 422) {
        setServerError({
          type: 'validation',
          message: 'Dados inválidos informados. Verifique os campos digitados.',
        });
      } else {
        setServerError({
          type: 'network',
          message: 'Ocorreu um erro no servidor ao tentar realizar o login. Tente novamente mais tarde.',
        });
      }
    } catch (err) {
      setServerError({
        type: 'network',
        message: 'Não foi possível conectar ao servidor RentalSpouse. Verifique se a API está online.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Entrar na sua conta</h2>
      <p className="mt-1.5 text-sm text-rental-muted">
        Bom te ver de novo. Acesse para continuar seus serviços.
      </p>

      {/* Estado 2: Banner de Erro Global */}
      {serverError && (
        <div
          className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-3.5 text-xs text-[var(--rs-error)] animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold block">{serverError.message}</span>
            {serverError.type === 'invalid_credentials' && (
              <span className="mt-1 block text-rental-muted">
                Esqueceu sua senha ou não tem cadastro?{' '}
                <button
                  type="button"
                  onClick={onSwitchToSignUp}
                  className="font-bold text-rental-primary hover:underline ml-1"
                >
                  Cadastre-se aqui
                </button>
              </span>
            )}
            {serverError.type === 'unverified_email' && (
              <span className="mt-1 block text-rental-muted">
                Não recebeu ou perdeu o link de ativação?{' '}
                <Link
                  href="/verificar-email"
                  className="font-bold text-rental-primary hover:underline ml-1"
                >
                  Reenviar confirmação
                </Link>
              </span>
            )}
          </div>
          {serverError.type === 'network' && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 font-bold text-rental-primary hover:underline shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Tentar
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        {/* Campo E-mail */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wide text-rental-muted">
              E-mail
            </label>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-rental-muted">
              <Mail className="h-4 w-4" />
            </span>
            <input
              id="login-email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              disabled={isLoading}
              autoComplete="email"
              placeholder="voce@exemplo.com"
              className={`glass-input h-12 w-full rounded-xl pl-11 pr-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.email ? 'border-[var(--rs-error)] focus:ring-[var(--rs-error)]' : ''
              }`}
            />
          </div>
          {fieldErrors.email && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--rs-error)] animate-fadeIn">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{fieldErrors.email}</span>
            </div>
          )}
        </div>

        {/* Campo Senha */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wide text-rental-muted">
              Senha
            </label>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setForgotPasswordNotice((v) => !v)}
              className="text-xs font-semibold text-rental-primary hover:underline"
            >
              Esqueci minha senha
            </button>
          </div>
          {forgotPasswordNotice && (
            <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-rental-border bg-rental-surface2 p-3 text-xs text-rental-ink animate-fadeIn">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rental-primary" />
              <div>
                <span className="font-bold text-rental-ink">Recuperação de conta</span>
                <p className="mt-0.5 text-rental-muted">
                  O fluxo automatizado de redefinição de senha está em desenvolvimento. Para redefinir sua senha agora, solicite via{' '}
                  <span className="font-semibold text-rental-primary">suporte@rentalspouse.com</span>.
                </p>
              </div>
            </div>
          )}
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-rental-muted">
              <Lock className="h-4 w-4" />
            </span>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              disabled={isLoading}
              autoComplete="current-password"
              placeholder="••••••••"
              className={`glass-input h-12 w-full rounded-xl pl-11 pr-12 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                fieldErrors.password ? 'border-[var(--rs-error)] focus:ring-[var(--rs-error)]' : ''
              }`}
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-rental-muted transition-colors hover:text-rental-ink"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {fieldErrors.password && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--rs-error)] animate-fadeIn">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{fieldErrors.password}</span>
            </div>
          )}
        </div>

        {/* Estado 1: Botão com Loading */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          loadingText="Entrando na sua conta..."
          className="w-full mt-2"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Entrar
        </Button>
      </form>
    </div>
  );
}

function SignUp() {
  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Criar conta</h2>
      <p className="mt-1.5 text-sm text-rental-muted">
        Escolha o seu perfil de cadastro para começar.
      </p>

      <div className="mt-6 grid gap-3">
        <TypeCard
          href="/cadastro/cliente"
          icon={<User className="h-6 w-6" />}
          title="Sou Cliente"
          description="Quero contratar serviços residenciais com rapidez e segurança"
        />
        <TypeCard
          href="/cadastro/profissional"
          icon={<Wrench className="h-6 w-6" />}
          title="Sou Profissional"
          description="Quero oferecer meus serviços, receber orçamentos e pedidos"
        />
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-rental-muted">
        Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade do
        RentalSpouse.
      </p>
    </div>
  );
}

function TypeCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-rental-border bg-rental-surface p-4 transition-all hover:border-rental-primary hover:bg-rental-surface2"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rental-primary/10 text-rental-primary transition-transform group-hover:scale-105">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-rental-ink">{title}</span>
        <span className="block text-xs text-rental-muted">{description}</span>
      </span>
      <ArrowRight className="h-5 w-5 text-rental-muted transition-transform group-hover:translate-x-1 group-hover:text-rental-primary" />
    </Link>
  );
}
