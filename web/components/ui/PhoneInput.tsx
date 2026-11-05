'use client';

import React, { forwardRef } from 'react';
import { MaskedInput, MaskedInputProps } from './MaskedInput';

export type PhoneInputProps = Omit<MaskedInputProps, 'maskType'>;

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ placeholder = '(11) 98765-4321', ...props }, ref) => (
    <MaskedInput
      ref={ref}
      maskType="phone"
      placeholder={placeholder}
      inputMode="tel"
      autoComplete="tel"
      maxLength={15}
      {...props}
    />
  )
);

PhoneInput.displayName = 'PhoneInput';
