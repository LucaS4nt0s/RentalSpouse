'use client';

import React, { forwardRef } from 'react';
import { MAX_BIO_LENGTH } from '../../utils/validators';

export interface BioTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const BioTextarea = forwardRef<HTMLTextAreaElement, BioTextareaProps>(
  ({ hasError = false, className = '', value, disabled, ...props }, ref) => {
    const length = typeof value === 'string' ? value.length : 0;

    return (
      <div className="relative w-full">
        <textarea
          ref={ref}
          rows={4}
          maxLength={MAX_BIO_LENGTH}
          value={value}
          disabled={disabled}
          aria-invalid={hasError ? 'true' : 'false'}
          className={`glass-input w-full rounded-xl px-4 py-3 text-sm font-medium tracking-wide placeholder-[#626970] resize-y disabled:opacity-40 disabled:cursor-not-allowed ${
            hasError ? 'glass-input-error' : ''
          } ${className}`}
          {...props}
        />
        <span className="absolute bottom-2 right-3 text-[10px] font-semibold text-[#626970] pointer-events-none">
          {length}/{MAX_BIO_LENGTH}
        </span>
      </div>
    );
  }
);

BioTextarea.displayName = 'BioTextarea';
