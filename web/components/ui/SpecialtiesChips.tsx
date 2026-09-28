'use client';

import React from 'react';
import { SPECIALTIES } from '../../utils/validators';

export interface SpecialtiesChipsProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  hasError?: boolean;
  disabled?: boolean;
}

export const SpecialtiesChips: React.FC<SpecialtiesChipsProps> = ({
  id,
  value,
  onChange,
  hasError = false,
  disabled = false,
}) => {
  const toggle = (specialty: string) => {
    if (disabled) return;
    if (value.includes(specialty)) {
      onChange(value.filter((item) => item !== specialty));
    } else {
      onChange([...value, specialty]);
    }
  };

  return (
    <div
      id={id}
      role="group"
      aria-label="Especialidades"
      aria-invalid={hasError ? 'true' : 'false'}
      className="flex flex-wrap gap-2"
    >
      {SPECIALTIES.map((specialty) => {
        const active = value.includes(specialty);
        return (
          <button
            key={specialty}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(specialty)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              active
                ? 'bg-[#e8d18e] text-[#11091a] border-[#e8d18e] shadow-gold-glow'
                : hasError
                ? 'bg-transparent text-[#626970] dark:text-[#bab195] border-[#EF4444]/50 hover:border-[#e8d18e]'
                : 'bg-transparent text-[#626970] dark:text-[#bab195] border-slate-300 dark:border-white/15 hover:border-[#e8d18e] hover:text-[#11091a] dark:hover:text-[#e8d18e]'
            }`}
          >
            {specialty}
          </button>
        );
      })}
    </div>
  );
};
