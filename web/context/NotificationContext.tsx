'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  Notificacao,
  listarNotificacoes,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
} from '../services/notificacoes';
import { NotificationToast, ToastData } from '../components/notificacoes/NotificationToast';
import { QuoteDetailModal } from '../components/orcamentos/QuoteDetailModal';

interface NotificationContextType {
  notificacoes: Notificacao[];
  unreadCount: number;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  latestToast: ToastData | null;
  dismissToast: () => void;
  activeQuoteId: number | null;
  openQuoteModal: (id: number) => void;
  closeQuoteModal: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser utilizado dentro de um NotificationProvider');
  }
  return context;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, token, isAuthenticated } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Estados de Toast e Modal
  const [latestToast, setLatestToast] = useState<ToastData | null>(null);
  const [activeQuoteId, setActiveQuoteId] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const isProfessional = Boolean(
    isAuthenticated &&
      (user?.tipo === 'profissional' || user?.role === 'professional')
  );

  // 1. Carregamento inicial via REST
  const refreshNotifications = useCallback(async () => {
    if (!token || !isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listarNotificacoes(token, { limit: 50 });
      setNotificacoes(data);
      const unread = data.filter((item) => !item.lida).length;
      setUnreadCount(unread);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao listar notificações';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && token) {
      refreshNotifications();
    } else {
      setNotificacoes([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, token, refreshNotifications]);

  // 2. Conexão WebSocket em Tempo Real (Issue #34)
  const connectWebSocket = useCallback(() => {
    if (!token || !isAuthenticated || !isProfessional) return;

    // Limpa timeout prévio se houver
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
      let wsProtocol = 'ws:';
      let wsHost = 'localhost:8000';

      try {
        const parsed = new URL(
          apiUrl,
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'
        );
        wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        wsHost = parsed.host;
      } catch {
        // Fallback para localhost:8000
      }

      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/notificacoes?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Inicia heartbeat ping a cada 25 segundos
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          if (event.data === 'pong') return;

          const data = JSON.parse(event.data);

          if (data.evento === 'novo_orcamento') {
            const nova: Notificacao = {
              id: data.notificacao_id || Date.now(),
              user_email: user?.email || '',
              titulo: data.titulo || 'Novo Orçamento Solicitado',
              mensagem:
                data.mensagem ||
                'Um cliente acabou de enviar uma nova solicitação de orçamento.',
              tipo: data.tipo || 'novo_orcamento',
              referencia_id: data.referencia_id ?? data.orcamento_id ?? null,
              lida: false,
              criada_em: data.criada_em || new Date().toISOString(),
            };

            setNotificacoes((prev) => [nova, ...prev.filter((n) => n.id !== nova.id)]);
            setUnreadCount((prev) => prev + 1);

            // Dispara Toast interativo na tela
            setLatestToast({
              id: nova.id,
              titulo: nova.titulo,
              mensagem: nova.mensagem,
              referencia_id: nova.referencia_id,
            });
          }
        } catch (e) {
          console.warn('Erro ao processar mensagem recebida do WebSocket:', e);
        }
      };

      ws.onerror = () => {
        // Log leve de desconexão
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Reconexão defensiva exponencial (até 10 segundos max)
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && isProfessional && token) {
            connectWebSocket();
          }
        }, delay);
      };
    } catch (err) {
      console.warn('Falha ao iniciar cliente WebSocket:', err);
    }
  }, [token, isAuthenticated, isProfessional, user?.email]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isAuthenticated && isProfessional && token) {
      connectWebSocket();
    } else {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [isAuthenticated, isProfessional, token, connectWebSocket]);

  // 3. Ações de Leitura
  const markAsRead = useCallback(
    async (id: number) => {
      if (!token) return;
      // Atualização otimista
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await marcarNotificacaoComoLida(id, token);
      } catch (e) {
        // Reverte se der erro
        refreshNotifications();
      }
    },
    [token, refreshNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    if (!token) return;
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    setUnreadCount(0);

    try {
      await marcarTodasNotificacoesComoLidas(token);
    } catch (e) {
      refreshNotifications();
    }
  }, [token, refreshNotifications]);

  const dismissToast = useCallback(() => {
    setLatestToast(null);
  }, []);

  const openQuoteModal = useCallback((id: number) => {
    setActiveQuoteId(id);
    // Marca a notificação associada como lida se existir
    setNotificacoes((prev) => {
      const notif = prev.find((n) => n.referencia_id === id && !n.lida);
      if (notif && token) {
        marcarNotificacaoComoLida(notif.id, token).catch(() => {});
        setUnreadCount((c) => Math.max(0, c - 1));
        return prev.map((n) => (n.id === notif.id ? { ...n, lida: true } : n));
      }
      return prev;
    });
  }, [token]);

  const closeQuoteModal = useCallback(() => {
    setActiveQuoteId(null);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notificacoes,
        unreadCount,
        isConnected,
        isLoading,
        error,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        latestToast,
        dismissToast,
        activeQuoteId,
        openQuoteModal,
        closeQuoteModal,
      }}
    >
      {children}
      {/* Toast flutuante de alerta em tempo real */}
      <NotificationToast
        toast={latestToast}
        onClose={dismissToast}
        onViewQuote={(id) => {
          dismissToast();
          openQuoteModal(id);
        }}
      />
      {/* Modal interativo de visualização e resposta ao orçamento */}
      {activeQuoteId && (
        <QuoteDetailModal
          orcamentoId={activeQuoteId}
          onClose={closeQuoteModal}
          onResponded={() => {
            refreshNotifications();
          }}
        />
      )}
    </NotificationContext.Provider>
  );
};
