'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, ArrowRight, Wrench, ShieldCheck, Star, Clock } from 'lucide-react';
import { ThemeToggle } from '../components/ui/ThemeToggle';

const API_URL = 'http://localhost:8000/api/hello';

interface StatusResponse {
  message: string;
}

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API_URL);
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
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)]">
            <Zap className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
        </div>
        <ThemeToggle />
      </header>

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

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/entrar"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-rental-primary px-7 text-sm font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
          >
            Entrar ou criar conta
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/cadastro/profissional"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-7 text-sm font-bold text-rental-ink transition-colors hover:border-[var(--rs-border-strong)]"
          >
            <Wrench className="h-4 w-4 text-rental-primary" />
            Sou profissional
          </Link>
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
        <span>RentalSpouse © 2026</span>
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
