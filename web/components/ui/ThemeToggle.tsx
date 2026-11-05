'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = true }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className={`inline-flex items-center gap-2 rounded-full border border-rental-border bg-rental-surface px-3 py-1.5 text-xs font-semibold text-rental-muted transition-colors hover:border-[var(--rs-border-strong)] hover:text-rental-ink active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rs-ring)] ${className}`}
    >
      {isDark ? <Sun className="w-4 h-4 text-rental-primary" /> : <Moon className="w-4 h-4 text-rental-primary" />}
      {showLabel && <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>}
    </button>
  );
};
