'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses =
    'relative inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rs-ring)] disabled:cursor-not-allowed select-none';

  const sizeClasses = {
    sm: 'text-xs px-3.5 py-2 gap-1.5',
    md: 'text-sm px-5 py-2.5 gap-2',
    lg: 'text-base px-6 py-3.5 gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[var(--rs-primary)] text-[var(--rs-primary-text)] shadow-primary hover:bg-[var(--rs-primary-hover)] active:scale-[0.98] disabled:opacity-50',
    secondary:
      'bg-rental-surface2 text-rental-ink border border-rental-border hover:border-[var(--rs-border-strong)] active:scale-[0.98] disabled:opacity-50',
    glass:
      'bg-rental-surface2 text-rental-ink border border-rental-border hover:border-[var(--rs-border-strong)] active:scale-[0.98] disabled:opacity-50',
    outline:
      'bg-transparent border border-rental-primary text-rental-primary hover:bg-[var(--rs-primary)]/10 active:scale-[0.98] disabled:opacity-40',
    danger:
      'bg-[var(--rs-error)] text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50',
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingText || children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
