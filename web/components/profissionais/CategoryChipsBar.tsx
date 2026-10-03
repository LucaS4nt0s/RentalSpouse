'use client';

import React from 'react';
import {
  LayoutGrid,
  Zap,
  Droplets,
  Paintbrush,
  Hammer,
  Sparkles,
  Flower2,
  Wind,
  Wrench,
  LucideIcon,
} from 'lucide-react';
import { CategoryChip } from './CategoryChip';

export interface CategoryItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const CATEGORIES: CategoryItem[] = [
  { id: 'Todas', label: 'Todas', icon: LayoutGrid },
  { id: 'Elétrica', label: 'Elétrica', icon: Zap },
  { id: 'Hidráulica', label: 'Hidráulica', icon: Droplets },
  { id: 'Pintura', label: 'Pintura', icon: Paintbrush },
  { id: 'Montagem de Móveis', label: 'Montagem de Móveis', icon: Hammer },
  { id: 'Marcenaria', label: 'Marcenaria', icon: Hammer },
  { id: 'Limpeza', label: 'Limpeza', icon: Sparkles },
  { id: 'Jardinagem', label: 'Jardinagem', icon: Flower2 },
  { id: 'Ar-condicionado', label: 'Ar-condicionado', icon: Wind },
  { id: 'Reparos Gerais', label: 'Reparos Gerais', icon: Wrench },
];

export interface CategoryChipsBarProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryChipsBar: React.FC<CategoryChipsBarProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div className="w-full">
      <div
        className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth"
        role="toolbar"
        aria-label="Categorias de serviços"
      >
        {CATEGORIES.map((cat) => {
          const isActive =
            (!activeCategory && cat.id === 'Todas') ||
            activeCategory.toLowerCase() === cat.id.toLowerCase();

          return (
            <CategoryChip
              key={cat.id}
              label={cat.label}
              icon={cat.icon}
              isActive={isActive}
              onClick={() => onSelectCategory(cat.id)}
            />
          );
        })}
      </div>
    </div>
  );
};
