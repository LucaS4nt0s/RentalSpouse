'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = 260;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative w-full group">
      {/* Botão e fade para a esquerda */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-2.5 z-10 hidden sm:flex items-center pr-4 bg-gradient-to-r from-[var(--rs-bg)] via-[var(--rs-bg)]/80 to-transparent">
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rental-border/80 bg-rental-surface/90 text-rental-ink shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:border-rental-primary hover:text-rental-primary hover:shadow-primary active:scale-95"
            aria-label="Rolar categorias para a esquerda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Container de rolagem com scrollbar futurista com degradê */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="flex items-center gap-2.5 overflow-x-auto pb-2.5 pt-1.5 px-0.5 futuristic-scrollbar scroll-smooth"
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

      {/* Botão e fade para a direita */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-2.5 z-10 hidden sm:flex items-center pl-4 bg-gradient-to-l from-[var(--rs-bg)] via-[var(--rs-bg)]/80 to-transparent">
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rental-border/80 bg-rental-surface/90 text-rental-ink shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:border-rental-primary hover:text-rental-primary hover:shadow-primary active:scale-95"
            aria-label="Rolar categorias para a direita"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
