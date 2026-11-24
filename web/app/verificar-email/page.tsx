import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { VerificarEmailCard } from '../../components/verificacao/VerificarEmailCard';

export const metadata: Metadata = {
  title: 'Verificação de e-mail — RentalSpouse',
  description: 'Confirme seu endereço de e-mail para ativar sua conta na RentalSpouse.',
};

/**
 * Fallback exibido enquanto o componente cliente (que lê o token da URL via
 * `useSearchParams`) é hidratado. Também é o HTML estático pré-renderizado da
 * rota — por isso o `Suspense` é obrigatório aqui.
 */
function EsqueletoCarregando() {
  return (
    <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] text-[#0E1B2E] dark:text-[#EAF1FB] relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1D4ED8]/15 dark:bg-[#1D4ED8]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-xl glass-panel-elevated rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center gap-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl border-2 border-[#1D4ED8]/30 border-t-[#1D4ED8] animate-spin" />
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
          Confirmando seu e-mail...
        </h1>
        <p className="text-sm text-[#64748B] dark:text-[#93A5C0]">
          Só um instante enquanto validamos o seu link de verificação.
        </p>
      </div>
    </main>
  );
}

/**
 * Rota pública acessada pelo link enviado por e-mail:
 * `{APP_BASE_URL}/verificar-email?token=...`
 */
export default function VerificarEmailPage() {
  return (
    <Suspense fallback={<EsqueletoCarregando />}>
      <VerificarEmailCard />
    </Suspense>
  );
}
