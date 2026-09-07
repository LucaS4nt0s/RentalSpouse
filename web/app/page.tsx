'use client';

import { useEffect, useState } from 'react';

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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200 flex items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 flex flex-col items-center text-center transition-all duration-300">
        {/* Header do Card */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            RentalSpouse
          </span>
          <h1 className="text-2xl font-bold mt-3 tracking-tight text-slate-900">
            Status do Backend
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Comunicação FastAPI + PostgreSQL + Next.js
          </p>
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="w-full min-h-[140px] flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-slate-600 animate-pulse">
                Carregando...
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-600"
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
              <p className="text-sm text-center font-medium">{error}</p>
              <button
                onClick={fetchStatus}
                className="mt-1 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col items-center gap-4 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
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
                <p className="text-xl font-semibold text-slate-800">
                  {data.message}
                </p>
                <p className="text-xs text-slate-400 font-mono">
                  Registro ID: #{data.id}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="mt-8 pt-4 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>GET /api/hello</span>
          <span>Port 8000</span>
        </div>
      </div>
    </main>
  );
}
