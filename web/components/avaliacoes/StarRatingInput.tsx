'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';

export interface StarRatingInputProps {
  /** Nota selecionada atualmente (1 a 5, ou 0 se nenhuma selecionada) */
  value: number;
  /** Callback disparado ao alterar a nota */
  onChange?: (rating: number) => void;
  /** Quantidade máxima de estrelas (padrão 5) */
  maxStars?: number;
  /** Tamanho dos ícones de estrela */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Se o componente está desabilitado */
  disabled?: boolean;
  /** Se o componente é apenas para leitura */
  readOnly?: boolean;
  /** Rótulo acessível do grupo de estrelas */
  label?: string;
  /** Exibe legenda textual com a descrição da nota (ex.: 'Excelente') */
  showHelperText?: boolean;
  /** ID para vínculos de formulário / acessibilidade */
  id?: string;
  /** Classe CSS customizada para o container */
  className?: string;
}

export const LABELS_NOTAS: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
};

const SIZE_MAP = {
  sm: { icon: 'h-4 w-4', gap: 'gap-1', text: 'text-xs' },
  md: { icon: 'h-6 w-6', gap: 'gap-1.5', text: 'text-sm' },
  lg: { icon: 'h-8 w-8', gap: 'gap-2', text: 'text-base' },
  xl: { icon: 'h-10 w-10', gap: 'gap-2.5', text: 'text-lg' },
};

/**
 * Componente interativo e acessível de seleção de nota por estrelas (1 a 5)
 * em conformidade com as diretrizes do AI_RULES.md e issue #19.
 */
export const StarRatingInput: React.FC<StarRatingInputProps> = ({
  value,
  onChange,
  maxStars = 5,
  size = 'md',
  disabled = false,
  readOnly = false,
  label = 'Avaliação de 1 a 5 estrelas',
  showHelperText = true,
  id,
  className = '',
}) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const activeRating = hoverRating !== null ? hoverRating : value;
  const isInteractive = !disabled && !readOnly && Boolean(onChange);
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;

  const handleSelect = (starValue: number) => {
    if (!isInteractive || !onChange) return;
    onChange(starValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent, starValue: number) => {
    if (!isInteractive || !onChange) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(starValue);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(starValue + 1, maxStars);
      handleSelect(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(starValue - 1, 1);
      handleSelect(prev);
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleSelect(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      handleSelect(maxStars);
    } else if (e.key >= '1' && e.key <= String(maxStars)) {
      e.preventDefault();
      handleSelect(Number(e.key));
    }
  };

  const starsArray = Array.from({ length: maxStars }, (_, i) => i + 1);
  const currentLabel = activeRating > 0 ? LABELS_NOTAS[activeRating] : null;

  return (
    <div
      id={id}
      className={`inline-flex flex-col items-center gap-1.5 ${className}`}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      aria-readonly={readOnly}
    >
      <div
        className={`flex items-center ${sizeClasses.gap}`}
        onMouseLeave={() => isInteractive && setHoverRating(null)}
      >
        {starsArray.map((star) => {
          const isFilled = star <= activeRating;
          const isSelected = star === value;

          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}: ${LABELS_NOTAS[star] || ''}`}
              tabIndex={
                !isInteractive ? -1 : isSelected || (value === 0 && star === 1) ? 0 : -1
              }
              disabled={disabled || readOnly}
              onClick={() => handleSelect(star)}
              onMouseEnter={() => isInteractive && setHoverRating(star)}
              onKeyDown={(e) => handleKeyDown(e, star)}
              className={`relative rounded-md p-0.5 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                isInteractive
                  ? 'cursor-pointer hover:scale-115 active:scale-95'
                  : 'cursor-default'
              }`}
            >
              <Star
                className={`${sizeClasses.icon} transition-colors duration-150 ${
                  isFilled
                    ? 'fill-amber-400 text-amber-400 drop-shadow-[0_1px_2px_rgba(245,158,11,0.3)]'
                    : 'fill-transparent text-gray-300 dark:text-gray-600 hover:text-amber-200'
                }`}
              />
            </button>
          );
        })}
      </div>

      {showHelperText && (
        <span
          className={`font-semibold tracking-tight transition-opacity duration-150 min-h-[1.25rem] ${sizeClasses.text} ${
            currentLabel
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-rental-muted opacity-60'
          }`}
          aria-live="polite"
        >
          {currentLabel || 'Selecione uma nota'}
        </span>
      )}
    </div>
  );
};
