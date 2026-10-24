'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useIsProfessional } from '../documentos/ProfessionalDocumentsLink';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'agora há pouco';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `há ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `há ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `há ${diffDays} d`;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export const NotificationBell: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const isProfessional = useIsProfessional();
  const {
    notificacoes,
    unreadCount,
    isConnected,
    isLoading,
    markAsRead,
    markAllAsRead,
    openQuoteModal,
    refreshNotifications,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora ou pressionar Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão de Disparo do Sino */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-rental-border bg-rental-surface text-rental-muted hover:border-rental-primary/40 hover:text-rental-primary transition-colors focus:outline-none"
        title="Notificações em tempo real"
        aria-label="Abrir notificações"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />

        {/* Badge de Não Lidas */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--rs-primary)] px-1 text-[10px] font-black text-[var(--rs-primary-text)] shadow-sm">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rental-primary opacity-60" />
            <span className="relative z-10">{unreadCount > 9 ? '9+' : unreadCount}</span>
          </span>
        )}
      </button>

      {/* Painel Dropdown Flutuante */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-3xl border border-rental-border bg-rental-surface shadow-2xl p-4 z-40 animate-fadeIn">
          {/* Header do Dropdown */}
          <div className="flex items-center justify-between pb-3 border-b border-rental-border">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-extrabold text-rental-ink tracking-tight">
                Notificações
              </h4>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rental-primary/10 px-2 py-0.5 text-[10px] font-bold text-rental-primary">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Status do WebSocket */}
            <div className="flex items-center gap-1 text-[10px] font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rental-muted'
                }`}
              />
              <span className={isConnected ? 'text-emerald-500' : 'text-rental-muted'}>
                {isConnected ? 'Ao vivo' : 'Conectando'}
              </span>
            </div>
          </div>

          {/* Ações Rápidas */}
          <div className="flex items-center justify-between pt-2 pb-1 text-xs">
            <button
              type="button"
              onClick={refreshNotifications}
              disabled={isLoading}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-rental-muted hover:text-rental-ink transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rental-primary hover:underline transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Lista de Notificações */}
          <div className="mt-2 max-h-80 overflow-y-auto space-y-2 pr-1">
            {isLoading && notificacoes.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <div className="h-4 w-3/4 mx-auto bg-rental-surface2 rounded animate-pulse" />
                <div className="h-4 w-1/2 mx-auto bg-rental-surface2 rounded animate-pulse" />
              </div>
            ) : notificacoes.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-rental-surface2 text-rental-muted">
                  <Inbox className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-rental-ink">
                  Nenhuma notificação no momento
                </p>
                <p className="text-[11px] text-rental-muted max-w-[220px] mx-auto">
                  {isProfessional
                    ? 'Você receberá alertas instantâneos assim que clientes solicitarem novos orçamentos.'
                    : 'Você receberá alertas instantâneos assim que os profissionais responderem aos seus orçamentos.'}
                </p>
              </div>
            ) : (
              notificacoes.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.lida) markAsRead(item.id);
                    if (item.referencia_id) {
                      openQuoteModal(item.referencia_id);
                      setIsOpen(false);
                    }
                  }}
                  className={`group relative rounded-2xl p-3 border transition-all cursor-pointer ${
                    item.lida
                      ? 'border-rental-border bg-rental-surface hover:bg-rental-surface2/40'
                      : 'border-rental-primary/30 bg-rental-primary/5 hover:bg-rental-primary/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {!item.lida && (
                        <span className="h-2 w-2 rounded-full bg-rental-primary shrink-0" />
                      )}
                      <h5
                        className={`text-xs font-bold leading-tight ${
                          item.lida ? 'text-rental-ink' : 'text-rental-primary'
                        }`}
                      >
                        {item.titulo}
                      </h5>
                    </div>
                    <span className="text-[10px] text-rental-muted shrink-0">
                      {formatRelativeTime(item.criada_em)}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-rental-muted line-clamp-2 leading-relaxed">
                    {item.mensagem}
                  </p>

                  {item.referencia_id && (
                    <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-rental-primary pt-1 border-t border-rental-border/40">
                      <span>Ver orçamento #{item.referencia_id}</span>
                      <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Rodapé com atalho para o painel de orçamentos */}
          <div className="p-2.5 border-t border-rental-border bg-rental-surface2/50 text-center">
            <Link
              href={isProfessional ? '/profissional/orcamentos' : '/cliente/orcamentos'}
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-rental-primary hover:underline flex items-center justify-center gap-1.5"
            >
              <span>
                {isProfessional
                  ? 'Gerenciar orçamentos e capacidade'
                  : 'Ver meus orçamentos e respostas'}
              </span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
