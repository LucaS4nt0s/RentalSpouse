'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { ThemeToggle } from '../ui/ThemeToggle';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Estado = 'carregando' | 'sucesso' | 'erro' | 'link-ausente';

interface ResultadoConfirmacao {
  email: string;
  email_verificado: boolean;
  mensagem: string;
}

/**
 * Extrai a mensagem de erro devolvida pela API.
 *
 * O endpoint de confirmação responde `{"detail": "..."}` (string) em erros de
 * negócio e o FastAPI responde um array de validação (HTTP 422) quando o token
 * nem chega a ser processado — nesse caso usamos uma mensagem amigável própria.
 */
function extrairMensagemDeErro(corpo: unknown): string {
  if (corpo && typeof corpo === 'object' && 'detail' in corpo) {
    const detalhe = (corpo as { detail: unknown }).detail;
    if (typeof detalhe === 'string') return detalhe;
  }
  return 'O link de verificação é inválido ou está incompleto.';
}

/**
 * Card de confirmação de e-mail.
 *
 * Lê o token do parâmetro `?token=` do link recebido por e-mail e o submete no
 * CORPO da requisição para `POST /api/verificacao/confirmar` — assim o token
 * não fica registrado nos logs de acesso da API.
 *
 * Trata os três estados obrigatórios (AI_RULES.md § 2.2.3):
 * loading, error (com retry e reenvio) e success.
 */
export function VerificarEmailCard() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [estado, setEstado] = useState<Estado>('carregando');
  const [resultado, setResultado] = useState<ResultadoConfirmacao | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string>('');
  const [erroDeRede, setErroDeRede] = useState(false);

  // Estado do formulário de reenvio
  const [emailReenvio, setEmailReenvio] = useState('');
  const [reenviando, setReenviando] = useState(false);
  const [mensagemReenvio, setMensagemReenvio] = useState<string>('');
  const [erroReenvio, setErroReenvio] = useState<string>('');

  const confirmarToken = useCallback(async () => {
    if (!token) {
      setEstado('link-ausente');
      return;
    }

    setEstado('carregando');
    setErroDeRede(false);

    try {
      const resposta = await fetch(`${API_URL}/api/verificacao/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (resposta.ok) {
        const dados: ResultadoConfirmacao = await resposta.json();
        setResultado(dados);
        setEstado('sucesso');
        return;
      }

      setMensagemErro(extrairMensagemDeErro(await resposta.json().catch(() => null)));
      setEstado('erro');
    } catch {
      setErroDeRede(true);
      setMensagemErro(
        'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.',
      );
      setEstado('erro');
    }
  }, [token]);

  useEffect(() => {
    confirmarToken();
  }, [confirmarToken]);

  const solicitarReenvio = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setReenviando(true);
    setMensagemReenvio('');
    setErroReenvio('');

    try {
      const resposta = await fetch(`${API_URL}/api/verificacao/reenviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: emailReenvio.trim().toLowerCase() }),
      });

      if (resposta.status === 202) {
        const dados = await resposta.json();
        setMensagemReenvio(
          dados?.mensagem ?? 'Se este e-mail estiver cadastrado, enviamos um novo link.',
        );
        return;
      }

      setErroReenvio(
        resposta.status === 422
          ? 'Digite um endereço de e-mail válido.'
          : 'Não foi possível solicitar o reenvio agora. Tente novamente em instantes.',
      );
    } catch {
      setErroReenvio('Falha de conexão ao solicitar o reenvio.');
    } finally {
      setReenviando(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] text-[#0E1B2E] dark:text-[#EAF1FB] relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1D4ED8]/15 dark:bg-[#1D4ED8]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#16263F]/10 dark:bg-[var(--rs-surface)]/40 rounded-full blur-[140px] pointer-events-none" />

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-xl glass-panel-elevated rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center gap-6 animate-fadeIn transition-colors">
        {/* ----------------------------------------------------------------
            Estado 1: Carregando
        ----------------------------------------------------------------- */}
        {estado === 'carregando' && (
          <>
            <div className="w-16 h-16 rounded-2xl border-2 border-[#1D4ED8]/30 border-t-[#1D4ED8] animate-spin" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Confirmando seu e-mail...
            </h1>
            <p className="text-sm text-[#64748B] dark:text-[#93A5C0]">
              Só um instante enquanto validamos o seu link de verificação.
            </p>
          </>
        )}

        {/* ----------------------------------------------------------------
            Estado 2: Sucesso
        ----------------------------------------------------------------- */}
        {estado === 'sucesso' && resultado && (
          <>
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-primary animate-bounceOnce">
              <svg
                className="w-10 h-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                E-mail Verificado
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Tudo certo!
              </h1>
              <p className="text-sm text-[#64748B] dark:text-[#93A5C0] max-w-md mx-auto leading-relaxed">
                {resultado.mensagem}
              </p>
            </div>

            <div className="w-full glass-card-subtle rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200 dark:border-white/5">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-white/[0.04]">
                <span className="text-[#64748B]">E-mail confirmado:</span>
                <span className="text-[#0E1B2E] dark:text-[#EAF1FB] font-medium">
                  {resultado.email}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#64748B]">Status da Conta:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Ativa &amp; Verificada
                </span>
              </div>
            </div>

            <Link href="/" className="w-full">
              <Button variant="primary" size="lg" className="w-full">
                Ir para a página inicial
              </Button>
            </Link>
          </>
        )}

        {/* ----------------------------------------------------------------
            Estado 3: Erro (com retry e reenvio)
        ----------------------------------------------------------------- */}
        {(estado === 'erro' || estado === 'link-ausente') && (
          <>
            <div className="w-20 h-20 rounded-3xl bg-rose-500/15 border-2 border-rose-500 flex items-center justify-center text-rose-600 dark:text-rose-400 animate-shake">
              <svg
                className="w-10 h-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400">
                Não foi possível verificar
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Link inválido ou expirado
              </h1>
              <p className="text-sm text-[#64748B] dark:text-[#93A5C0] max-w-md mx-auto leading-relaxed">
                {estado === 'link-ausente'
                  ? 'O link acessado não contém um token de verificação. Copie o endereço completo do e-mail recebido.'
                  : mensagemErro}
              </p>
            </div>

            {erroDeRede && (
              <Button variant="glass" size="lg" className="w-full" onClick={confirmarToken}>
                Tentar novamente
              </Button>
            )}

            {/* Reenvio do link de verificação */}
            <form
              onSubmit={solicitarReenvio}
              className="w-full flex flex-col gap-3 text-left"
            >
              <div className="text-xs text-[#64748B] dark:text-[#93A5C0]">
                Precisa de um link novo? Informe seu e-mail de cadastro.
              </div>
              <TextInput
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="seu.email@exemplo.com"
                value={emailReenvio}
                onChange={(evento) => setEmailReenvio(evento.target.value)}
                disabled={reenviando}
              />
              <Button variant="primary" size="lg" className="w-full" disabled={reenviando}>
                {reenviando ? 'Enviando...' : 'Reenviar link de verificação'}
              </Button>

              {mensagemReenvio && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                  {mensagemReenvio}
                </p>
              )}
              {erroReenvio && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium text-center">
                  {erroReenvio}
                </p>
              )}
            </form>

            <Link href="/" className="text-xs text-[#64748B] hover:underline underline-offset-4">
              Voltar para a página inicial
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
