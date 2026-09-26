'use client';

import React, { forwardRef } from 'react';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  hasSuccess?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      hasError = false,
      hasSuccess = false,
      leftIcon,
      rightIcon,
      className = '',
      containerClassName = '',
      disabled,
      ...props
    },
    ref
  ) => {
    let stateClasses = 'border-[#626970]/40 focus:border-[#e8d18e] focus:ring-[#e8d18e]/30';

    if (hasError) {
      stateClasses = 'glass-input-error !border-[#EF4444] focus:!border-[#EF4444] focus:!ring-[#EF4444]/40';
    } else if (hasSuccess) {
      stateClasses = 'glass-input-success !border-[#10B981] focus:!border-[#10B981] focus:!ring-[#10B981]/40';
    }

    return (
      <div className={`relative flex items-center w-full ${containerClassName}`}>
        {leftIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-[#bab195]/80">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : 'false'}
          className={`glass-input w-full rounded-xl px-4 py-3 text-sm font-medium tracking-wide placeholder-[#626970] disabled:opacity-40 disabled:cursor-not-allowed ${
            leftIcon ? 'pl-11' : ''
          } ${rightIcon ? 'pr-11' : ''} ${stateClasses} ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3.5 flex items-center text-[#bab195]">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';
