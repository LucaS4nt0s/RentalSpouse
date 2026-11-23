'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Star, Clock, User, Calendar } from 'lucide-react';
import {
  ProfessionalDocumentsLink,
  useIsProfessional,
} from '../components/documentos/ProfessionalDocumentsLink';
import { AppHeader } from '../components/layout/AppHeader';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface StatusResponse {
  message: string;
}

export default function Home() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const isProfessional = useIsProfessional();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/hello`);
        if (!res.ok) throw new Error('offline');
        setStatus(await res.json());
      } catch {
        setOffline(true);
      }
    };
    load();
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-rental-bg text-rental-ink">
      <AppHeader />

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-rental-border bg-rental-surface px-3 py-1 text-xs font-semibold text-rental-muted">
          <Star className="h-3.5 w-3.5 text-rental-primary" />
          Profissionais verificados perto de você
        </span>

        <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          Serviços residenciais,
          <br className="hidden sm:block" /> sem complicação.
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-rental-muted">
          Contrate eletricistas, encanadores, montadores e pintores — ou ofereça seus serviços.
          Tudo em um só lugar.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-3">
          <Link
            href="/profissionais"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-rental-primary px-7 text-sm font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
          >
            Buscar Profissionais
            <ArrowRight className="h-4 w-4" />
          </Link>
          {isAuthenticated && user ? (
            <>
              <Link
                href="/minha-conta"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
              >
                <User className="h-4 w-4 text-rental-primary" />
                Minha Conta ({user.nome.split(' ')[0]})
              </Link>
              {isProfessional && (
                <>
                  <Link
                    href="/profissional/agenda"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
                  >
                    <Calendar className="h-4 w-4 text-rental-primary" />
                    Minha Agenda
                  </Link>
                  <ProfessionalDocumentsLink variant="hero" />
                </>
              )}
            </>
          ) : (
            <>
              <Link
                href="/entrar?mode=signin"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
              >
                Entrar na minha conta
              </Link>
              <Link
                href="/entrar?mode=signup"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
              >
                Criar conta
              </Link>
            </>
          )}
        </div>

        <div className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, label: 'Pagamento protegido' },
            { icon: Clock, label: 'Orçamento rápido' },
            { icon: Star, label: 'Avaliações reais' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center">
              <Icon className="h-5 w-5 text-rental-primary" />
              <span className="text-xs font-semibold text-rental-muted">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-t border-rental-border px-6 py-5 text-xs text-rental-muted">
        <div className="flex items-center gap-4">
          <span>RentalSpouse © 2026</span>
          <span>•</span>
          <Link href="/admin" className="hover:text-rental-primary transition-colors">
            Painel Admin
          </Link>
        </div>
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              offline
                ? 'bg-[var(--rs-error)]'
                : status
                ? 'bg-[var(--rs-success)]'
                : 'bg-rental-muted'
            }`}
          />
          {offline ? 'Backend offline' : status ? 'API conectada' : 'Conectando...'}
        </span>
      </footer>
    </main>
  );
}
