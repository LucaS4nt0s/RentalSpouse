'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../components/ui/ThemeToggle';

interface StatusResponse {
  id: number;
  message: string;
}

export default function Home() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${apiUrl}/api/hello`);
      if (!res.ok) {
        throw new Error(`Erro na requisição: ${res.status} ${res.statusText}`);
      }
      const result: StatusResponse = await res.json();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Não foi possível conectar ao backend em ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f5f8] dark:bg-[#11091a] text-[#11091a] dark:text-[#F3F4F6] relative overflow-hidden flex items-center justify-center p-6 transition-colors duration-300">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#e8d18e]/15 dark:bg-[#2f2f4d]/40 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#bab195]/20 dark:bg-[#e8d18e]/10 rounded-full blur-[130px] pointer-events-none" />

      {/* Botão de Alternar Tema no canto superior */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 flex flex-col items-center text-center shadow-glass relative z-10 transition-all duration-300">
        {/* Header do Card */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            RentalSpouse
          </span>
          <h1 className="text-2xl font-bold mt-3 tracking-tight text-[#11091a] dark:text-[#F3F4F6]">
            Status do Backend
          </h1>
          <p className="text-xs text-[#626970] dark:text-[#bab195] mt-1">
            Comunicação FastAPI + PostgreSQL + Next.js
          </p>
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="w-full min-h-[140px] flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-slate-300 dark:border-[#626970]/30 border-t-[#e8d18e] rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-[#626970] dark:text-[#bab195] animate-pulse">
                Carregando...
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 text-[#EF4444]">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#EF4444]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-xs text-center font-medium">{error}</p>
              <button
                onClick={fetchStatus}
                className="mt-1 px-4 py-1.5 text-xs font-semibold text-[#11091a] bg-[#e8d18e] rounded-lg hover:bg-[#dfc476] transition-colors shadow-sm"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col items-center gap-4 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-[#e8d18e]/15 border border-[#e8d18e]/30 flex items-center justify-center text-[#947728] dark:text-[#e8d18e] shadow-inner">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-xl font-semibold text-[#11091a] dark:text-[#F3F4F6]">
                  {data.message}
                </p>
                <p className="text-xs text-[#626970] font-mono">
                  Registro ID: #{data.id}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Link para o Cadastro de Cliente */}
        <div className="w-full mt-6 pt-6 border-t border-slate-200/60 dark:border-white/[0.08]">
          <Link
            href="/cadastro/cliente"
            className="w-full py-3 px-4 rounded-xl bg-[#e8d18e] text-[#11091a] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#dfc476] shadow-lg shadow-[#e8d18e]/20 transition-all active:scale-[0.98]"
          >
            <span>Ir para Cadastro de Clientes</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {/* Rodapé informativo */}
        <div className="mt-4 pt-3 border-t border-slate-200/40 dark:border-white/[0.04] w-full flex items-center justify-between text-[11px] text-[#626970] font-mono">
          <span>GET /api/hello</span>
          <span>Port 8000</span>
        </div>
      </div>
    </main>
  );
}
