'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormFieldWrapperProps {
  id?: string;
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export const FormFieldWrapper: React.FC<FormFieldWrapperProps> = ({
  id,
  label,
  required,
  hint,
  error,
  className = '',
  children,
}) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={id}
            className="text-xs font-bold uppercase tracking-wide text-rental-muted select-none"
          >
            {label}
            {required && <span className="text-[var(--rs-error)] ml-1 font-bold">*</span>}
          </label>
          {hint && !error && (
            <span className="text-[11px] text-rental-muted/80 italic">{hint}</span>
          )}
        </div>
      )}

      {children}

      {error && (
        <div
          id={id ? `${id}-error` : undefined}
          className="flex items-center gap-1.5 mt-0.5 text-xs text-[var(--rs-error)] animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium leading-tight">{error}</span>
        </div>
      )}
    </div>
  );
};
