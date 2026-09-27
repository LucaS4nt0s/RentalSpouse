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
    let stateClasses = '';
    if (hasError) {
      stateClasses = 'glass-input-error';
    } else if (hasSuccess) {
      stateClasses = 'glass-input-success';
    }

    return (
      <div className={`relative flex items-center w-full ${containerClassName}`}>
        {leftIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-rental-muted">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : 'false'}
          className={`glass-input w-full rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
            leftIcon ? 'pl-11' : ''
          } ${rightIcon ? 'pr-11' : ''} ${stateClasses} ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3.5 flex items-center text-rental-muted">{rightIcon}</div>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';
