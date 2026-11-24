'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, CalendarOff, FileCheck2, Lock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { AppHeader } from '../../../components/layout/AppHeader';
import { BloqueiosAgendaSection } from '../../../components/agenda/BloqueiosAgendaSection';

/**
 * Página dedicada ao bloqueio de dias e horários específicos na agenda
 * do profissional (issue #16).
 */
export default function ProfissionalBloqueiosPage() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const isProfessional =
    isAuthenticated &&
    (user?.tipo === 'profissional' ||
      user?.role === 'professional' ||
      user?.role === 'admin');

  if (authLoading) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="h-8 w-56 bg-rental-surface2 rounded-xl animate-pulse" />
          <div className="h-64 bg-rental-surface2 rounded-3xl animate-pulse" />
          <div className="h-56 bg-rental-surface2 rounded-3xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isProfessional || !token) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">
              Acesso Restrito ao Prestador
            </h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Você precisa estar conectado à sua conta de profissional para bloquear dias
              ou horários específicos na sua agenda.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/entrar">
              <Button variant="primary" className="w-full">
                Entrar como Profissional
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Voltar ao Início
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-rental-bg text-rental-ink flex flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 py-8">
        <BloqueiosAgendaSection token={token} />
      </main>
    </div>
  );
}
