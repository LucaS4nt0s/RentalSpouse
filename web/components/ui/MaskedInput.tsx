'use client';

import React, { forwardRef } from 'react';
import { TextInput, TextInputProps } from './TextInput';
import { maskCPF, maskCEP, maskDate } from '../../utils/formatters';

export type MaskType = 'cpf' | 'cep' | 'date';

export interface MaskedInputProps extends Omit<TextInputProps, 'onChange'> {
  maskType: MaskType;
  onChangeValue?: (masked: string, raw: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ maskType, onChangeValue, onChange, value, ...props }, ref) => {
    const applyMask = (val: string): string => {
      switch (maskType) {
        case 'cpf':
          return maskCPF(val);
        case 'cep':
          return maskCEP(val);
        case 'date':
          return maskDate(val);
        default:
          return val;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawInput = e.target.value;
      const formatted = applyMask(rawInput);
      e.target.value = formatted;

      if (onChange) {
        onChange(e);
      }

      if (onChangeValue) {
        const rawClean = rawInput.replace(/\D/g, '');
        onChangeValue(formatted, rawClean);
      }
    };

    const formattedValue = typeof value === 'string' ? applyMask(value) : value;

    return (
      <TextInput
        ref={ref}
        value={formattedValue}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

MaskedInput.displayName = 'MaskedInput';
