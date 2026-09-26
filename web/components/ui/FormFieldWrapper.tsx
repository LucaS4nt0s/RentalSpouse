'use client';

import React from 'react';

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
            className="text-xs font-bold uppercase tracking-wider text-[#2f2f4d] dark:text-[#bab195] select-none"
          >
            {label}
            {required && <span className="text-[#EF4444] ml-1 font-bold">*</span>}
          </label>
          {hint && !error && (
            <span className="text-[11px] text-[#626970] dark:text-[#bab195]/70 italic">{hint}</span>
          )}
        </div>
      )}

      {children}

      {error && (
        <div
          id={id ? `${id}-error` : undefined}
          className="flex items-center gap-1.5 mt-0.5 text-xs text-[#EF4444] animate-fadeIn"
          role="alert"
        >
          <svg
            className="w-3.5 h-3.5 shrink-0 text-[#EF4444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="font-medium leading-tight">{error}</span>
        </div>
      )}
    </div>
  );
};
