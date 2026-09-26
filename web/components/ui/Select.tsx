'use client';

import React, { forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[] | readonly string[];
  placeholder?: string;
  hasError?: boolean;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      options,
      placeholder = 'Selecione...',
      hasError = false,
      containerClassName = '',
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    let stateClasses = 'border-[#626970]/40 focus:border-[#e8d18e] focus:ring-[#e8d18e]/30';
    if (hasError) {
      stateClasses = 'glass-input-error !border-[#EF4444] focus:!border-[#EF4444] focus:!ring-[#EF4444]/40';
    }

    return (
      <div className={`relative flex items-center w-full ${containerClassName}`}>
        <select
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : 'false'}
          className={`glass-input w-full appearance-none rounded-xl px-4 py-3 text-sm font-medium tracking-wide placeholder-[#626970] disabled:opacity-40 disabled:cursor-not-allowed pr-10 cursor-pointer ${stateClasses} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled className="bg-[#11091a] text-[#626970]">
              {placeholder}
            </option>
          )}
          {options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            return (
              <option key={val} value={val} className="bg-[#11091a] text-[#F3F4F6]">
                {lbl}
              </option>
            );
          })}
        </select>

        {/* Seta Chevron customizada */}
        <div className="absolute right-3.5 flex items-center pointer-events-none text-[#bab195]">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
