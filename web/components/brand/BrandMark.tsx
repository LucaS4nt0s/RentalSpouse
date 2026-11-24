import React from 'react';

/**
 * Símbolo "Esquadro-Casa" (Joiner's Roof) — marca do RentalSpouse (#114 · Ideia 1.1).
 *
 * Cumeeira em 45° exatos cujo recorte interno desenha o mordente de uma chave
 * fixa / encaixe arquitetônico. O corpo usa `currentColor` (herda a cor do texto:
 * escura no tema claro, clara no escuro) e o bloco interno usa a cor primária
 * da plataforma (`--rs-primary`).
 *
 * Desenhado numa grade de 24×24 para leitura nítida desde 16×16px (favicon).
 * Versões estáticas: `public/logo-mark.svg`, `public/logo-full.svg`, `public/favicon.svg`.
 */
export interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

export const BRAND_MARK_PATH =
  'M12 1.5 22.5 12v10.5h-21V12L12 1.5Zm-3 21V15l3-3 3 3v7.5H9Z';

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 24, className = '', title }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    focusable="false"
  >
    <path fill="currentColor" fillRule="evenodd" d={BRAND_MARK_PATH} />
    <rect x="12.75" y="19.5" width="2.25" height="3" fill="var(--rs-primary)" />
  </svg>
);

export interface BrandLogoProps {
  size?: number;
  className?: string;
  /** Exibe o wordmark "RentalSpouse" ao lado do símbolo. */
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

/** Símbolo + wordmark com tracking justo, alinhados na linha de base. */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 24,
  className = '',
  withWordmark = true,
  wordmarkClassName = 'text-lg',
}) => (
  <span className={`inline-flex items-center gap-2 text-rental-ink ${className}`}>
    <BrandMark size={size} title={withWordmark ? undefined : 'RentalSpouse'} />
    {withWordmark && (
      <span className={`font-extrabold tracking-tight leading-none ${wordmarkClassName}`}>
        RentalSpouse
      </span>
    )}
  </span>
);
