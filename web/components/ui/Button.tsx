'use client';

import React from 'react';

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
    'relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#11091a] disabled:cursor-not-allowed select-none';

  const sizeClasses = {
    sm: 'text-xs px-3.5 py-2 gap-1.5',
    md: 'text-sm px-5 py-2.5 gap-2',
    lg: 'text-base px-6 py-3.5 gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[#e8d18e] text-[#11091a] font-bold shadow-lg shadow-[#e8d18e]/20 hover:bg-[#dfc476] hover:shadow-[#e8d18e]/30 active:scale-[0.98] focus:ring-[#e8d18e] disabled:opacity-50 disabled:hover:bg-[#e8d18e]',
    glass:
      'backdrop-blur-md bg-white/[0.08] hover:bg-white/[0.14] text-[#F3F4F6] border border-white/10 hover:border-white/20 shadow-glass active:scale-[0.98] focus:ring-white/40 disabled:opacity-40',
    secondary:
      'bg-[#bab195] text-[#11091a] font-semibold hover:bg-[#a89e80] shadow-md shadow-[#bab195]/20 active:scale-[0.98] focus:ring-[#bab195] disabled:opacity-50',
    outline:
      'backdrop-blur-sm bg-transparent border border-[#e8d18e]/60 text-[#e8d18e] hover:bg-[#e8d18e]/10 active:scale-[0.98] focus:ring-[#e8d18e] disabled:opacity-40',
    danger:
      'bg-[#EF4444] text-white font-semibold hover:bg-[#dc2626] shadow-lg shadow-red-500/20 active:scale-[0.98] focus:ring-red-500 disabled:opacity-50',
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
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
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
