'use client';

import React, { useMemo } from 'react';
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Eye,
  Briefcase,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import {
  ModerationStatusFilter,
  ProfessionalModerationItem,
} from '../../types/moderation';

interface ModerationTableProps {
  professionals: ProfessionalModerationItem[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  statusFilter: ModerationStatusFilter;
  onStatusFilterChange: (status: ModerationStatusFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortOrder: 'fifo' | 'newest';
  onSortOrderChange: (order: 'fifo' | 'newest') => void;
  onReviewProfessional: (professional: ProfessionalModerationItem) => void;
}

export const ModerationTable: React.FC<ModerationTableProps> = ({
  professionals,
  isLoading,
  error,
  onRetry,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  sortOrder,
  onSortOrderChange,
  onReviewProfessional,
}) => {
  // Contadores para as abas
  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    professionals.forEach((p) => {
      if (p.approval_status === 'approved') approved++;
      else if (p.approval_status === 'rejected') rejected++;
      else pending++;
    });

    return {
      all: professionals.length,
      pending_approval: pending,
      approved,
      rejected,
    };
  }, [professionals]);

  // Filtra por busca e status
  const filteredProfessionals = useMemo(() => {
    return professionals.filter((prof) => {
      // Filtro de status
      if (statusFilter !== 'all' && prof.approval_status !== statusFilter) {
        return false;
      }

      // Filtro de busca textual (nome, email, cidade ou especialidades)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = prof.name?.toLowerCase().includes(query);
        const emailMatch = prof.email?.toLowerCase().includes(query);
        const cityMatch = prof.city?.toLowerCase().includes(query);
        const specMatch = prof.specialties?.some((s) => s.toLowerCase().includes(query));
        return nameMatch || emailMatch || cityMatch || specMatch;
      }

      return true;
    });
  }, [professionals, statusFilter, searchQuery]);

  // Ordena por FIFO ou mais recente
  const sortedProfessionals = useMemo(() => {
    const list = [...filteredProfessionals];
    list.sort((a, b) => {
      const dateA = a.documents_submitted_at
        ? new Date(a.documents_submitted_at).getTime()
        : new Date(a.created_at).getTime();
      const dateB = b.documents_submitted_at
        ? new Date(b.documents_submitted_at).getTime()
        : new Date(b.created_at).getTime();

      if (sortOrder === 'fifo') {
        // FIFO: mais antigos primeiro (esperando há mais tempo)
        return dateA - dateB;
      }
      // Mais recentes primeiro
      return dateB - dateA;
    });
    return list;
  }, [filteredProfessionals, sortOrder]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getRelativeWaitTime = (isoString?: string | null) => {
    if (!isoString) return 'Sem envio';
    try {
      const now = new Date().getTime();
      const submitted = new Date(isoString).getTime();
      const diffMs = now - submitted;

      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) return `há ${diffDays}d ${diffHours % 24}h`;
      if (diffHours > 0) return `há ${diffHours}h ${diffMins % 60}m`;
      if (diffMins > 0) return `há ${diffMins} min`;
      return 'agora mesmo';
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* BARRA DE CONTROLE: ABAS, BUSCA E ORDENAÇÃO                                */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 glass-panel rounded-2xl p-3 sm:p-4 border border-rental-border">
        {/* Abas de Status */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'pending_approval' as const, label: 'Pendentes', count: counts.pending_approval },
            { id: 'approved' as const, label: 'Aprovados', count: counts.approved },
            { id: 'rejected' as const, label: 'Rejeitados', count: counts.rejected },
            { id: 'all' as const, label: 'Todos', count: counts.all },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onStatusFilterChange(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                    : 'text-rental-muted hover:text-rental-ink hover:bg-rental-surface2'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-rental-surface2 text-rental-muted border border-rental-border'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Busca e Ordenação */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Campo de Busca */}
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-rental-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Buscar por nome, e-mail, cidade..."
              className="w-full rounded-xl border border-rental-border bg-rental-surface2 pl-9 pr-3 py-1.5 text-xs text-rental-ink placeholder:text-rental-muted focus:outline-none focus:border-rental-primary focus:ring-1 focus:ring-rental-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rental-muted hover:text-rental-ink text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-1.5 bg-rental-surface2 px-2.5 py-1.5 rounded-xl border border-rental-border text-xs text-rental-muted">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            <select
              value={sortOrder}
              onChange={(e) => onSortOrderChange(e.target.value as 'fifo' | 'newest')}
              className="bg-transparent text-rental-ink font-semibold focus:outline-none text-xs cursor-pointer"
            >
              <option value="fifo">Fila de espera (Mais antigos)</option>
              <option value="newest">Mais recentes primeiro</option>
            </select>
          </div>

          {/* Botão de Atualizar */}
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="p-2 rounded-xl border border-rental-border bg-rental-surface2 hover:bg-rental-surface text-rental-muted hover:text-rental-primary transition-colors shrink-0"
            title="Atualizar lista"
            aria-label="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-rental-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ESTADO DE ERRO                                                            */}
      {/* ========================================================================= */}
      {error && (
        <div className="rounded-2xl p-5 bg-red-500/10 border border-red-500/30 flex items-start justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-600 dark:text-red-400">
                Não foi possível carregar os dados de moderação
              </h4>
              <p className="text-xs text-rental-muted mt-1">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-600 transition-colors shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TABELA DE PROFISSIONAIS                                                   */}
      {/* ========================================================================= */}
      <div className="glass-panel rounded-3xl border border-rental-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto futuristic-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-rental-border bg-rental-surface2/60 text-[11px] font-bold text-rental-muted uppercase tracking-wider">
                <th className="py-3.5 px-4 sm:px-6">Profissional</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Localização</th>
                <th className="py-3.5 px-4">Submissão / Fila</th>
                <th className="py-3.5 px-4">Documentos</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 sm:px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rental-border">
              {/* SKELETON LOADING */}
              {isLoading && professionals.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4 sm:px-6">
                      <div className="h-4 w-36 bg-rental-surface2 rounded mb-1.5" />
                      <div className="h-3 w-48 bg-rental-surface2 rounded" />
                    </td>
                    <td className="py-4 px-4 hidden md:table-cell">
                      <div className="h-3 w-24 bg-rental-surface2 rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-3 w-28 bg-rental-surface2 rounded mb-1" />
                      <div className="h-2.5 w-16 bg-rental-surface2 rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-20 bg-rental-surface2 rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-5 w-20 bg-rental-surface2 rounded-full" />
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <div className="h-8 w-20 bg-rental-surface2 rounded-xl ml-auto" />
                    </td>
                  </tr>
                ))
              ) : sortedProfessionals.length === 0 ? (
                /* ESTADO VAZIO */
                <tr>
                  <td colSpan={6} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="h-12 w-12 mx-auto rounded-2xl bg-rental-primary/10 text-rental-primary flex items-center justify-center">
                        <FileCheck2 className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-bold text-rental-ink">
                        Nenhum profissional encontrado
                      </h4>
                      <p className="text-xs text-rental-muted leading-relaxed">
                        {statusFilter === 'pending_approval'
                          ? 'A fila de espera está zerada! Todos os profissionais submetidos já foram avaliados.'
                          : 'Nenhum registro atende aos filtros atuais selecionados.'}
                      </p>
                      {(statusFilter !== 'all' || searchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            onStatusFilterChange('all');
                            onSearchQueryChange('');
                          }}
                          className="px-3.5 py-1.5 rounded-xl border border-rental-border text-rental-primary font-bold text-xs hover:bg-rental-surface2 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Filter className="h-3.5 w-3.5" />
                          Ver todos os profissionais
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                /* LINHAS DE PROFISSIONAIS */
                sortedProfessionals.map((prof, index) => {
                  const isApproved = prof.approval_status === 'approved';
                  const isRejected = prof.approval_status === 'rejected';
                  const isPending = !isApproved && !isRejected;

                  return (
                    <tr
                      key={prof.id}
                      className="hover:bg-rental-surface2/50 transition-colors group"
                    >
                      {/* Dados do Profissional */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-rental-ink truncate max-w-[200px] sm:max-w-[260px]">
                              {prof.name}
                            </span>
                            {isPending && sortOrder === 'fifo' && index < 3 && (
                              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] px-1.5 py-0.2 rounded-md">
                                #{index + 1} na fila
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-rental-muted truncate font-mono">
                            {prof.email}
                            {prof.phone && ` • ${prof.phone}`}
                          </div>

                          {/* Chips de Especialidade */}
                          {prof.specialties && prof.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {prof.specialties.slice(0, 2).map((s) => (
                                <span
                                  key={s}
                                  className="text-[10px] px-1.5 py-0.2 rounded bg-rental-surface2 text-rental-muted border border-rental-border"
                                >
                                  {s}
                                </span>
                              ))}
                              {prof.specialties.length > 2 && (
                                <span className="text-[10px] px-1 py-0.2 text-rental-muted">
                                  +{prof.specialties.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Localização */}
                      <td className="py-3.5 px-4 hidden md:table-cell text-rental-muted">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0 text-rental-muted" />
                          <span className="truncate max-w-[130px]">
                            {prof.city || '—'}{prof.state ? `/${prof.state}` : ''}
                          </span>
                        </div>
                      </td>

                      {/* Submissão e Tempo de Espera */}
                      <td className="py-3.5 px-4">
                        <div className="text-rental-ink font-medium">
                          {formatDate(prof.documents_submitted_at || prof.created_at)}
                        </div>
                        <div className="text-[11px] text-rental-muted flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{getRelativeWaitTime(prof.documents_submitted_at)}</span>
                        </div>
                      </td>

                      {/* Documentos Anexados */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            title={prof.has_photo_id ? 'Documento com foto anexado' : 'Documento com foto pendente'}
                            className={`p-1 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                              prof.has_photo_id
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}
                          >
                            RG/CNH
                          </div>
                          <div
                            title={prof.has_proof_of_residence ? 'Comprovante de residência anexado' : 'Comprovante de residência pendente'}
                            className={`p-1 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                              prof.has_proof_of_residence
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}
                          >
                            Residência
                          </div>
                        </div>
                        <span className="text-[10px] text-rental-muted mt-1 block font-mono">
                          {prof.documents_count} doc{prof.documents_count !== 1 ? 's' : ''}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isApproved
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : isRejected
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}
                        >
                          {isApproved ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Aprovado
                            </>
                          ) : isRejected ? (
                            <>
                              <AlertCircle className="h-3 w-3" />
                              Rejeitado
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              Pendente
                            </>
                          )}
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <button
                          type="button"
                          onClick={() => onReviewProfessional(prof)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            isPending
                              ? 'bg-rental-primary text-[var(--rs-primary-text)] hover:bg-[var(--rs-primary-hover)] shadow-primary'
                              : 'bg-rental-surface2 text-rental-ink hover:bg-rental-surface border border-rental-border'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{isPending ? 'Avaliar' : 'Detalhes'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="px-6 py-3 border-t border-rental-border bg-rental-surface2/40 text-[11px] text-rental-muted flex items-center justify-between">
          <span>
            Exibindo <strong>{sortedProfessionals.length}</strong> de{' '}
            <strong>{professionals.length}</strong> profissionais carregados
          </span>
          <span className="font-mono">
            {sortOrder === 'fifo' ? 'Ordem: Mais antigos (FIFO)' : 'Ordem: Mais recentes'}
          </span>
        </div>
      </div>
    </div>
  );
};
