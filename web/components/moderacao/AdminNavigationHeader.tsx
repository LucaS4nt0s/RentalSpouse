'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Zap, ArrowLeft, LogOut, FileCheck2, UserPlus, Users } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';

interface AdminNavigationHeaderProps {
  currentAdmin?: {
    name?: string;
    email?: string;
  } | null;
  onLogout?: () => void;
}

export const AdminNavigationHeader: React.FC<AdminNavigationHeaderProps> = ({
  currentAdmin,
  onLogout,
}) => {
  const pathname = usePathname();

  const isModeracao = pathname?.startsWith('/admin/moderacao') || pathname === '/admin';
  const isCadastroAdmin = pathname?.startsWith('/cadastro/admin');

  return (
    <header className="border-b border-rental-border bg-rental-surface/80 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
        {/* Marca e Título */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
            title="Voltar à página inicial"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rental-primary text-[var(--rs-primary-text)] shadow-primary">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-extrabold tracking-tight">RentalSpouse</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rental-primary/10 border border-rental-primary/20 px-2 py-0.5 text-[10px] font-bold text-rental-primary">
                  <Shield className="h-2.5 w-2.5" /> Admin
                </span>
              </div>
              <p className="text-[11px] text-rental-muted hidden sm:block">Painel de Gestão e Moderação</p>
            </div>
          </Link>

          {/* Abas / Navegação do Admin */}
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-rental-border">
            <Link
              href="/admin/moderacao"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                isModeracao
                  ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                  : 'text-rental-muted hover:text-rental-ink hover:bg-rental-surface2'
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Moderação de Profissionais
            </Link>

            <Link
              href="/cadastro/admin"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                isCadastroAdmin
                  ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                  : 'text-rental-muted hover:text-rental-ink hover:bg-rental-surface2'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Gestão de Administradores
            </Link>
          </nav>
        </div>

        {/* Lado Direito: Sessão, Ações e Tema */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentAdmin && (
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-rental-surface2 text-xs border border-rental-border">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="max-w-[150px] truncate text-[11px]">
                <span className="font-bold text-rental-ink block truncate">{currentAdmin.name}</span>
              </div>
            </div>
          )}

          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-rental-muted hover:text-rental-primary transition-colors px-2 py-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Site Público
          </Link>

          <ThemeToggle showLabel={false} />

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rental-muted hover:text-[var(--rs-error)] hover:bg-red-500/10 px-2.5 py-1.5 rounded-xl transition-colors"
              title="Encerrar sessão de administrador"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>

      {/* Navegação Mobile (segunda linha) */}
      <div className="flex md:hidden items-center justify-around border-t border-rental-border px-3 py-2 bg-rental-surface2/50 text-xs">
        <Link
          href="/admin/moderacao"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
            isModeracao
              ? 'bg-rental-primary text-[var(--rs-primary-text)]'
              : 'text-rental-muted'
          }`}
        >
          <FileCheck2 className="h-3 w-3" />
          Moderação
        </Link>
        <Link
          href="/cadastro/admin"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
            isCadastroAdmin
              ? 'bg-rental-primary text-[var(--rs-primary-text)]'
              : 'text-rental-muted'
          }`}
        >
          <Users className="h-3 w-3" />
          Admins
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1 px-2.5 py-1 text-rental-muted text-[11px]"
        >
          <ArrowLeft className="h-3 w-3" />
          Site
        </Link>
      </div>
    </header>
  );
};
