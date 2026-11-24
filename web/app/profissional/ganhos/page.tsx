'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileCheck2,
  Lock,
  QrCode,
  Receipt,
  RefreshCw,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  GanhosProfissionalResumo,
  obterResumoGanhos,
} from '../../../services/pagamentos';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { NotificationBell } from '../../../components/notificacoes/NotificationBell';

const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatarMoeda(valor: number): string {
  return formatadorMoeda.format(Number.isFinite(valor) ? valor : 0);
}

function formatarDataHora(iso?: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfissionalGanhosPage() {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [resumo, setResumo] = useState<GanhosProfissionalResumo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isProfessional =
    isAuthenticated &&
    (user?.tipo === 'profissional' || user?.role === 'professional' || user?.role === 'admin');

  const carregarResumo = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await obterResumoGanhos(token);
      setResumo(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar resumo de ganhos.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && isProfessional) {
      carregarResumo();
    }
  }, [isAuthenticated, isProfessional, carregarResumo]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-10 w-64 bg-rental-surface2 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-rental-surface2 rounded-3xl animate-pulse" />
            ))}
          </div>
          <div className="h-72 bg-rental-surface2 rounded-3xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isProfessional) {
    return (
      <main className="min-h-screen bg-rental-bg text-rental-ink flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-rental-ink">Acesso Restrito ao Prestador</h1>
            <p className="text-sm text-rental-muted leading-relaxed">
              Faça login com sua conta de profissional para acompanhar o resumo financeiro e seus ganhos na plataforma.
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

  return (
    <main className="min-h-screen bg-rental-bg text-rental-ink p-4 sm:p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Cabeçalho */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-rental-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/profissional/orcamentos"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rental-muted hover:text-rental-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Voltar aos Orçamentos</span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-rental-ink tracking-tight flex items-center gap-2.5">
              <Wallet className="h-7 w-7 text-emerald-500" />
              Painel de Ganhos e Finanças
            </h1>
            <p className="text-xs sm:text-sm text-rental-muted">
              Acompanhe seus recebimentos semanais, mensais, ticket médio e histórico de pagamentos aprovados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/profissional/orcamentos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Orçamentos</span>
            </Link>
            <Link
              href="/profissional/agenda"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Minha Agenda</span>
            </Link>
            <Link
              href="/profissional/documentos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-3 py-1.5 text-xs font-semibold text-rental-ink transition-colors hover:border-rental-primary/40 hover:text-rental-primary"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Meus Documentos</span>
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={carregarResumo}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Atualizar
            </Button>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Estado de Carregamento */}
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-3xl bg-rental-surface2/70 animate-pulse border border-rental-border" />
              ))}
            </div>
            <div className="h-64 rounded-3xl bg-rental-surface2/70 animate-pulse border border-rental-border" />
          </div>
        ) : error ? (
          /* Estado de Erro com Retry */
          <div className="rounded-3xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-8 text-center space-y-4">
            <p className="text-sm font-bold text-[var(--rs-error)]">{error}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={carregarResumo}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {/* Cards de KPIs Financeiros */}
            <section aria-label="Indicadores financeiros do profissional" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Faturamento Total */}
              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Faturamento Total
                  </span>
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatarMoeda(resumo?.total_acumulado ?? 0)}
                </div>
                <p className="text-[11px] text-rental-muted">
                  {resumo?.total_atendimentos_pagos ?? 0}{' '}
                  {(resumo?.total_atendimentos_pagos ?? 0) === 1 ? 'pagamento aprovado' : 'pagamentos aprovados'}
                </p>
              </div>

              {/* Ganhos no Mês Atual */}
              <div className="rounded-3xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Ganhos no Mês
                  </span>
                  <Calendar className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                  {formatarMoeda(resumo?.ganhos_mes_atual ?? 0)}
                </div>
                <p className="text-[11px] text-rental-muted">
                  Referência: {resumo?.mes_referencia || 'Mês atual'}
                </p>
              </div>

              {/* Ganhos na Semana Atual */}
              <div className="rounded-3xl border border-rental-primary/30 bg-rental-primary/5 p-5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-primary">
                    Ganhos na Semana
                  </span>
                  <TrendingUp className="h-4 w-4 text-rental-primary" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rental-primary">
                  {formatarMoeda(resumo?.ganhos_semana_atual ?? 0)}
                </div>
                <p className="text-[11px] text-rental-muted">
                  {resumo?.semana_referencia || 'Semana atual'}
                </p>
              </div>

              {/* Ticket Médio */}
              <div className="rounded-3xl border border-rental-border bg-rental-surface p-5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-muted">
                    Ticket Médio
                  </span>
                  <Receipt className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rental-ink">
                  {formatarMoeda(resumo?.ticket_medio ?? 0)}
                </div>
                <p className="text-[11px] text-rental-muted">
                  Média por atendimento pago
                </p>
              </div>
            </section>

            {/* Lista / Extrato de Últimos Recebimentos */}
            <section aria-labelledby="ultimos-recebimentos-title" className="rounded-3xl border border-rental-border bg-rental-surface p-5 sm:p-6 shadow-panel space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-rental-border/60">
                <div>
                  <h2 id="ultimos-recebimentos-title" className="text-base sm:text-lg font-extrabold text-rental-ink">
                    Últimos Recebimentos Aprovados
                  </h2>
                  <p className="text-xs text-rental-muted">
                    Histórico das transações mais recentes confirmadas via PIX ou Cartão de Crédito.
                  </p>
                </div>
                <span className="text-xs font-bold text-rental-muted">
                  Exibindo {resumo?.pagamentos_recentes?.length ?? 0} registro(s)
                </span>
              </div>

              {!resumo || resumo.total_atendimentos_pagos === 0 || resumo.pagamentos_recentes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-rental-border bg-rental-surface2/20 p-10 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-rental-ink">
                    Nenhum pagamento recebido ainda
                  </h3>
                  <p className="text-xs text-rental-muted max-w-md mx-auto leading-relaxed">
                    Nenhum pagamento recebido ainda. Seus ganhos aparecerão aqui assim que os clientes efetuarem o pagamento dos serviços.
                  </p>
                  <div className="pt-2">
                    <Link href="/profissional/orcamentos">
                      <Button variant="primary" size="sm" leftIcon={<Briefcase className="h-3.5 w-3.5" />}>
                        Ver Orçamentos Recebidos
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-rental-border text-[11px] font-bold uppercase tracking-wider text-rental-muted">
                        <th className="py-3 pr-4">Cliente</th>
                        <th className="py-3 px-3">Orçamento</th>
                        <th className="py-3 px-3">Método</th>
                        <th className="py-3 px-3">Data</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 pl-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rental-border/50 text-xs">
                      {resumo.pagamentos_recentes.map((pgto) => (
                        <tr key={pgto.id} className="hover:bg-rental-surface2/30 transition-colors">
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-2 font-semibold text-rental-ink">
                              <User className="h-3.5 w-3.5 text-rental-primary shrink-0" />
                              <span>{pgto.cliente_nome || 'Cliente da Plataforma'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-rental-muted">
                            #{pgto.orcamento_id}
                          </td>
                          <td className="py-3.5 px-3">
                            {pgto.metodo === 'pix' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <QrCode className="h-3 w-3" />
                                PIX
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                <CreditCard className="h-3 w-3" />
                                Cartão
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-rental-muted whitespace-nowrap">
                            {formatarDataHora(pgto.pago_em)}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-500">
                              <CheckCircle2 className="h-3 w-3" />
                              Aprovado
                            </span>
                          </td>
                          <td className="py-3.5 pl-3 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatarMoeda(pgto.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
