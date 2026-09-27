import React, { forwardRef } from 'react';
import { TextInput } from './TextInput';
import { maskCPF, maskCEP, maskDate, cleanDigits } from '../../utils/formatters';

export const MaskedInput = forwardRef(
  ({ maskType, onChangeText, value, ...props }, ref) => {
    const applyMask = (val = '') => {
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

    const handleChangeText = (text) => {
      const masked = applyMask(text);
      if (onChangeText) {
        onChangeText(masked, cleanDigits(text));
      }
    };

    return (
      <TextInput
        ref={ref}
        value={applyMask(value)}
        onChangeText={handleChangeText}
        {...props}
      />
    );
  }
);

MaskedInput.displayName = 'MaskedInput';
