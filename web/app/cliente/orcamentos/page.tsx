'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck2,
  Filter,
  Image as ImageIcon,
  Lock,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  Orcamento,
  listarMeusOrcamentos,
  obterFotoUrl,
} from '../../../services/orcamentos';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { NotificationBell } from '../../../components/notificacoes/NotificationBell';
import { useNotifications } from '../../../context/NotificationContext';
import { QuoteDetailModal } from '../../../components/orcamentos/QuoteDetailModal';

type FilterTab = 'todos' | 'respondido' | 'aceito' | 'pendente' | 'recusado';

export default function ClienteOrcamentosPage() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal de Detalhes
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<number | null>(null);

  // Lightbox de foto
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const { notificacoes } = useNotifications();

  const carregarOrcamentos = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listarMeusOrcamentos(token);
      setOrcamentos(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar orçamentos.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      carregarOrcamentos();
    }
  }, [isAuthenticated, carregarOrcamentos, notificacoes]);

  // Fecha o lightbox de foto com a tecla Escape
  useEffect(() => {
    if (!previewPhotoUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewPhotoUrl(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPhotoUrl]);

  // Contadores globais para os Cards de Resumo no topo (não zeram ao trocar de aba)
  const contadores = useMemo(() => {
    const total = orcamentos.length;
    let pendentes = 0;
    let respondidos = 0;
    let aceitos = 0;
    let recusados = 0;

    for (const o of orcamentos) {
      if (o.status === 'pendente') pendentes++;
      else if (o.status === 'respondido') respondidos++;
      else if (o.status === 'aceito') aceitos++;
      else if (o.status === 'recusado') recusados++;
    }

    return { total, pendentes, respondidos, aceitos, recusados };
  }, [orcamentos]);

  // Filtragem local por aba ativa e busca textual
  const orcamentosFiltrados = useMemo(() => {
    let list = orcamentos;
    if (activeTab !== 'todos') {
      list = list.filter((o) => o.status === activeTab);
    }
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter((o) => {
      const profName = (o.professional_name || '').toLowerCase();
      const desc = (o.descricao || '').toLowerCase();
      const resposta = (o.resposta_profissional || '').toLowerCase();
      return profName.includes(query) || desc.includes(query) || resposta.includes(query);
    });
  }, [orcamentos, activeTab, searchQuery]);

  // 1. Loading inicial de autenticação
  if (authLoading) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-8 w-48 bg-rental-surface2 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-rental-surface2 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-rental-surface2 rounded-3xl animate-pulse" />
        </div>
      </main>
    );
  }

  // 2. Não autenticado: tela de login amigável
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">Acesse seus Orçamentos</h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Faça login na sua conta de cliente para visualizar as respostas, estimativas de valor e status das suas solicitações.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Link href="/entrar">
              <Button variant="primary" className="w-full">
                Entrar na Conta
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" className="w-full">
                Voltar à Página Inicial
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-500">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Aguardando Resposta
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-500">
            <Clock className="h-3.5 w-3.5" />
            Estimativa Enviada
          </span>
        );
      case 'aceito':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirmado / Aceito
          </span>
        );
      case 'recusado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-500">
            <XCircle className="h-3.5 w-3.5" />
            Recusado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rental-surface2 px-3 py-1 text-xs font-bold text-rental-muted">
            {status}
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10 space-y-8 animate-fadeIn">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Barra Superior / Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rental-border/60">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-rental-border text-rental-muted hover:text-rental-ink hover:bg-rental-surface transition-colors"
              title="Voltar ao início"
              aria-label="Voltar à página inicial"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rental-primary text-[var(--rs-primary-text)] text-xs">
                  <Zap className="h-4 w-4" />
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-rental-ink tracking-tight">
                  Meus Orçamentos
                </h1>
              </div>
              <p className="text-xs text-rental-muted mt-0.5">
                Acompanhe o andamento das suas solicitações, estimativas e confirmações de serviço.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
            <Link href="/profissionais">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Sparkles className="h-4 w-4" />}
                className="text-xs font-bold"
              >
                Solicitar Novo Orçamento
              </Button>
            </Link>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Resumo / Métricas Rápidas */}
        <section aria-label="Resumo das solicitações" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-rental-border bg-rental-surface p-4 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rental-muted uppercase tracking-wider">
                Total Solicitado
              </span>
              <FileCheck2 className="h-4 w-4 text-rental-primary" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rental-ink">
              {contadores.total}
            </div>
            <span className="text-[11px] text-rental-muted block truncate">
              {contadores.total === 1 ? '1 solicitação feita' : `${contadores.total} solicitações feitas`}
            </span>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">
                Estimativas
              </span>
              <DollarSign className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-500">
              {contadores.respondidos}
            </div>
            <span className="text-[11px] text-rental-muted block truncate">
              Com valor estimado
            </span>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                Confirmados
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-500">
              {contadores.aceitos}
            </div>
            <span className="text-[11px] text-rental-muted block truncate">
              Aceitos pelo prestador
            </span>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                Em Análise
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-500">
              {contadores.pendentes}
            </div>
            <span className="text-[11px] text-rental-muted block truncate">
              Aguardando retorno
            </span>
          </div>
        </section>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Abas de Filtro de Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'respondido', label: 'Estimativas' },
                { id: 'aceito', label: 'Confirmados' },
                { id: 'pendente', label: 'Em Análise' },
                { id: 'recusado', label: 'Recusados' },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                    : 'bg-rental-surface border border-rental-border text-rental-muted hover:text-rental-ink hover:border-rental-primary/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rental-muted" />
            <input
              type="text"
              placeholder="Buscar em meus orçamentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-rental-border bg-rental-surface pl-9 pr-8 py-2 text-xs text-rental-ink placeholder-rental-muted focus:outline-none focus:border-rental-primary transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rental-muted hover:text-rental-ink p-0.5"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Mensagem de Erro de Conexão */}
        {error && (
          <div className="rounded-2xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-4 text-xs text-[var(--rs-error)] flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={carregarOrcamentos} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Lista de Orçamentos */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-3xl bg-rental-surface2/60 animate-pulse border border-rental-border" />
            ))}
          </div>
        ) : orcamentosFiltrados.length === 0 ? (
          /* Estado Vazio */
          <div className="rounded-3xl border border-dashed border-rental-border bg-rental-surface/50 p-10 sm:p-14 text-center space-y-4 shadow-sm animate-fadeIn">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-rental-ink">
                Nenhum orçamento encontrado
              </h3>
              <p className="text-xs text-rental-muted leading-relaxed">
                {searchQuery
                  ? 'Nenhum resultado corresponde à sua busca. Tente outros termos ou limpe o filtro.'
                  : activeTab !== 'todos'
                  ? 'Você não possui nenhuma solicitação com este status no momento.'
                  : 'Você ainda não enviou solicitações de orçamento. Encontre profissionais qualificados e solicite uma estimativa com fotos.'}
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              {searchQuery && (
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  Limpar busca
                </Button>
              )}
              {activeTab !== 'todos' && (
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('todos')}>
                  Ver todos os orçamentos ({contadores.total})
                </Button>
              )}
              <Link href="/profissionais">
                <Button variant="primary" size="md" leftIcon={<Sparkles className="h-4 w-4" />}>
                  Buscar Profissionais Disponíveis
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Cards de Orçamento */
          <div className="space-y-4">
            {orcamentosFiltrados.map((orcamento) => {
              const hasPhotos = orcamento.fotos && orcamento.fotos.length > 0;
              const isRespondido = orcamento.status === 'respondido';
              const isAceito = orcamento.status === 'aceito';
              const isRecusado = orcamento.status === 'recusado';

              return (
                <article
                  key={orcamento.id}
                  className="rounded-3xl border border-rental-border bg-rental-surface p-5 sm:p-6 space-y-4 shadow-panel hover:border-rental-primary/30 transition-all group"
                >
                  {/* Topo do Card: Profissional, Data e Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rental-border/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-sm">
                        {(orcamento.professional_name || 'Profissional')
                          .substring(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm sm:text-base font-extrabold text-rental-ink group-hover:text-rental-primary transition-colors">
                            {orcamento.professional_name || `Profissional #${orcamento.professional_id}`}
                          </h2>
                          <span className="text-[11px] text-rental-muted font-normal">
                            • Orçamento #{orcamento.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-rental-muted mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>
                            Solicitado em {new Date(orcamento.criado_em).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(orcamento.criado_em).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="self-start sm:self-auto">
                      {getStatusBadge(orcamento.status)}
                    </div>
                  </div>

                  {/* Corpo: Descrição do Problema e Fotos Anexadas */}
                  <div className="space-y-3">
                    <p className="text-xs sm:text-sm text-rental-ink/90 leading-relaxed whitespace-pre-wrap line-clamp-3">
                      {orcamento.descricao}
                    </p>

                    {/* Galeria de Fotos Anexadas */}
                    {hasPhotos && (
                      <div className="pt-1">
                        <span className="text-[11px] font-bold text-rental-muted uppercase tracking-wider flex items-center gap-1 mb-2">
                          <ImageIcon className="h-3.5 w-3.5 text-rental-primary" />
                          Fotos do Problema ({orcamento.fotos.length})
                        </span>
                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                          {orcamento.fotos.map((foto) => {
                            const fotoUrl = obterFotoUrl(orcamento.id, foto.id);
                            return (
                              <button
                                key={foto.id}
                                type="button"
                                onClick={() => setPreviewPhotoUrl(fotoUrl)}
                                className="group/foto relative h-16 w-24 shrink-0 rounded-xl border border-rental-border overflow-hidden bg-rental-surface2 focus:outline-none focus:ring-2 focus:ring-rental-primary"
                                title="Visualizar foto ampliada"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fotoUrl}
                                  alt={foto.nome_original}
                                  className="h-full w-full object-cover transition-transform group-hover/foto:scale-105"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/foto:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Maximize2 className="h-4 w-4" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Destaque de Resposta: Estimativa, Aceite ou Recusa */}
                  {isRespondido && (
                    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2 text-blue-500 font-extrabold text-xs sm:text-sm">
                          <DollarSign className="h-4 w-4" />
                          <span>Estimativa de Valor Recebida</span>
                        </div>
                        {orcamento.valor_estimado && (
                          <span className="text-base sm:text-lg font-black text-blue-500">
                            R$ {orcamento.valor_estimado.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {orcamento.resposta_profissional && (
                        <div className="text-xs text-rental-ink/90 bg-rental-surface/70 rounded-xl p-3 border border-rental-border/40">
                          <span className="font-bold block text-[11px] text-rental-muted mb-0.5">
                            Parecer Técnico do Profissional:
                          </span>
                          <p className="line-clamp-2">{orcamento.resposta_profissional}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {isAceito && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2 text-emerald-500 font-extrabold text-xs sm:text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Orçamento Aceito pelo Prestador!</span>
                        </div>
                        {orcamento.valor_estimado && (
                          <span className="text-base sm:text-lg font-black text-emerald-500">
                            R$ {orcamento.valor_estimado.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {orcamento.data_prevista && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Previsão de Atendimento: {new Date(orcamento.data_prevista).toLocaleString('pt-BR')}</span>
                        </div>
                      )}
                      {orcamento.resposta_profissional && (
                        <div className="text-xs text-rental-ink/90 bg-rental-surface/70 rounded-xl p-3 border border-rental-border/40">
                          <span className="font-bold block text-[11px] text-rental-muted mb-0.5">
                            Instruções / Parecer:
                          </span>
                          <p className="line-clamp-2">{orcamento.resposta_profissional}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {isRecusado && (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-rose-500 font-extrabold text-xs sm:text-sm">
                        <XCircle className="h-4 w-4" />
                        <span>Solicitação Recusada pelo Prestador</span>
                      </div>
                      {orcamento.motivo_recusa && (
                        <p className="text-xs text-rental-ink/90">
                          <strong className="text-rose-600 dark:text-rose-400">Motivo:</strong> {orcamento.motivo_recusa}
                        </p>
                      )}
                      {orcamento.justificativa_recusa && (
                        <p className="text-[11px] text-rental-muted">
                          {orcamento.justificativa_recusa}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Rodapé do Card: Ação para Ver Detalhes */}
                  <div className="flex items-center justify-between pt-2 border-t border-rental-border/50 text-xs">
                    <span className="text-rental-muted text-[11px]">
                      {isRespondido
                        ? 'O profissional já calculou o valor.'
                        : isAceito
                        ? 'Serviço confirmado.'
                        : isRecusado
                        ? 'Tente solicitar para outro profissional.'
                        : 'Aguardando avaliação técnica.'}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedOrcamentoId(orcamento.id)}
                      className="font-bold text-xs"
                    >
                      Ver Detalhes Completos
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Detalhes Completos do Orçamento */}
      {selectedOrcamentoId !== null && (
        <QuoteDetailModal
          orcamentoId={selectedOrcamentoId}
          onClose={() => setSelectedOrcamentoId(null)}
          onResponded={carregarOrcamentos}
        />
      )}

      {/* Visualizador Ampliado de Fotos (Lightbox) */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 text-white hover:bg-black transition-colors"
              title="Fechar visualização"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhotoUrl}
              alt="Foto ampliada do orçamento"
              className="max-h-[85vh] w-auto object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </main>
  );
}
