'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface CategoryChipProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  count?: number;
}

export const CategoryChip: React.FC<CategoryChipProps> = ({
  label,
  isActive,
  onClick,
  icon: Icon,
  count,
}) => {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs md:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rental-primary/40 ${
        isActive
          ? 'bg-rental-primary text-white border border-rental-primary shadow-primary font-semibold'
          : 'bg-rental-surface2 text-rental-muted border border-rental-border hover:border-rental-primary hover:text-rental-ink'
      }`}
    >
      {Icon && (
        <Icon
          className={`h-4 w-4 transition-colors ${
            isActive ? 'text-white' : 'text-rental-primary'
          }`}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            isActive
              ? 'bg-white/20 text-white'
              : 'bg-rental-border text-rental-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
