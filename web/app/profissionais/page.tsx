'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  User,
  LogOut,
  X,
  Phone,
  Mail,
  CheckCircle2,
  Send,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useUrlFilters } from '../../hooks/useUrlFilters';
import { useProfessionalsSearch } from '../../hooks/useProfessionalsSearch';
import { SearchHeader } from '../../components/profissionais/SearchHeader';
import { CategoryChipsBar } from '../../components/profissionais/CategoryChipsBar';
import { FilterActionBar } from '../../components/profissionais/FilterActionBar';
import { ProfessionalCard } from '../../components/profissionais/ProfessionalCard';
import { ProfessionalCardSkeleton } from '../../components/profissionais/ProfessionalCardSkeleton';
import { SearchEmptyState } from '../../components/profissionais/SearchEmptyState';
import { SearchErrorState } from '../../components/profissionais/SearchErrorState';
import { Professional } from '../../types/professional';

function ProfissionaisSearchContent() {
  const { user, isAuthenticated, logout } = useAuth();
  const {
    specialty,
    city,
    q,
    setSpecialty,
    setCity,
    setQ,
    clearFilters,
    hasActiveFilters,
  } = useUrlFilters();

  // Estados locais para inputs com debounce de 350ms (requisito PRD)
  const [searchInput, setSearchInput] = useState<string>(q);
  const [cityInput, setCityInput] = useState<string>(city);
  const debouncedSearch = useDebounce(searchInput, 350);
  const debouncedCity = useDebounce(cityInput, 350);

  // Modal de Solicitação de Orçamento
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [quoteSuccess, setQuoteSuccess] = useState<boolean>(false);
  const [quoteMessage, setQuoteMessage] = useState<string>('');

  // Sincroniza estado de digitação do input com a URL e busca
  useEffect(() => {
    setQ(debouncedSearch);
  }, [debouncedSearch, setQ]);

  useEffect(() => {
    setCity(debouncedCity);
  }, [debouncedCity, setCity]);

  // Se a URL mudou externamente (ex: botão limpar filtros), atualiza inputs locais
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setCityInput(city);
  }, [city]);

  // Hook central de busca e gestão dos 3 estados
  const { data, isLoading, error, isEmpty, detectedSuggestion, retry } = useProfessionalsSearch({
    specialty,
    city: debouncedCity,
    q: debouncedSearch,
  });

  const handleClearAll = () => {
    setSearchInput('');
    setCityInput('');
    clearFilters();
  };

  const handleOpenQuoteModal = (prof: Professional) => {
    setSelectedProfessional(prof);
    setQuoteSuccess(false);
    setQuoteMessage('');
  };

  const handleSendQuote = (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteSuccess(true);
    setTimeout(() => {
      setSelectedProfessional(null);
      setQuoteSuccess(false);
      setQuoteMessage('');
    }, 2000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-rental-bg text-rental-ink">
      {/* Header Global da Aplicação */}
      <header className="sticky top-0 z-30 border-b border-rental-border/70 bg-rental-bg/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)]">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">RentalSpouse</span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden sm:inline-block text-xs font-semibold text-rental-muted hover:text-rental-primary transition-colors"
            >
              Início
            </Link>

            {isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rental-primary/10 text-rental-primary text-xs font-bold">
                  {user.nome.charAt(0).toUpperCase()}
                </span>
                <span className="hidden md:inline text-xs font-semibold text-rental-ink">
                  {user.nome.split(' ')[0]}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-xl border border-rental-border p-1.5 text-rental-muted hover:text-[var(--rs-error)] transition-colors"
                  title="Sair"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/entrar"
                className="rounded-xl bg-rental-primary px-3.5 py-1.5 text-xs font-bold text-[var(--rs-primary-text)] shadow-primary hover:bg-[var(--rs-primary-hover)] transition-colors"
              >
                Entrar
              </Link>
            )}

            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 space-y-6">
        {/* Seção 1: Header de Busca */}
        <SearchHeader
          query={searchInput}
          onQueryChange={setSearchInput}
          isLoading={isLoading}
        />

        {/* Seção 2: Carrossel de Categorias Rápidas */}
        <div className="pt-2">
          <CategoryChipsBar
            activeCategory={specialty}
            onSelectCategory={setSpecialty}
          />
        </div>

        {/* Seção 3: Barra de Ações e Filtros Secundários */}
        <FilterActionBar
          city={cityInput}
          onCityChange={setCityInput}
          resultsCount={data.length}
          isLoading={isLoading}
          hasActiveFilters={hasActiveFilters}
          onClearAllFilters={handleClearAll}
        />

        {/* Banner de Busca Inteligente / Sugestão de Aproximação (Estilo YouTube / Spotify) */}
        {!isLoading && !error && searchInput.trim() && detectedSuggestion && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-rental-primary/30 bg-rental-primary/5 p-4 text-xs sm:text-sm animate-fadeIn">
            <div className="flex items-center gap-2.5 text-rental-ink flex-wrap">
              <Sparkles className="h-4 w-4 text-rental-primary shrink-0" />
              <span>
                Mostrando resultados para <strong className="text-rental-primary font-semibold">"{searchInput}"</strong>
                {detectedSuggestion.toLowerCase() !== searchInput.trim().toLowerCase() && (
                  <span className="text-rental-muted">
                    {' '}(aproximação com <strong className="text-rental-ink font-semibold">{detectedSuggestion}</strong>)
                  </span>
                )}
              </span>
            </div>
            {specialty !== detectedSuggestion && (
              <button
                type="button"
                onClick={() => setSpecialty(detectedSuggestion)}
                className="text-xs font-bold text-rental-primary hover:underline flex items-center gap-1 shrink-0"
              >
                Filtrar apenas por {detectedSuggestion} →
              </button>
            )}
          </div>
        )}

        {/* Seção 4: Grid com os 3 Estados Mandatórios */}
        <section aria-label="Catálogo de Profissionais" className="pt-2">
          {isLoading ? (
            /* Estado 1: Loading (Grid de Skeletons com CLS = 0) */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <ProfessionalCardSkeleton key={index} />
              ))}
            </div>
          ) : error ? (
            /* Estado 2: Error (Banner amigável com Retry preservando filtros) */
            <SearchErrorState
              message={error}
              onRetry={retry}
            />
          ) : isEmpty ? (
            /* Estado 3: Empty State (Zero registros encontrados) */
            <SearchEmptyState
              onClearFilters={handleClearAll}
              onSelectSuggestedCategory={(cat) => setSpecialty(cat)}
            />
          ) : (
            /* Estado 3: Sucesso com Registros */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.map((prof) => (
                <ProfessionalCard
                  key={prof.id}
                  professional={prof}
                  activeSpecialty={specialty}
                  onSpecialtyClick={setSpecialty}
                  onRequestQuote={handleOpenQuoteModal}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal de Solicitação de Orçamento */}
      {selectedProfessional && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full max-w-lg rounded-3xl glass-panel p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedProfessional(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>

            {quoteSuccess ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-rental-success mb-3 animate-scaleCheck" />
                <h3 className="text-xl font-bold text-rental-ink">Solicitação Enviada!</h3>
                <p className="mt-2 text-sm text-rental-muted">
                  O profissional <strong>{selectedProfessional.name}</strong> recebeu sua solicitação e entrará em contato em breve.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-base">
                    {selectedProfessional.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 id="modal-title" className="text-lg font-bold text-rental-ink">
                      Solicitar Orçamento
                    </h3>
                    <p className="text-xs text-rental-muted">
                      Para {selectedProfessional.name} • {selectedProfessional.city || 'Atendimento local'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {selectedProfessional.specialties.map((spec) => (
                    <span
                      key={spec}
                      className="rounded-lg bg-rental-surface2 px-2.5 py-1 text-xs font-semibold text-rental-muted"
                    >
                      {spec}
                    </span>
                  ))}
                </div>

                <form onSubmit={handleSendQuote} className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="quote-message"
                      className="block text-xs font-bold text-rental-ink mb-1.5"
                    >
                      Descreva o serviço necessário:
                    </label>
                    <textarea
                      id="quote-message"
                      required
                      rows={4}
                      value={quoteMessage}
                      onChange={(e) => setQuoteMessage(e.target.value)}
                      placeholder="Ex: Preciso trocar a fiação da sala e instalar 3 tomadas novas..."
                      className="w-full rounded-2xl glass-input p-3 text-xs sm:text-sm placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-rental-muted pt-2 border-t border-rental-border/60">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-rental-primary" />
                      {selectedProfessional.phone || 'Telefone verificado'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-rental-primary" />
                      {selectedProfessional.email}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProfessional(null)}
                      className="rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-all"
                    >
                      <Send className="h-4 w-4" />
                      <span>Enviar Solicitação</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-rental-border px-4 sm:px-6 py-6 text-xs text-rental-muted mt-12">
        <div className="flex items-center gap-4">
          <span>RentalSpouse © 2026</span>
          <span>•</span>
          <Link href="/" className="hover:text-rental-primary transition-colors">
            Página Inicial
          </Link>
          <span>•</span>
          <Link href="/cadastro/profissional" className="hover:text-rental-primary transition-colors">
            Cadastrar como Profissional
          </Link>
        </div>
        <span className="text-rental-muted hidden sm:inline">
          Diretório e Busca de Serviços Residenciais
        </span>
      </footer>
    </div>
  );
}

export default function ProfissionaisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-rental-bg p-8 flex items-center justify-center">
          <div className="flex items-center gap-3 text-rental-primary">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-rental-primary border-t-transparent" />
            <span className="text-sm font-semibold">Carregando diretório de profissionais...</span>
          </div>
        </div>
      }
    >
      <ProfissionaisSearchContent />
    </Suspense>
  );
}
