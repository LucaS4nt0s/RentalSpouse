import React, { forwardRef } from 'react';
import { MaskedInput } from './MaskedInput';

export const PhoneInput = forwardRef(({ placeholder = '(11) 98765-4321', ...props }, ref) => (
  <MaskedInput
    ref={ref}
    maskType="phone"
    placeholder={placeholder}
    keyboardType="phone-pad"
    maxLength={15}
    {...props}
  />
));

PhoneInput.displayName = 'PhoneInput';
