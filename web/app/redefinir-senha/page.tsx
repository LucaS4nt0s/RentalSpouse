'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Button } from '../../components/ui/Button';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrengthMeter } from '../../components/ui/PasswordStrengthMeter';
import { usePasswordStrength } from '../../hooks/usePasswordStrength';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Errors = {
  novaSenha?: string;
  confirmarSenha?: string;
};

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<TelaCarregando />}>
      <RedefinirSenhaContent />
    </Suspense>
  );
}

function TelaCarregando() {
  return (
    <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] flex items-center justify-center p-4">
      <div className="flex items-center gap-3 text-sm font-medium text-rental-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-rental-primary border-t-transparent" />
        Carregando...
      </div>
    </main>
  );
}

function RedefinirSenhaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const forcaSenha = usePasswordStrength(novaSenha);

  const validar = (): boolean => {
    const novosErros: Errors = {};

    if (!novaSenha) {
      novosErros.novaSenha = 'Informe a nova senha.';
    } else if (!forcaSenha.isValid) {
      novosErros.novaSenha = 'A nova senha deve cumprir todos os 5 critérios de segurança.';
    }

    if (!confirmarSenha) {
      novosErros.confirmarSenha = 'Confirme a nova senha.';
    } else if (confirmarSenha !== novaSenha) {
      novosErros.confirmarSenha = 'A confirmação não confere com a nova senha.';
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setServerError(null);

    if (!validar()) return;

    setIsLoading(true);

    try {
      const resposta = await fetch(`${API_URL}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token,
          nova_senha: novaSenha,
          confirmar_nova_senha: confirmarSenha,
        }),
      });

      if (resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        setSucesso(
          dados?.mensagem ??
            'Senha redefinida com sucesso! Você já pode entrar com a nova senha.',
        );
        return;
      }

      if (resposta.status === 400) {
        const dados = await resposta.json().catch(() => null);
        setServerError(
          typeof dados?.detail === 'string'
            ? dados.detail
            : 'Link de redefinição inválido ou expirado. Solicite um novo link.',
        );
        return;
      }

      if (resposta.status === 422) {
        setServerError('Dados inválidos. Revise os campos e tente novamente.');
        return;
      }

      setServerError('Não foi possível redefinir a senha agora. Tente novamente.');
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

        {sucesso ? (
          <div className="mt-8 text-center animate-fadeIn">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Senha redefinida!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-rental-muted">{sucesso}</p>
            <Link href="/entrar" className="mt-6 block">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Entrar com a nova senha
              </Button>
            </Link>
          </div>
        ) : !token ? (
          <div className="mt-8 text-center animate-fadeIn">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/15 border-2 border-rose-500 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-10 w-10" />
            </div>
            <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Link incompleto
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-rental-muted">
              O endereço acessado não contém um token de redefinição. Copie o link
              completo do e-mail ou solicite um novo.
            </p>
            <Link href="/esqueci-senha" className="mt-6 block">
              <Button variant="primary" size="lg" className="w-full">
                Solicitar novo link
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Crie uma nova senha
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-rental-muted">
              Escolha uma senha forte e diferente das anteriores para proteger sua conta.
            </p>

            {serverError && (
              <div
                className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-3.5 text-xs text-[var(--rs-error)] animate-fadeIn"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <span className="font-semibold block">{serverError}</span>
                  <Link
                    href="/esqueci-senha"
                    className="mt-1 inline-block font-bold text-rental-primary hover:underline"
                  >
                    Solicitar um novo link
                  </Link>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="nova-senha"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-rental-muted"
                >
                  Nova senha
                </label>
                <PasswordInput
                  id="nova-senha"
                  name="nova_senha"
                  value={novaSenha}
                  onChange={(evento) => {
                    setNovaSenha(evento.target.value);
                    if (errors.novaSenha) {
                      setErrors((prev) => ({ ...prev, novaSenha: undefined }));
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Digite sua nova senha"
                  leftIcon={<Lock className="h-4 w-4" />}
                  hasError={Boolean(errors.novaSenha)}
                  className="h-12"
                />
                {errors.novaSenha && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--rs-error)] animate-fadeIn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{errors.novaSenha}</span>
                  </div>
                )}
                {novaSenha && <PasswordStrengthMeter evaluation={forcaSenha} />}
              </div>

              <div>
                <label
                  htmlFor="confirmar-nova-senha"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-rental-muted"
                >
                  Confirmar nova senha
                </label>
                <PasswordInput
                  id="confirmar-nova-senha"
                  name="confirmar_nova_senha"
                  value={confirmarSenha}
                  onChange={(evento) => {
                    setConfirmarSenha(evento.target.value);
                    if (errors.confirmarSenha) {
                      setErrors((prev) => ({ ...prev, confirmarSenha: undefined }));
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Repita a nova senha"
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                  hasError={Boolean(errors.confirmarSenha)}
                  className="h-12"
                />
                {errors.confirmarSenha && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--rs-error)] animate-fadeIn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{errors.confirmarSenha}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                loadingText="Redefinindo senha..."
                className="w-full"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Redefinir senha
              </Button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
