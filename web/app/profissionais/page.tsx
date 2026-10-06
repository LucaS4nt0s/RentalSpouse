'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  User,
  LogOut,
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
import { QuoteModal } from '../../components/profissionais/QuoteModal';
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

  // Sincroniza estado de digitação do input com a URL e busca apenas quando houver alteração
  useEffect(() => {
    if (debouncedSearch !== q) {
      setQ(debouncedSearch);
    }
  }, [debouncedSearch, q, setQ]);

  useEffect(() => {
    if (debouncedCity !== city) {
      setCity(debouncedCity);
    }
  }, [debouncedCity, city, setCity]);

  // Se a URL mudou externamente (ex: botão limpar filtros), atualiza inputs locais
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setCityInput(city);
  }, [city]);

  // Hook central de busca e gestão dos 3 estados
  const { data, isLoading, isRetrying, error, isEmpty, detectedSuggestion, retry } = useProfessionalsSearch({
    specialty,
    city: debouncedCity,
    q: debouncedSearch,
  });

  // Paginação progressiva sob demanda (LoadMoreControl - PRD §3.1)
  const [visibleCount, setVisibleCount] = useState<number>(12);

  useEffect(() => {
    setVisibleCount(12);
  }, [specialty, debouncedCity, debouncedSearch]);

  const handleClearAll = () => {
    setSearchInput('');
    setCityInput('');
    clearFilters();
  };

  const handleOpenQuoteModal = useCallback((prof: Professional) => {
    setSelectedProfessional(prof);
  }, []);

  const handleCloseQuoteModal = useCallback(() => {
    setSelectedProfessional(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-rental-bg text-rental-ink">
      {/* Header Global da Aplicação */}
      <header className="sticky top-0 z-30 bg-rental-bg/90 backdrop-blur-md">
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
              isRetrying={isRetrying}
            />
          ) : isEmpty ? (
            /* Estado 3: Empty State (Zero registros encontrados) */
            <SearchEmptyState
              onClearFilters={handleClearAll}
              onSelectSuggestedCategory={(cat) => setSpecialty(cat)}
            />
          ) : (
            /* Estado 3: Sucesso com Registros */
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {data.slice(0, visibleCount).map((prof) => (
                  <ProfessionalCard
                    key={prof.id}
                    professional={prof}
                    activeSpecialty={specialty}
                    onSpecialtyClick={setSpecialty}
                    onRequestQuote={handleOpenQuoteModal}
                  />
                ))}
              </div>

              {visibleCount < data.length && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 12)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rental-border bg-rental-surface px-6 py-3 text-xs sm:text-sm font-bold text-rental-ink shadow-sm transition-all hover:border-rental-primary/50 hover:bg-rental-surface2 active:scale-[0.98]"
                  >
                    Carregar mais profissionais ({data.length - visibleCount} restantes)
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Modal de Solicitação de Orçamento Acessível com Focus Trap */}
      <QuoteModal
        professional={selectedProfessional}
        onClose={handleCloseQuoteModal}
      />

      {/* Footer */}
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6 py-6 text-xs text-rental-muted mt-12">
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
