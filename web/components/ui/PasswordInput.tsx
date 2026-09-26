'use client';

import React, { useState, forwardRef } from 'react';
import { TextInput, TextInputProps } from './TextInput';

export interface PasswordInputProps extends Omit<TextInputProps, 'type' | 'rightIcon'> {
  showStrengthIndicator?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ id, hasError, hasSuccess, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState<boolean>(false);

    const toggleVisibility = () => {
      setShowPassword((prev) => !prev);
    };

    const eyeButton = (
      <button
        type="button"
        onClick={toggleVisibility}
        tabIndex={-1}
        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        className="p-1 rounded-lg text-[#bab195] hover:text-[#e8d18e] focus:outline-none focus:ring-1 focus:ring-[#e8d18e] transition-colors"
      >
        {showPassword ? (
          // Ícone Olho Riscado (Eye Off)
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
            />
          </svg>
        ) : (
          // Ícone Olho Normal (Eye)
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    );

    return (
      <TextInput
        ref={ref}
        id={id}
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        hasError={hasError}
        hasSuccess={hasSuccess}
        rightIcon={eyeButton}
        {...props}
      />
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
