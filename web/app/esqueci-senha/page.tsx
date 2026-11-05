'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { validateEmail } from '../../utils/validators';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setServerError(null);
    setFieldError(null);

    const validacao = validateEmail(email);
    if (!validacao.isValid) {
      setFieldError(validacao.message ?? 'Informe um e-mail válido.');
      return;
    }

    setIsLoading(true);

    try {
      const resposta = await fetch(`${API_URL}/api/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (resposta.status === 202) {
        const dados = await resposta.json().catch(() => null);
        setMensagemSucesso(
          dados?.mensagem ??
            'Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.',
        );
        return;
      }

      if (resposta.status === 422) {
        setFieldError('Digite um endereço de e-mail válido.');
        return;
      }

      setServerError(
        'Não foi possível solicitar a recuperação agora. Tente novamente em instantes.',
      );
    } catch {
      setServerError(
        'Não foi possível conectar ao servidor RentalSpouse. Verifique sua conexão e tente novamente.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] text-[#0E1B2E] dark:text-[#EAF1FB] relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1D4ED8]/15 dark:bg-[#1D4ED8]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#16263F]/10 dark:bg-[var(--rs-surface)]/40 rounded-full blur-[140px] pointer-events-none" />

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-xl glass-panel-elevated rounded-3xl p-8 sm:p-12 animate-fadeIn transition-colors">
        <Link
          href="/entrar"
          className="inline-flex items-center gap-2 text-sm font-semibold text-rental-muted transition-colors hover:text-rental-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para entrar
        </Link>

        <div className="mt-6 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rental-primary text-white">
            <Zap className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
        </div>

        {mensagemSucesso ? (
          <div className="mt-8 text-center animate-fadeIn">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Verifique seu e-mail
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-rental-muted">
              {mensagemSucesso}
            </p>
            <div className="mt-6 rounded-2xl border border-rental-border bg-rental-surface2 p-4 text-left text-xs text-rental-muted">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rental-primary" />
                <span>
                  Por segurança, o link expira em poucos minutos e só pode ser usado uma
                  vez. Se não encontrar o e-mail, confira a pasta de spam ou lixo
                  eletrônico.
                </span>
              </div>
            </div>
            <Link href="/entrar" className="mt-6 block">
              <Button variant="primary" size="lg" className="w-full">
                Voltar para entrar
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Esqueceu sua senha?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-rental-muted">
              Informe o e-mail cadastrado na sua conta. Enviaremos um link seguro para
              você criar uma nova senha.
            </p>

            {serverError && (
              <div
                className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-3.5 text-xs text-[var(--rs-error)] animate-fadeIn"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="font-semibold">{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="recuperacao-email"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-rental-muted"
                >
                  E-mail
                </label>
                <TextInput
                  id="recuperacao-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(evento) => {
                    setEmail(evento.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  disabled={isLoading}
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  leftIcon={<Mail className="h-4 w-4" />}
                  hasError={Boolean(fieldError)}
                  className="h-12"
                />
                {fieldError && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--rs-error)] animate-fadeIn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{fieldError}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                loadingText="Enviando link..."
                className="w-full"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Enviar link de recuperação
              </Button>
            </form>

            <p className="mt-6 text-center text-xs leading-relaxed text-rental-muted">
              Sua senha atual continua válida até que você conclua a redefinição.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
