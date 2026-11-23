'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  Search,
  Briefcase,
  Calendar,
  FileCheck2,
  ShieldCheck,
  AlertTriangle,
  User,
  LogOut,
  Menu,
  X,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationBell } from '../notificacoes/NotificationBell';

export interface AppHeaderProps {
  /** Callback opcional acionado ao clicar em "Meus Agendamentos" (ex.: na tela de agendamento) */
  onOpenAgendamentos?: () => void;
  /** Callback customizado de logout (ex.: painel admin com estado local adicional) */
  onCustomLogout?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenAgendamentos,
  onCustomLogout,
}) => {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const role =
    user?.role === 'admin' || user?.tipo === 'admin'
      ? 'admin'
      : user?.role === 'professional' || user?.tipo === 'profissional'
      ? 'professional'
      : isAuthenticated
      ? 'client'
      : 'guest';

  const firstName = (user?.nome || user?.name || 'Minha Conta').split(' ')[0];

  const handleConfirmLogout = () => {
    setConfirmingLogout(false);
    setMobileMenuOpen(false);
    if (onCustomLogout) {
      onCustomLogout();
    } else {
      logout();
    }
  };

  const getNavItems = (): NavItem[] => {
    if (role === 'client') {
      return [
        { href: '/profissionais', label: 'Buscar Profissionais', icon: Search },
        { href: '/cliente/orcamentos', label: 'Meus Orçamentos', icon: Briefcase },
        {
          href: '/profissionais',
          label: 'Meus Agendamentos',
          icon: Calendar,
          onClick: onOpenAgendamentos,
        },
      ];
    }
    if (role === 'professional') {
      return [
        { href: '/profissional/agenda', label: 'Minha Agenda', icon: Calendar },
        { href: '/profissional/orcamentos', label: 'Orçamentos Recebidos', icon: Briefcase },
        { href: '/profissional/ganhos', label: 'Meus Ganhos', icon: Wallet },
        { href: '/profissional/documentos', label: 'Meus Documentos', icon: FileCheck2 },
      ];
    }
    if (role === 'admin') {
      return [
        { href: '/admin/moderacao', label: 'Moderação de Documentos', icon: ShieldCheck },
        { href: '/admin/denuncias', label: 'Painel de Denúncias', icon: AlertTriangle },
        { href: '/cadastro/admin', label: 'Administradores', icon: Users },
      ];
    }
    return [{ href: '/profissionais', label: 'Buscar Profissionais', icon: Search }];
  };

  const navItems = getNavItems();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-rental-border bg-rental-bg/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        {/* Logo RentalSpouse */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)] shadow-primary">
            <Zap className="h-5 w-5" />
          </span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-rental-ink">
              RentalSpouse
            </span>
            {role === 'admin' && (
              <span className="rounded-full border border-rental-primary/20 bg-rental-primary/10 px-2 py-0.5 text-[10px] font-bold text-rental-primary">
                Admin
              </span>
            )}
          </div>
        </Link>

        {/* Navegação Desktop */}
        <nav
          aria-label="Navegação principal"
          className="hidden md:flex items-center gap-1.5"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href) && !item.onClick);

            if (item.onClick) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-rental-muted transition-colors hover:bg-rental-surface2 hover:text-rental-ink"
                >
                  <Icon className="h-3.5 w-3.5 text-rental-primary" />
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-rental-primary/10 text-rental-primary font-bold'
                    : 'text-rental-muted hover:bg-rental-surface2 hover:text-rental-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Ações à Direita (Desktop) */}
        <div className="hidden md:flex items-center gap-2.5">
          {isLoading ? (
            <div className="h-8 w-28 animate-pulse rounded-xl bg-rental-surface2" />
          ) : isAuthenticated && user ? (
            <>
              {(role === 'client' || role === 'professional') && <NotificationBell />}

              <Link
                href="/minha-conta"
                title="Minha Conta"
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                  pathname?.startsWith('/minha-conta')
                    ? 'border-rental-primary bg-rental-primary/10 text-rental-primary'
                    : 'border-rental-border bg-rental-surface text-rental-ink hover:border-rental-primary/40 hover:text-rental-primary'
                }`}
              >
                <User className="h-3.5 w-3.5 text-rental-primary" />
                <span>Minha Conta ({firstName})</span>
              </Link>

              <ThemeToggle showLabel={false} />

              {/* Botão Sair com isolamento / confirmação contra clique acidental */}
              {confirmingLogout ? (
                <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 px-2 py-1">
                  <button
                    type="button"
                    onClick={handleConfirmLogout}
                    className="rounded-lg bg-[var(--rs-error)] px-2 py-1 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                  >
                    Confirmar saída
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingLogout(false)}
                    className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-rental-muted hover:text-rental-ink"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rental-border px-2.5 py-1.5 text-xs font-semibold text-rental-muted transition-colors hover:border-[var(--rs-error)]/40 hover:text-[var(--rs-error)]"
                  title="Sair da conta"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair</span>
                </button>
              )}
            </>
          ) : (
            <>
              <ThemeToggle showLabel={false} />
              <Link
                href="/entrar?mode=signin"
                className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-rental-ink transition-colors hover:text-rental-primary"
              >
                Entrar
              </Link>
              <Link
                href="/entrar?mode=signup"
                className="inline-flex items-center gap-1.5 rounded-xl bg-rental-primary px-3.5 py-1.5 text-xs font-bold text-[var(--rs-primary-text)] shadow-primary transition-colors hover:bg-[var(--rs-primary-hover)]"
              >
                Cadastre-se
              </Link>
            </>
          )}
        </div>

        {/* Controles Mobile (< 768px) */}
        <div className="flex items-center gap-2 md:hidden">
          {isAuthenticated && (role === 'client' || role === 'professional') && (
            <NotificationBell />
          )}
          <ThemeToggle showLabel={false} />
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen((prev) => !prev);
              setConfirmingLogout(false);
            }}
            aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rental-border bg-rental-surface text-rental-ink transition-colors hover:border-rental-primary"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Drawer / Menu Responsivo Mobile */}
      {mobileMenuOpen && (
        <div
          aria-label="Menu de navegação móvel"
          className="border-t border-rental-border bg-rental-surface px-4 py-4 shadow-lg md:hidden animate-fadeIn"
        >
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              if (item.onClick) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      item.onClick?.();
                    }}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-rental-ink hover:bg-rental-surface2"
                  >
                    <Icon className="h-4 w-4 text-rental-primary" />
                    <span>{item.label}</span>
                  </button>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-rental-ink hover:bg-rental-surface2"
                >
                  <Icon className="h-4 w-4 text-rental-primary" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {isAuthenticated && user ? (
              <>
                <Link
                  href="/minha-conta"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl bg-rental-primary/10 px-3 py-2.5 text-xs font-bold text-rental-primary"
                >
                  <User className="h-4 w-4" />
                  <span>Minha Conta ({firstName})</span>
                </Link>

                <div className="mt-2 border-t border-rental-border pt-2">
                  {confirmingLogout ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--rs-error)]/40 bg-[var(--rs-error)]/10 p-2">
                      <span className="text-xs font-semibold text-[var(--rs-error)]">
                        Deseja encerrar a sessão?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleConfirmLogout}
                          className="rounded-lg bg-[var(--rs-error)] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingLogout(false)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rental-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingLogout(true)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-rental-muted hover:bg-red-500/10 hover:text-[var(--rs-error)]"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sair da conta</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-2 flex flex-col gap-2 border-t border-rental-border pt-3">
                <Link
                  href="/entrar?mode=signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-xl border border-rental-border bg-rental-surface2 py-2.5 text-center text-xs font-bold text-rental-ink"
                >
                  Entrar
                </Link>
                <Link
                  href="/entrar?mode=signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full rounded-xl bg-rental-primary py-2.5 text-center text-xs font-bold text-[var(--rs-primary-text)] shadow-primary"
                >
                  Cadastre-se
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
