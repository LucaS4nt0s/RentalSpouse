'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

type Mode = 'signin' | 'signup';

export default function EntrarPage() {
  const [mode, setMode] = useState<Mode>('signup');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('O login será conectado ao backend de autenticação em breve.');
  };

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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-white">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto w-full max-w-md">
              {mode === 'signin' ? (
                <SignIn
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((v) => !v)}
                  onSubmit={handleSignIn}
                  notice={notice}
                />
              ) : (
                <SignUp />
              )}

              <p className="mt-8 text-center text-sm text-rental-muted">
                {mode === 'signin' ? (
                  <>
                    Ainda não tem conta?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setNotice(null);
                      }}
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

function SignIn({
  showPassword,
  onTogglePassword,
  onSubmit,
  notice,
}: {
  showPassword: boolean;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  notice: string | null;
}) {
  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Entrar na sua conta</h2>
      <p className="mt-1.5 text-sm text-rental-muted">
        Bom te ver de novo. Acesse para continuar.
      </p>

      {notice && (
        <div className="mt-5 rounded-xl border border-rental-border bg-rental-surface2 px-4 py-3 text-xs text-rental-muted" role="status">
          {notice}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="E-mail" icon={<Mail className="h-4 w-4" />}>
          <input
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            className="glass-input h-12 w-full rounded-xl pl-11 pr-4 text-sm font-medium"
          />
        </Field>

        <Field
          label="Senha"
          icon={<Lock className="h-4 w-4" />}
          action={
            <button type="button" className="text-xs font-semibold text-rental-primary hover:underline">
              Esqueci minha senha
            </button>
          }
        >
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="glass-input h-12 w-full rounded-xl pl-11 pr-12 text-sm font-medium"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rental-muted transition-colors hover:text-rental-ink"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </Field>

        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rental-primary text-sm font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
        >
          Entrar
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function SignUp() {
  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Criar conta</h2>
      <p className="mt-1.5 text-sm text-rental-muted">
        Escolha o tipo de cadastro para começar.
      </p>

      <div className="mt-6 grid gap-3">
        <TypeCard
          href="/cadastro/cliente"
          icon={<User className="h-6 w-6" />}
          title="Sou Cliente"
          description="Quero contratar serviços para minha casa"
        />
        <TypeCard
          href="/cadastro/profissional"
          icon={<Wrench className="h-6 w-6" />}
          title="Sou Profissional"
          description="Quero oferecer meus serviços e receber pedidos"
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
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rental-primary/10 text-rental-primary">
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

function Field({
  label,
  icon,
  action,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wide text-rental-muted">
          {label}
        </label>
        {action}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-rental-muted">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
