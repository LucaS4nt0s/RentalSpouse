'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { Orcamento } from '../../services/orcamentos';
import {
  Pagamento,
  PagamentoMetodo,
  criarPagamento,
  listarMeusPagamentos,
  obterPagamento,
  simularAprovacaoPix,
  tokenizarCartaoMercadoPago,
} from '../../services/pagamentos';
import { Button } from '../ui/Button';

interface PaymentCheckoutModalProps {
  orcamento: Orcamento;
  onClose: () => void;
  onPaid?: (pagamento: Pagamento) => void;
}

function gerarIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rs-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const PaymentCheckoutModal: React.FC<PaymentCheckoutModalProps> = ({
  orcamento,
  onClose,
  onPaid,
}) => {
  const { token, user } = useAuth();
  const { notificacoes } = useNotifications();

  const valorTotal = Number(orcamento.valor_estimado ?? 0);
  const [metodo, setMetodo] = useState<PagamentoMetodo>('pix');
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);

  // Campos de Cartão (apenas em memória para tokenização client-side no Mercado Pago)
  const [numeroCartao, setNumeroCartao] = useState<string>('');
  const [nomeTitular, setNomeTitular] = useState<string>(user?.nome || orcamento.cliente_nome || '');
  const [cpfTitular, setCpfTitular] = useState<string>('');
  const [validade, setValidade] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [parcelas, setParcelas] = useState<number>(1);

  // Carrega pagamento já existente (aprovado ou pendente) para este orçamento
  useEffect(() => {
    if (!token) return;
    listarMeusPagamentos(token, orcamento.id)
      .then((lista) => {
        const ativo = lista.find((p) => p.status === 'aprovado' || p.status === 'pendente');
        if (ativo) {
          setPagamento(ativo);
          setMetodo(ativo.metodo);
        }
      })
      .catch(() => {
        // silencioso se não houver pagamento anterior
      });
  }, [token, orcamento.id]);

  // Escuta evento WebSocket `pagamento_confirmado` ou faz polling leve se PIX pendente
  useEffect(() => {
    if (!token || !pagamento || pagamento.status !== 'pendente') return;

    const confirmadaWs = notificacoes.some(
      (n) => n.tipo === 'pagamento_confirmado' && n.referencia_id === pagamento.id
    );
    if (confirmadaWs) {
      obterPagamento(pagamento.id, token)
        .then((atualizado) => {
          setPagamento(atualizado);
          if (atualizado.status === 'aprovado' && onPaid) onPaid(atualizado);
        })
        .catch(() => {});
      return;
    }

    const timer = setInterval(async () => {
      try {
        const atualizado = await obterPagamento(pagamento.id, token);
        setPagamento(atualizado);
        if (atualizado.status === 'aprovado' && onPaid) {
          onPaid(atualizado);
        }
      } catch {
        // ignora falha transitória de rede
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [token, pagamento, notificacoes, onPaid]);

  const handleGerarPix = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const novo = await criarPagamento(
        {
          orcamento_id: orcamento.id,
          metodo: 'pix',
          parcelas: 1,
          idempotency_key: gerarIdempotencyKey(),
        },
        token
      );
      setPagamento(novo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar cobrança PIX.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePagarCartao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const partesValidade = validade.replace(/\s/g, '').split('/');
    if (partesValidade.length !== 2 || partesValidade[0].length < 1 || partesValidade[1].length < 2) {
      setError('Informe a validade do cartão no formato MM/AA.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { card_token, payment_method_id } = await tokenizarCartaoMercadoPago({
        numeroCartao,
        nomeTitular,
        cpfTitular,
        mesValidade: partesValidade[0],
        anoValidade: partesValidade[1],
        cvv,
      });

      // Limpa imediatamente PAN, validade e CVV da memória do componente (PCI-DSS SAQ-A)
      setNumeroCartao('');
      setCvv('');
      setValidade('');

      const novo = await criarPagamento(
        {
          orcamento_id: orcamento.id,
          metodo: 'cartao_credito',
          parcelas,
          idempotency_key: gerarIdempotencyKey(),
          cartao: {
            card_token,
            payment_method_id,
            nome_titular: nomeTitular.trim().toUpperCase(),
            cpf_titular: cpfTitular.replace(/\D/g, ''),
          },
        },
        token
      );
      setPagamento(novo);
      if (novo.status === 'aprovado' && onPaid) {
        onPaid(novo);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar cartão de crédito.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimularPix = async () => {
    if (!token || !pagamento) return;
    setIsLoading(true);
    setError(null);
    try {
      const aprovado = await simularAprovacaoPix(pagamento.id, token);
      setPagamento(aprovado);
      if (onPaid) onPaid(aprovado);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao simular aprovação do PIX.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopiarPix = async () => {
    if (!pagamento?.pix_copia_e_cola) return;
    try {
      await navigator.clipboard.writeText(pagamento.pix_copia_e_cola);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    } catch {
      // fallback silencioso
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-lg max-h-[92vh] rounded-3xl border border-rental-border bg-rental-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rental-border bg-rental-surface2/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-rental-ink">
                Checkout Seguro • Mercado Pago
              </h3>
              <span className="text-[11px] text-rental-muted block">
                Orçamento #{orcamento.id} • {orcamento.professional_name || `Profissional #${orcamento.professional_id}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-rental-muted hover:text-rental-ink hover:bg-rental-surface transition-colors"
            aria-label="Fechar checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Resumo bloqueado do valor */}
          <div className="rounded-2xl border border-rental-border bg-rental-surface2/40 p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rental-muted block">
                Valor Total do Serviço
              </span>
              <span className="text-xs text-rental-muted line-clamp-1">
                {orcamento.descricao}
              </span>
            </div>
            <div className="text-right shrink-0 pl-3">
              <span className="text-xl font-black text-emerald-500">
                R$ {valorTotal.toFixed(2)}
              </span>
              <span className="text-[10px] text-rental-muted flex items-center justify-end gap-1">
                <Lock className="h-3 w-3" /> Valor garantido
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Comprovante Digital quando aprovado */}
          {pagamento?.status === 'aprovado' ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-emerald-500">
                  Pagamento Confirmado!
                </h4>
                <p className="text-xs text-rental-muted">
                  O profissional já foi notificado em tempo real. Guarde seu comprovante digital abaixo.
                </p>
              </div>
              <div className="rounded-xl bg-rental-surface p-3.5 text-left text-xs space-y-1.5 border border-rental-border">
                <div className="flex justify-between">
                  <span className="text-rental-muted">ID Mercado Pago:</span>
                  <span className="font-mono font-bold text-rental-ink">#{pagamento.gateway_txid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rental-muted">Referência:</span>
                  <span className="font-mono text-rental-ink">{pagamento.external_reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rental-muted">Método:</span>
                  <span className="font-bold text-rental-ink">
                    {pagamento.metodo === 'pix'
                      ? 'PIX Instantâneo'
                      : `Cartão (${pagamento.cartao_bandeira?.toUpperCase() || 'Crédito'} •••• ${pagamento.cartao_ultimos_digitos || ''}) em ${pagamento.parcelas}x`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rental-muted">Valor Pago:</span>
                  <span className="font-black text-emerald-500">R$ {pagamento.valor.toFixed(2)}</span>
                </div>
              </div>
              <Button variant="primary" className="w-full" onClick={onClose}>
                Concluir e Fechar
              </Button>
            </div>
          ) : (
            <>
              {/* Seletor de Método: PIX vs Cartão */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMetodo('pix');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-xs font-bold transition-all ${
                    metodo === 'pix'
                      ? 'border-rental-primary bg-rental-primary/10 text-rental-primary'
                      : 'border-rental-border bg-rental-surface text-rental-muted hover:text-rental-ink'
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  <span>PIX Instantâneo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetodo('cartao_credito');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-xs font-bold transition-all ${
                    metodo === 'cartao_credito'
                      ? 'border-rental-primary bg-rental-primary/10 text-rental-primary'
                      : 'border-rental-border bg-rental-surface text-rental-muted hover:text-rental-ink'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Cartão de Crédito</span>
                </button>
              </div>

              {/* Aba PIX */}
              {metodo === 'pix' && (
                <div className="space-y-4">
                  {pagamento && pagamento.metodo === 'pix' && pagamento.status === 'pendente' ? (
                    <div className="rounded-2xl border border-rental-border bg-rental-surface2/30 p-4 space-y-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-500">
                        <Clock className="h-4 w-4 animate-pulse" />
                        <span>Aguardando pagamento do QR Code PIX...</span>
                      </div>

                      {pagamento.pix_qr_code_base64 && (
                        <div className="mx-auto w-44 h-44 rounded-2xl bg-white p-3 border border-rental-border flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/png;base64,${pagamento.pix_qr_code_base64}`}
                            alt="QR Code PIX Mercado Pago"
                            className="h-full w-full object-contain"
                          />
                        </div>
                      )}

                      {pagamento.pix_copia_e_cola && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-rental-muted block">
                            Código PIX Copia e Cola (Padrão EMV® BACEN):
                          </span>
                          <div className="rounded-xl border border-rental-border bg-rental-surface p-2.5 font-mono text-[11px] text-rental-ink break-all select-all max-h-20 overflow-y-auto">
                            {pagamento.pix_copia_e_cola}
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleCopiarPix}
                            leftIcon={copiedPix ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            className="w-full"
                          >
                            {copiedPix ? 'Código PIX Copiado!' : 'Copiar Código PIX (Copia e Cola)'}
                          </Button>
                        </div>
                      )}

                      {pagamento.gateway_provider === 'sandbox_mock' && (
                        <div className="pt-2 border-t border-rental-border/50">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSimularPix}
                            disabled={isLoading}
                            leftIcon={<Sparkles className="h-4 w-4" />}
                            className="w-full"
                          >
                            {isLoading ? 'Confirmando...' : 'Simular Pagamento PIX no App do Banco (Sandbox)'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-rental-border bg-rental-surface2/20 p-5 text-center space-y-3">
                      <QrCode className="mx-auto h-10 w-10 text-rental-primary" />
                      <p className="text-xs text-rental-muted leading-relaxed">
                        Gere um QR Code PIX dinâmico via Mercado Pago com aprovação instantânea e comprovante vinculado ao serviço.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleGerarPix}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {isLoading ? 'Gerando QR Code PIX...' : `Gerar QR Code PIX (R$ ${valorTotal.toFixed(2)})`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Aba Cartão de Crédito */}
              {metodo === 'cartao_credito' && (
                <form onSubmit={handlePagarCartao} className="space-y-3.5">
                  {pagamento?.status === 'recusado' && pagamento.motivo_recusa && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">
                      <strong>Pagamento recusado:</strong> {pagamento.motivo_recusa}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-rental-ink">Número do Cartão *</label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={19}
                      value={numeroCartao}
                      onChange={(e) => setNumeroCartao(e.target.value)}
                      placeholder="0000 0000 0000 4242"
                      className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-rental-ink">Nome no Cartão *</label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        value={nomeTitular}
                        onChange={(e) => setNomeTitular(e.target.value)}
                        placeholder="COMO IMPRESSO NO CARTÃO"
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink uppercase focus:border-rental-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-rental-ink">CPF do Titular *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={14}
                        value={cpfTitular}
                        onChange={(e) => setCpfTitular(e.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-rental-ink">Validade *</label>
                      <input
                        type="text"
                        required
                        maxLength={7}
                        value={validade}
                        onChange={(e) => setValidade(e.target.value)}
                        placeholder="MM/AA"
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-rental-ink">CVV *</label>
                      <input
                        type="password"
                        required
                        inputMode="numeric"
                        maxLength={4}
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value)}
                        placeholder="123"
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-3.5 py-2 text-sm text-rental-ink focus:border-rental-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-rental-ink">Parcelas</label>
                      <select
                        value={parcelas}
                        onChange={(e) => setParcelas(Number(e.target.value))}
                        className="w-full rounded-xl border border-rental-border bg-rental-surface px-2.5 py-2 text-xs text-rental-ink focus:border-rental-primary focus:outline-none"
                      >
                        {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de R$ {(valorTotal / n).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] text-rental-muted flex items-center gap-1.5 pt-1">
                    <Lock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>
                      Seus dados de cartão são tokenizados diretamente no Mercado Pago (PCI-DSS) e jamais são salvos no servidor.
                    </span>
                  </p>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading}
                    className="w-full"
                    leftIcon={<CreditCard className="h-4 w-4" />}
                  >
                    {isLoading
                      ? 'Processando no Mercado Pago...'
                      : `Pagar ${parcelas}x de R$ ${(valorTotal / parcelas).toFixed(2)}`}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
