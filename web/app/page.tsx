'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import { useIsProfessional } from '../components/documentos/ProfessionalDocumentsLink';
import { AppHeader } from '../components/layout/AppHeader';
import { CATEGORIES } from '../components/profissionais/CategoryChipsBar';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface StatusResponse {
  message: string;
}

interface Shortcut {
  href: string;
  title: string;
  description: string;
}

/** Atalhos por perfil: substituem a fileira de botões com o mesmo peso visual (Lei de Hick). */
const CLIENT_SHORTCUTS: Shortcut[] = [
  { href: '/cliente/orcamentos', title: 'Meus orçamentos', description: 'Acompanhe respostas e estimativas' },
  { href: '/minha-conta', title: 'Minha conta', description: 'Dados pessoais e endereço' },
];

const PROFESSIONAL_SHORTCUTS: Shortcut[] = [
  { href: '/profissional/agenda', title: 'Minha agenda', description: 'Grade semanal e agendamentos' },
  { href: '/profissional/orcamentos', title: 'Orçamentos recebidos', description: 'Responda pedidos de clientes' },
  { href: '/profissional/ganhos', title: 'Meus ganhos', description: 'Recebimentos e ticket médio' },
  { href: '/profissional/documentos', title: 'Meus documentos', description: 'Envie RG e comprovante' },
];

/** Categorias mais buscadas como atalho direto para a busca filtrada. */
const QUICK_CATEGORIES = CATEGORIES.filter((c) =>
  ['Elétrica', 'Hidráulica', 'Pintura', 'Montagem de Móveis', 'Reparos Gerais'].includes(c.id),
);

/** Sinais de confiança com o "porquê" explícito, em vez de rótulos vagos. */
const TRUST_POINTS = [
  {
    title: 'Profissionais verificados',
    text: 'Documento e comprovante de residência conferidos antes de aparecer na busca.',
  },
  {
    title: 'Orçamento antes da visita',
    text: 'Envie fotos do problema e receba a estimativa sem compromisso.',
  },
  {
    title: 'Avaliações de clientes reais',
    text: 'Só quem concluiu um atendimento pode avaliar o profissional.',
  },
];

const STEPS = [
  { title: 'Encontre', text: 'Busque por serviço ou cidade e compare perfis, notas e distância.' },
  { title: 'Peça o orçamento', text: 'Descreva o problema com fotos e receba o valor estimado.' },
  { title: 'Agende e pague', text: 'Escolha um horário livre e pague por PIX ou cartão na plataforma.' },
];

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const isProfessional = useIsProfessional();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');

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

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    router.push(term ? `/profissionais?q=${encodeURIComponent(term)}` : '/profissionais');
  };

  const firstName = user?.nome?.split(' ')[0];
  const shortcuts = isAuthenticated
    ? isProfessional
      ? PROFESSIONAL_SHORTCUTS
      : user?.tipo === 'admin' || user?.role === 'admin'
      ? []
      : CLIENT_SHORTCUTS
    : [];

  return (
    <main className="flex min-h-screen flex-col bg-rental-bg text-rental-ink">
      <AppHeader />

      {/* Hero: uma tarefa principal (buscar) com o campo já à mão */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-12 pt-14 text-center sm:pt-20">
        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          {isAuthenticated && firstName ? (
            <>
              Olá, {firstName}.
              <br className="hidden sm:block" /> O que vamos resolver hoje?
            </>
          ) : (
            <>
              Serviços residenciais,
              <br className="hidden sm:block" /> sem complicação.
            </>
          )}
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-rental-muted">
          Eletricistas, encanadores, montadores e pintores perto de você — com orçamento por foto
          e horário marcado.
        </p>

        <form
          role="search"
          onSubmit={handleSearch}
          className="mt-8 flex w-full max-w-xl flex-col gap-2 rounded-2xl border border-rental-border bg-rental-surface p-2 shadow-panel sm:flex-row"
        >
          <label htmlFor="home-search" className="sr-only">
            O que você precisa consertar?
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-rental-muted" />
            <input
              id="home-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: trocar chuveiro, montar armário…"
              className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-base text-rental-ink placeholder:text-rental-muted focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-rental-primary px-6 text-sm font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
          >
            Buscar profissionais
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Categorias mais buscadas">
          {QUICK_CATEGORIES.map(({ id, label }) => (
            <Link
              key={id}
              href={`/profissionais?specialty=${encodeURIComponent(id)}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-rental-border bg-rental-surface px-3.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/50 hover:text-rental-primary"
            >
              {label}
            </Link>
          ))}
        </div>

        {isAuthenticated && (
          <p className="mt-6 text-sm text-rental-muted">
            <Link href="/minha-conta" className="font-semibold text-rental-primary underline-offset-4 hover:underline">
              Ver minha conta
            </Link>
          </p>
        )}

        {!isAuthenticated && (
          <p className="mt-6 text-sm text-rental-muted">
            É profissional?{' '}
            <Link
              href="/cadastro/profissional"
              className="font-semibold text-rental-primary underline-offset-4 hover:underline"
            >
              Cadastre seus serviços
            </Link>
          </p>
        )}
      </section>

      {/* Atalhos do perfil logado: cards escaneáveis em vez de 5 botões iguais */}
      {shortcuts.length > 0 && (
        <section aria-labelledby="atalhos-title" className="mx-auto w-full max-w-5xl px-5 pb-12">
          <h2 id="atalhos-title" className="mb-3 text-sm font-bold text-rental-muted">
            Acesso rápido
          </h2>
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${shortcuts.length === 4 ? 'lg:grid-cols-4' : ''}`}>
            {shortcuts.map(({ href, title, description }) => (
              <Link
                key={title}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-rental-border bg-rental-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rental-primary/40 hover:shadow-panel"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-rental-ink">{title}</span>
                  <span className="block truncate text-xs text-rental-muted">{description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-rental-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rental-primary" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sinais de confiança com explicação concreta */}
      <section aria-label="Por que usar o RentalSpouse" className="mx-auto w-full max-w-5xl px-5 pb-14">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TRUST_POINTS.map(({ title, text }) => (
            <div key={title} className="border-l-2 border-rental-primary pl-4">
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-rental-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona — reduz incerteza antes do primeiro pedido */}
      {!isProfessional && (
        <section aria-labelledby="como-funciona-title" className="border-t border-rental-border bg-rental-surface">
          <div className="mx-auto w-full max-w-5xl px-5 py-14">
            <h2 id="como-funciona-title" className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
              Como funciona
            </h2>
            <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {STEPS.map(({ title, text }, i) => (
                <li key={title} className="flex flex-col items-center text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-rental-primary/40 text-sm font-bold text-rental-primary">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold">{title}</h3>
                  <p className="mt-1 max-w-[16rem] text-sm leading-relaxed text-rental-muted">{text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex justify-center">
              <Link
                href="/profissionais"
                className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl border border-rental-border bg-rental-bg px-6 text-sm font-bold text-rental-ink transition-colors hover:border-rental-primary/50 hover:text-rental-primary"
              >
                Ver profissionais disponíveis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-t border-rental-border px-5 py-5 text-xs text-rental-muted">
        <div className="flex items-center gap-4">
          <span>RentalSpouse © 2026</span>
          <span aria-hidden="true">•</span>
          <Link href="/admin" className="transition-colors hover:text-rental-primary">
            Painel Admin
          </Link>
        </div>
        <span className="inline-flex items-center gap-2" role="status">
          <span
            className={`h-2 w-2 rounded-full ${
              offline ? 'bg-[var(--rs-error)]' : status ? 'bg-[var(--rs-success)]' : 'bg-rental-muted'
            }`}
          />
          {offline ? 'Backend offline' : status ? 'API conectada' : 'Conectando...'}
        </span>
      </footer>
    </main>
  );
}
