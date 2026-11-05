'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck2,
  Filter,
  Image as ImageIcon,
  Lock,
  Mail,
  Maximize2,
  Phone,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  Orcamento,
  OrcamentoResumoCapacidade,
  listarMeusOrcamentos,
  obterFotoUrl,
  obterResumoCapacidade,
} from '../../../services/orcamentos';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { NotificationBell } from '../../../components/notificacoes/NotificationBell';
import { QuoteDetailModal } from '../../../components/orcamentos/QuoteDetailModal';

type FilterTab = 'todos' | 'pendente' | 'aceito' | 'recusado' | 'respondido';

export default function ProfissionalOrcamentosPage() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [resumo, setResumo] = useState<OrcamentoResumoCapacidade | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');

  // Modal de Detalhes / Ação
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<number | null>(null);

  // Lightbox de foto
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const isProfessional =
    isAuthenticated && (user?.tipo === 'profissional' || user?.role === 'professional' || user?.role === 'admin');

  const carregarDados = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [resumoData, orcamentosData] = await Promise.all([
        obterResumoCapacidade(token).catch(() => null),
        listarMeusOrcamentos(token, activeTab === 'todos' ? undefined : activeTab),
      ]);
      if (resumoData) setResumo(resumoData);
      setOrcamentos(orcamentosData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar orçamentos.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, activeTab]);

  useEffect(() => {
    if (isAuthenticated && isProfessional) {
      carregarDados();
    }
  }, [isAuthenticated, isProfessional, carregarDados]);

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

  // 2. Não autenticado ou papel não autorizado
  if (!isAuthenticated || !isProfessional) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">Acesso Restrito ao Prestador</h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Você precisa estar conectado à sua conta de profissional para gerenciar orçamentos e capacidade de trabalho.
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
            Pendente
          </span>
        );
      case 'aceito':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aceito
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-500">
            <Clock className="h-3.5 w-3.5" />
            Respondido
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
    <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
        {/* Cabeçalho de Navegação e Ações */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-rental-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/profissionais"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rental-muted hover:text-rental-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Voltar ao Diretório</span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-rental-ink tracking-tight flex items-center gap-2.5">
              <Briefcase className="h-7 w-7 text-rental-primary" />
              Gestão de Orçamentos e Capacidade
            </h1>
            <p className="text-xs sm:text-sm text-rental-muted">
              Aceite novos pedidos ou recuse solicitações para controlar sua capacidade de trabalho e agenda.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/profissional/documentos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Meus Documentos</span>
            </Link>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Métricas de Capacidade de Trabalho (Issue #29) */}
        <section aria-labelledby="capacidade-metrics-title">
          <h2 id="capacidade-metrics-title" className="sr-only">
            Resumo de Capacidade de Trabalho
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card: Pendentes */}
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Pendentes
                </span>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400">
                {resumo ? resumo.pendentes : '—'}
              </div>
              <p className="text-[11px] text-rental-muted">Aguardando sua decisão</p>
            </div>

            {/* Card: Aceitos (Capacidade Ativa) */}
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Aceitos
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400">
                {resumo ? resumo.aceitos : '—'}
              </div>
              <p className="text-[11px] text-rental-muted">Compromissos assumidos</p>
            </div>

            {/* Card: Recusados */}
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/5 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Recusados
                </span>
                <XCircle className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-rose-600 dark:text-rose-400">
                {resumo ? resumo.recusados : '—'}
              </div>
              <p className="text-[11px] text-rental-muted">Capacidade preservada</p>
            </div>

            {/* Card: Total */}
            <div className="rounded-3xl border border-rental-border bg-rental-surface p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rental-muted">
                  Total Geral
                </span>
                <Briefcase className="h-4 w-4 text-rental-primary" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-rental-ink">
                {resumo ? resumo.total : '—'}
              </div>
              <p className="text-[11px] text-rental-muted">Solicitações recebidas</p>
            </div>
          </div>
        </section>

        {/* Barra de Filtros e Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-rental-muted flex items-center gap-1.5 mr-1">
              <Filter className="h-3.5 w-3.5" />
              Filtrar por:
            </span>
            {(
              [
                { id: 'todos', label: 'Todos', count: resumo?.total },
                { id: 'pendente', label: 'Pendentes', count: resumo?.pendentes },
                { id: 'aceito', label: 'Aceitos', count: resumo?.aceitos },
                { id: 'recusado', label: 'Recusados', count: resumo?.recusados },
                { id: 'respondido', label: 'Respondidos', count: resumo?.respondidos },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[var(--rs-primary)] text-[var(--rs-primary-text)] shadow-sm'
                      : 'bg-rental-surface border border-rental-border text-rental-muted hover:text-rental-ink hover:border-[var(--rs-border-strong)]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        isActive ? 'bg-black/20 text-white' : 'bg-rental-surface2 text-rental-muted'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={carregarDados}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Atualizar
          </Button>
        </div>

        {/* Lista de Orçamentos */}
        <section aria-labelledby="orcamentos-list-title" className="space-y-4">
          <h2 id="orcamentos-list-title" className="sr-only">
            Lista de Solicitações de Orçamento
          </h2>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 bg-rental-surface2 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-8 text-center space-y-3">
              <p className="text-sm font-bold text-[var(--rs-error)]">{error}</p>
              <Button variant="secondary" size="sm" onClick={carregarDados}>
                Tentar novamente
              </Button>
            </div>
          ) : orcamentos.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rental-border bg-rental-surface/50 p-12 text-center space-y-3">
              <Briefcase className="mx-auto h-10 w-10 text-rental-muted" />
              <h3 className="text-base font-bold text-rental-ink">Nenhum orçamento encontrado</h3>
              <p className="text-xs text-rental-muted max-w-md mx-auto">
                {activeTab === 'todos'
                  ? 'Você ainda não recebeu nenhuma solicitação de orçamento de clientes.'
                  : `Não há solicitações com status "${activeTab}" no momento.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orcamentos.map((orcamento) => (
                <article
                  key={orcamento.id}
                  className="rounded-3xl border border-rental-border bg-rental-surface p-5 sm:p-6 shadow-sm transition-all hover:border-[var(--rs-border-strong)] space-y-4"
                >
                  {/* Topo do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rental-border/60">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black text-rental-ink">Orçamento #{orcamento.id}</span>
                      {getStatusBadge(orcamento.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-rental-muted">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Recebido em {new Date(orcamento.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  {/* Informações do Cliente */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-rental-ink/90 bg-rental-surface2/30 p-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-rental-primary shrink-0" />
                      <span className="font-semibold">{orcamento.cliente_nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-rental-primary shrink-0" />
                      <span className="truncate">{orcamento.cliente_email}</span>
                    </div>
                    {orcamento.cliente_telefone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-rental-primary shrink-0" />
                        <span>{orcamento.cliente_telefone}</span>
                      </div>
                    )}
                  </div>

                  {/* Descrição do Pedido */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rental-muted">
                      Descrição do Serviço Solicitado
                    </span>
                    <p className="text-sm text-rental-ink leading-relaxed whitespace-pre-wrap bg-rental-surface2/15 p-3.5 rounded-2xl border border-rental-border/40">
                      {orcamento.descricao}
                    </p>
                  </div>

                  {/* Fotos em Miniatura */}
                  {orcamento.fotos && orcamento.fotos.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rental-muted flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-rental-primary" />
                        Fotos Anexadas ({orcamento.fotos.length})
                      </span>
                      <div className="flex flex-wrap gap-2.5">
                        {orcamento.fotos.map((foto) => {
                          const fotoUrl = obterFotoUrl(orcamento.id, foto.id);
                          return (
                            <button
                              key={foto.id}
                              type="button"
                              onClick={() => setPreviewPhotoUrl(fotoUrl)}
                              className="group relative h-16 w-24 rounded-xl border border-rental-border overflow-hidden bg-rental-surface2 cursor-pointer transition-transform hover:scale-105"
                              title="Clique para ampliar"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fotoUrl}
                                alt={foto.nome_original}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="h-4 w-4" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Detalhes de Decisão quando já Aceito ou Recusado */}
                  {orcamento.status === 'aceito' && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-extrabold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" />
                          Orçamento Aceito
                        </span>
                        {orcamento.valor_estimado && (
                          <span className="text-sm">R$ {orcamento.valor_estimado.toFixed(2)}</span>
                        )}
                      </div>
                      {orcamento.resposta_profissional && (
                        <p className="text-rental-ink/80">{orcamento.resposta_profissional}</p>
                      )}
                      {orcamento.decidido_em && (
                        <span className="text-[10px] text-rental-muted block">
                          Aceito em {new Date(orcamento.decidido_em).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  )}

                  {orcamento.status === 'recusado' && (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold">
                        <XCircle className="h-4 w-4" />
                        <span>Orçamento Recusado: {orcamento.motivo_recusa}</span>
                      </div>
                      {orcamento.justificativa_recusa && (
                        <p className="text-rental-muted text-[11px]">{orcamento.justificativa_recusa}</p>
                      )}
                      {orcamento.decidido_em && (
                        <span className="text-[10px] text-rental-muted block">
                          Recusado em {new Date(orcamento.decidido_em).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rodapé e Botões de Ação */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-rental-border/60">
                    <div className="text-xs text-rental-muted">
                      {orcamento.valor_estimado ? (
                        <span className="font-extrabold text-rental-primary flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          Estimativa: R$ {orcamento.valor_estimado.toFixed(2)}
                        </span>
                      ) : (
                        <span>Sem estimativa informada</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedOrcamentoId(orcamento.id)}
                      >
                        Ver Detalhes / Responder
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal de Detalhes e Ações de Aceite / Recusa */}
      {selectedOrcamentoId && (
        <QuoteDetailModal
          orcamentoId={selectedOrcamentoId}
          onClose={() => setSelectedOrcamentoId(null)}
          onResponded={() => {
            carregarDados();
          }}
        />
      )}

      {/* Lightbox / Foto Ampliada */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 animate-fadeIn"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewPhotoUrl(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewPhotoUrl}
            alt="Foto ampliada do orçamento"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
