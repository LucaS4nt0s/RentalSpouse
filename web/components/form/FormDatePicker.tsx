'use client';

import React, { forwardRef, useRef } from 'react';
import { MaskedInput } from '../ui/MaskedInput';
import { formatDateToISO, formatISODateToBR } from '../../utils/formatters';

export interface FormDatePickerProps {
  id?: string;
  value: string; // no formato DD/MM/AAAA
  onChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const FormDatePicker = forwardRef<HTMLInputElement, FormDatePickerProps>(
  ({ id, value, onChange, hasError, disabled, placeholder = 'DD/MM/AAAA' }, ref) => {
    const hiddenDateInputRef = useRef<HTMLInputElement>(null);

    const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const isoValue = e.target.value; // YYYY-MM-DD
      if (isoValue) {
        const formatted = formatISODateToBR(isoValue);
        onChange(formatted);
      }
    };

    const openCalendarPicker = () => {
      if (disabled) return;
      const el = hiddenDateInputRef.current;
      if (el) {
        if ('showPicker' in el) {
          (el as any).showPicker();
        } else {
          (el as HTMLInputElement).focus();
        }
      }
    };

    const isoValue = formatDateToISO(value);

    const calendarIcon = (
      <button
        type="button"
        onClick={openCalendarPicker}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Abrir seletor de calendário"
        className="p-1 rounded-lg text-[#bab195] hover:text-[#e8d18e] focus:outline-none focus:ring-1 focus:ring-[#e8d18e] transition-colors disabled:opacity-40"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
    );

    return (
      <div className="relative w-full">
        <MaskedInput
          ref={ref}
          id={id}
          maskType="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          hasError={hasError}
          disabled={disabled}
          maxLength={10}
          inputMode="numeric"
          rightIcon={calendarIcon}
        />

        {/* Input invisível type="date" para acionar o picker nativo do browser */}
        <input
          ref={hiddenDateInputRef}
          type="date"
          tabIndex={-1}
          disabled={disabled}
          value={isoValue.length === 10 ? isoValue : ''}
          onChange={handleNativeDateChange}
          className="sr-only"
          aria-hidden="true"
        />
      </div>
    );
  }
);

FormDatePicker.displayName = 'FormDatePicker';
