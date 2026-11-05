'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  User,
  Mail,
  Phone,
  Image as ImageIcon,
  DollarSign,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Maximize2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  Orcamento,
  obterOrcamento,
  responderOrcamento,
  aceitarOrcamento,
  recusarOrcamento,
  obterFotoUrl,
} from '../../services/orcamentos';
import { Button } from '../ui/Button';

interface QuoteDetailModalProps {
  orcamentoId: number;
  onClose: () => void;
  onResponded?: () => void;
}

const MOTIVOS_RECUSA_PREDEFINIDOS = [
  'Agenda lotada / Sem capacidade no período',
  'Fora da região ou raio de atendimento',
  'Serviço incompatível com especialidade técnica',
  'Prazo solicitado inviável',
  'Outro motivo',
];

export const QuoteDetailModal: React.FC<QuoteDetailModalProps> = ({
  orcamentoId,
  onClose,
  onResponded,
}) => {
  const { token, user } = useAuth();
  const isProfessional = Boolean(
    user && (user.tipo === 'profissional' || user.role === 'professional' || user.role === 'admin')
  );
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modo de Ação: 'visualizar' | 'aceitar' | 'recusar' | 'responder'
  const [actionMode, setActionMode] = useState<'visualizar' | 'aceitar' | 'recusar' | 'responder'>('visualizar');

  // Formulário de Resposta com Estimativa
  const [valorInput, setValorInput] = useState<string>('');
  const [respostaInput, setRespostaInput] = useState<string>('');

  // Formulário de Aceite (Issue #29)
  const [valorAceiteInput, setValorAceiteInput] = useState<string>('');
  const [dataPrevistaAceiteInput, setDataPrevistaAceiteInput] = useState<string>('');
  const [mensagemAceiteInput, setMensagemAceiteInput] = useState<string>('');

  // Formulário de Recusa (Issue #29)
  const [motivoSelect, setMotivoSelect] = useState<string>(MOTIVOS_RECUSA_PREDEFINIDOS[0]);
  const [motivoOutroInput, setMotivoOutroInput] = useState<string>('');
  const [justificativaRecusaInput, setJustificativaRecusaInput] = useState<string>('');

  // Estados de Envio
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Visualizador ampliado de foto (Lightbox)
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const carregarDetalhes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await obterOrcamento(orcamentoId, token);
      setOrcamento(data);
      if (data.valor_estimado) {
        setValorInput(String(data.valor_estimado));
        setValorAceiteInput(String(data.valor_estimado));
      }
      if (data.resposta_profissional) {
        setRespostaInput(data.resposta_profissional);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar orçamento';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarDetalhes();
  }, [orcamentoId, token]);

  // Fechar ao pressionar Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewPhotoUrl) {
          setPreviewPhotoUrl(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewPhotoUrl]);

  const handleConfirmarAceite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    let valorNum: number | undefined = undefined;
    if (valorAceiteInput.trim()) {
      valorNum = parseFloat(valorAceiteInput.replace(',', '.'));
      if (isNaN(valorNum) || valorNum <= 0) {
        setSubmitError('Informe um valor preliminar válido maior que zero.');
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await aceitarOrcamento(
        orcamentoId,
        {
          valor_estimado: valorNum,
          data_prevista: dataPrevistaAceiteInput ? new Date(dataPrevistaAceiteInput).toISOString() : null,
          mensagem: mensagemAceiteInput.trim() || undefined,
        },
        token
      );
      setOrcamento(updated);
      setActionMode('visualizar');
      if (onResponded) {
        onResponded();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao aceitar orçamento.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmarRecusa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const motivoFinal = motivoSelect === 'Outro motivo' ? motivoOutroInput.trim() : motivoSelect.trim();
    if (!motivoFinal || motivoFinal.length < 3) {
      setSubmitError('Por favor, informe um motivo válido para a recusa com no mínimo 3 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await recusarOrcamento(
        orcamentoId,
        {
          motivo: motivoFinal,
          justificativa_detalhada: justificativaRecusaInput.trim() || undefined,
        },
        token
      );
      setOrcamento(updated);
      setActionMode('visualizar');
      if (onResponded) {
        onResponded();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao recusar orçamento.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitResposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const valorNum = parseFloat(valorInput.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setSubmitError('Informe um valor numérico válido maior que zero.');
      return;
    }

    const descLimpa = respostaInput.trim();
    if (descLimpa.length < 5) {
      setSubmitError('O parecer técnico deve conter pelo menos 5 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await responderOrcamento(
        orcamentoId,
        {
          valor_estimado: valorNum,
          resposta_profissional: descLimpa,
        },
        token
      );
      setOrcamento(updated);
      setActionMode('visualizar');
      if (onResponded) {
        onResponded();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar proposta.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-500">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Pendente de Decisão
          </span>
        );
      case 'aceito':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Orçamento Aceito
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-500">
            <Clock className="h-3.5 w-3.5" />
            Estimativa Enviada
          </span>
        );
      case 'recusado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-500">
            <XCircle className="h-3.5 w-3.5" />
            Orçamento Recusado
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-3xl border border-rental-border bg-rental-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo / Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rental-border bg-rental-surface2/40">
          <div className="flex items-center gap-3">
            <h3 className="text-base sm:text-lg font-black text-rental-ink tracking-tight">
              Orçamento #{orcamentoId}
            </h3>
            {orcamento && getStatusBadge(orcamento.status)}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-rental-muted hover:text-rental-ink hover:bg-rental-surface transition-colors"
            title="Fechar"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="h-6 w-48 bg-rental-surface2 rounded-xl animate-pulse" />
              <div className="h-24 bg-rental-surface2 rounded-2xl animate-pulse" />
              <div className="h-36 bg-rental-surface2 rounded-2xl animate-pulse" />
            </div>
          ) : error || !orcamento ? (
            <div className="py-8 text-center space-y-4">
              <AlertCircle className="mx-auto h-10 w-10 text-[var(--rs-error)]" />
              <p className="text-sm text-rental-muted">{error || 'Não foi possível carregar os dados.'}</p>
              <Button variant="secondary" size="sm" onClick={carregarDetalhes} leftIcon={<RefreshCw className="h-4 w-4" />}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {/* Participantes: Profissional e Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cartão do Profissional Destinatário */}
                <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-muted flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-rental-primary shrink-0" />
                    Profissional Destinatário
                  </span>
                  <div className="text-xs space-y-1">
                    <div className="font-extrabold text-sm text-rental-ink">
                      {orcamento.professional_name || `Profissional #${orcamento.professional_id}`}
                    </div>
                    <span className="text-rental-muted text-[11px] block">
                      Prestador parceiro RentalSpouse
                    </span>
                  </div>
                </div>

                {/* Cartão do Cliente Solicitante */}
                <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-muted flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-rental-primary shrink-0" />
                    Cliente Solicitante
                  </span>
                  <div className="text-xs space-y-1 text-rental-ink">
                    <div className="font-semibold text-rental-ink">{orcamento.cliente_nome}</div>
                    <div className="flex items-center gap-1.5 text-rental-muted truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{orcamento.cliente_email}</span>
                    </div>
                    {orcamento.cliente_telefone && (
                      <div className="flex items-center gap-1.5 text-rental-muted">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{orcamento.cliente_telefone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Data da Solicitação */}
              <div className="flex items-center gap-2 text-xs text-rental-muted px-1">
                <Clock className="h-4 w-4 shrink-0 text-rental-primary" />
                <span>
                  Solicitado em {new Date(orcamento.criado_em).toLocaleString('pt-BR')}
                </span>
              </div>

              {/* Descrição do Problema */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rental-muted">
                  Descrição do Problema / Serviço
                </span>
                <div className="rounded-2xl border border-rental-border bg-rental-surface p-4 text-sm text-rental-ink leading-relaxed whitespace-pre-wrap">
                  {orcamento.descricao}
                </div>
              </div>

              {/* Fotos Anexadas */}
              {orcamento.fotos && orcamento.fotos.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rental-muted flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-rental-primary" />
                    Fotos Anexadas ({orcamento.fotos.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {orcamento.fotos.map((foto) => {
                      const fotoUrl = obterFotoUrl(orcamento.id, foto.id);
                      return (
                        <div
                          key={foto.id}
                          onClick={() => setPreviewPhotoUrl(fotoUrl)}
                          className="group relative aspect-video rounded-xl border border-rental-border overflow-hidden bg-rental-surface2 cursor-pointer transition-transform hover:scale-[1.02]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fotoUrl}
                            alt={foto.nome_original}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="h-5 w-5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção de Decisão e Gestão de Capacidade do Prestador (Issue #29) */}
              <div className="pt-2 border-t border-rental-border space-y-4">
                {/* 1. Status: Aceito */}
                {orcamento.status === 'aceito' && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-500 font-extrabold text-sm">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>Orçamento Aceito pelo Prestador</span>
                      </div>
                      {orcamento.valor_estimado && (
                        <span className="text-base font-black text-emerald-500">
                          R$ {orcamento.valor_estimado.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {orcamento.data_prevista && (
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Calendar className="h-4 w-4" />
                        <span>Previsão de Atendimento: {new Date(orcamento.data_prevista).toLocaleString('pt-BR')}</span>
                      </div>
                    )}
                    {orcamento.resposta_profissional && (
                      <div className="text-xs text-rental-ink/90 leading-relaxed bg-rental-surface/60 rounded-xl p-3 border border-rental-border/40">
                        <span className="font-bold block mb-1 text-rental-muted text-[11px]">
                          Instruções / Parecer:
                        </span>
                        {orcamento.resposta_profissional}
                      </div>
                    )}
                    {orcamento.decidido_em && (
                      <span className="text-[11px] text-rental-muted block">
                        Aceito em {new Date(orcamento.decidido_em).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                )}

                {/* 2. Status: Recusado */}
                {orcamento.status === 'recusado' && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-rose-500 font-extrabold text-sm">
                      <XCircle className="h-5 w-5" />
                      <span>Orçamento Recusado</span>
                    </div>
                    {orcamento.motivo_recusa && (
                      <div className="text-xs text-rental-ink/90 bg-rental-surface/60 rounded-xl p-3 border border-rental-border/40 space-y-1">
                        <span className="font-bold block text-rental-muted text-[11px]">
                          Motivo da Recusa:
                        </span>
                        <p className="font-bold text-rose-600 dark:text-rose-400">{orcamento.motivo_recusa}</p>
                        {orcamento.justificativa_recusa && (
                          <p className="mt-1 text-rental-muted text-[11px]">{orcamento.justificativa_recusa}</p>
                        )}
                      </div>
                    )}
                    {orcamento.decidido_em && (
                      <span className="text-[11px] text-rental-muted block">
                        Recusado em {new Date(orcamento.decidido_em).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                )}

                {/* 3. Status: Respondido */}
                {orcamento.status === 'respondido' && (
                  <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-500 font-extrabold text-sm">
                        <Clock className="h-5 w-5" />
                        <span>Estimativa Preliminar Enviada</span>
                      </div>
                      {orcamento.valor_estimado && (
                        <span className="text-base font-black text-blue-500">
                          R$ {orcamento.valor_estimado.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {orcamento.resposta_profissional && (
                      <div className="text-xs text-rental-ink/90 leading-relaxed bg-rental-surface/60 rounded-xl p-3 border border-rental-border/40">
                        <span className="font-bold block mb-1 text-rental-muted text-[11px]">
                          Parecer Técnico:
                        </span>
                        {orcamento.resposta_profissional}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Status: Pendente (visão do cliente) */}
                {orcamento.status === 'pendente' && !isProfessional && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-2">
                    <div className="flex items-center gap-2 text-amber-500 font-extrabold text-sm">
                      <Clock className="h-5 w-5" />
                      <span>Aguardando Análise do Profissional</span>
                    </div>
                    <p className="text-xs text-rental-ink/80 leading-relaxed">
                      Sua solicitação de orçamento foi enviada ao profissional. Assim que ele avaliar a descrição e fotos anexadas, você receberá uma notificação aqui com o parecer técnico e a estimativa de valor.
                    </p>
                  </div>
                )}

                {/* Mensagem de Erro Geral de Envio */}
                {submitError && (
                  <div className="rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)] flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Formulários e Ações para Orçamentos Pendentes (exclusivo para profissionais) */}
                {isProfessional && (orcamento.status === 'pendente' || orcamento.status === 'respondido') && (
                  <>
                    {/* Modo 0: Seleção de Ação */}
                    {actionMode === 'visualizar' && (
                      <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-extrabold text-rental-ink block">
                              Gerenciar Capacidade de Trabalho
                            </span>
                            <span className="text-xs text-rental-muted">
                              Aceite para assumir o serviço, recuse para manter sua agenda livre, ou envie estimativa.
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            onClick={() => setActionMode('aceitar')}
                            leftIcon={<ThumbsUp className="h-4 w-4" />}
                          >
                            Aceitar Orçamento
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="md"
                            onClick={() => setActionMode('recusar')}
                            leftIcon={<ThumbsDown className="h-4 w-4" />}
                          >
                            Recusar Orçamento
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setActionMode('responder')}
                            leftIcon={<Send className="h-4 w-4" />}
                          >
                            Enviar Estimativa
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Modo 1: Formulário de Aceite (Issue #29) */}
                    {actionMode === 'aceitar' && (
                      <form onSubmit={handleConfirmarAceite} className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
                        <div className="flex items-center justify-between border-b border-rental-border/40 pb-2">
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                            <CheckCircle2 className="h-5 w-5" />
                            <span>Confirmar Aceite da Solicitação</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMode('visualizar');
                              setSubmitError(null);
                            }}
                            className="text-xs text-rental-muted hover:text-rental-ink flex items-center gap-1"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Voltar
                          </button>
                        </div>

                        <p className="text-xs text-rental-muted leading-relaxed">
                          Ao aceitar, o cliente será notificado imediatamente em tempo real e por e-mail de que você assumiu este serviço em sua capacidade.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-rental-ink flex items-center gap-1">
                              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                              Valor Estimado Inicial (R$) (Opcional)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={valorAceiteInput}
                              onChange={(e) => setValorAceiteInput(e.target.value)}
                              placeholder="Ex: 180.00"
                              className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-rental-ink flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                              Data / Horário Sugerido (Opcional)
                            </label>
                            <input
                              type="datetime-local"
                              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                              value={dataPrevistaAceiteInput}
                              onChange={(e) => setDataPrevistaAceiteInput(e.target.value)}
                              className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-rental-ink">
                            Mensagem / Condições ao Cliente (Opcional)
                          </label>
                          <textarea
                            rows={2}
                            maxLength={2000}
                            value={mensagemAceiteInput}
                            onChange={(e) => setMensagemAceiteInput(e.target.value)}
                            placeholder="Ex: Confirmo o aceite do serviço. Entrarei em contato via WhatsApp para confirmar o endereço."
                            className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setActionMode('visualizar')}
                            disabled={isSubmitting}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            disabled={isSubmitting}
                            leftIcon={<CheckCircle2 className="h-4 w-4" />}
                          >
                            {isSubmitting ? 'Confirmando...' : 'Confirmar Aceite'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Modo 2: Formulário de Recusa (Issue #29) */}
                    {actionMode === 'recusar' && (
                      <form onSubmit={handleConfirmarRecusa} className="space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5">
                        <div className="flex items-center justify-between border-b border-rental-border/40 pb-2">
                          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-sm">
                            <XCircle className="h-5 w-5" />
                            <span>Recusar Solicitação de Orçamento</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMode('visualizar');
                              setSubmitError(null);
                            }}
                            className="text-xs text-rental-muted hover:text-rental-ink flex items-center gap-1"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Voltar
                          </button>
                        </div>

                        <p className="text-xs text-rental-muted leading-relaxed">
                          Indique o motivo pelo qual você não poderá atender a este orçamento. Isso ajuda a gerenciar sua capacidade de trabalho e esclarece a situação para o cliente.
                        </p>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-rental-ink">
                            Motivo da Recusa *
                          </label>
                          <select
                            value={motivoSelect}
                            onChange={(e) => setMotivoSelect(e.target.value)}
                            className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2.5 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                          >
                            {MOTIVOS_RECUSA_PREDEFINIDOS.map((motivo) => (
                              <option key={motivo} value={motivo}>
                                {motivo}
                              </option>
                            ))}
                          </select>
                        </div>

                        {motivoSelect === 'Outro motivo' && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-rental-ink">
                              Descreva o Motivo *
                            </label>
                            <input
                              type="text"
                              required
                              minLength={3}
                              maxLength={150}
                              value={motivoOutroInput}
                              onChange={(e) => setMotivoOutroInput(e.target.value)}
                              placeholder="Ex: Equipamento de teste em calibração"
                              className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-rental-ink">
                            Justificativa Detalhada (Opcional)
                          </label>
                          <textarea
                            rows={3}
                            maxLength={2000}
                            value={justificativaRecusaInput}
                            onChange={(e) => setJustificativaRecusaInput(e.target.value)}
                            placeholder="Ex: Minha agenda desta semana está 100% preenchida. Sugiro abrir chamado com outro profissional da região."
                            className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setActionMode('visualizar')}
                            disabled={isSubmitting}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            variant="danger"
                            size="md"
                            disabled={isSubmitting}
                            leftIcon={<XCircle className="h-4 w-4" />}
                          >
                            {isSubmitting ? 'Confirmando...' : 'Confirmar Recusa'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Modo 3: Formulário de Envio de Estimativa */}
                    {actionMode === 'responder' && (
                      <form onSubmit={handleSubmitResposta} className="space-y-4 rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 sm:p-5">
                        <div className="flex items-center justify-between border-b border-rental-border/40 pb-2">
                          <span className="text-sm font-extrabold text-rental-ink">
                            Enviar Estimativa de Orçamento
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMode('visualizar');
                              setSubmitError(null);
                            }}
                            className="text-xs text-rental-muted hover:text-rental-ink flex items-center gap-1"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Voltar
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-rental-ink flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5 text-rental-primary" />
                            Valor Estimado (R$) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            required
                            value={valorInput}
                            onChange={(e) => setValorInput(e.target.value)}
                            placeholder="Ex: 150.00"
                            className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                          />
                          <p className="text-[11px] text-rental-muted">
                            Valor preliminar baseado na descrição e nas fotos antes da visita presencial.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-rental-ink">
                            Parecer Técnico e Condições *
                          </label>
                          <textarea
                            rows={3}
                            required
                            minLength={5}
                            maxLength={2000}
                            value={respostaInput}
                            onChange={(e) => setRespostaInput(e.target.value)}
                            placeholder="Ex: Valor cobre mão de obra e deslocamento. Materiais necessários serão cotados à parte."
                            className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setActionMode('visualizar')}
                            disabled={isSubmitting}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            disabled={isSubmitting}
                            leftIcon={<Send className="h-4 w-4" />}
                          >
                            {isSubmitting ? 'Enviando...' : 'Enviar Proposta'}
                          </Button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

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
            <X className="h-6 w-6" />
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
    </div>
  );
};
