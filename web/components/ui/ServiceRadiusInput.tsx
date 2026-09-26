'use client';

import React from 'react';
import { MIN_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM } from '../../utils/validators';

export interface ServiceRadiusInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  hasError?: boolean;
  disabled?: boolean;
}

export const ServiceRadiusInput: React.FC<ServiceRadiusInputProps> = ({
  id,
  value,
  onChange,
  hasError = false,
  disabled = false,
}) => {
  const handleNumberChange = (raw: string) => {
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = parseInt(raw, 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  };

  return (
    <div className="flex items-center gap-4 w-full">
      <input
        id={id ? `${id}-range` : undefined}
        type="range"
        min={MIN_SERVICE_RADIUS_KM}
        max={MAX_SERVICE_RADIUS_KM}
        step={1}
        value={value || MIN_SERVICE_RADIUS_KM}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Raio de atendimento em quilômetros"
        className="flex-1 h-1.5 accent-[#e8d18e] cursor-pointer disabled:opacity-40"
      />

      <div className="flex items-center gap-2 shrink-0">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_SERVICE_RADIUS_KM}
          max={MAX_SERVICE_RADIUS_KM}
          value={value === 0 ? '' : value}
          disabled={disabled}
          onChange={(e) => handleNumberChange(e.target.value)}
          aria-invalid={hasError ? 'true' : 'false'}
          className={`glass-input w-20 rounded-xl px-3 py-2 text-sm text-center font-semibold ${
            hasError ? 'glass-input-error' : ''
          }`}
        />
        <span className="text-xs font-semibold text-[#626970] dark:text-[#bab195]">km</span>
      </div>
    </div>
  );
};
