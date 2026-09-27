'use client';

import React from 'react';
import { PasswordStrengthResult } from '../../utils/validators';

export interface PasswordStrengthMeterProps {
  evaluation: PasswordStrengthResult;
  showChecklist?: boolean;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  evaluation,
  showChecklist = true,
}) => {
  const { score, criteria, label, color, isValid } = evaluation;

  // Segmentos ativos: 1/3 para fraca (1-2), 2/3 para moderada (3-4), 3/3 para forte (5)
  let activeSegments = 0;
  if (score >= 5) {
    activeSegments = 3;
  } else if (score >= 3) {
    activeSegments = 2;
  } else if (score >= 1) {
    activeSegments = 1;
  }

  const checklistItems = [
    {
      id: 'min-length',
      label: 'Mínimo de 8 caracteres',
      satisfied: criteria.hasMinLength,
    },
    {
      id: 'uppercase',
      label: 'Pelo menos 1 letra maiúscula (A-Z)',
      satisfied: criteria.hasUppercase,
    },
    {
      id: 'lowercase',
      label: 'Pelo menos 1 letra minúscula (a-z)',
      satisfied: criteria.hasLowercase,
    },
    {
      id: 'number',
      label: 'Pelo menos 1 número (0-9)',
      satisfied: criteria.hasNumber,
    },
    {
      id: 'special-char',
      label: 'Pelo menos 1 caractere especial (!@#$...)',
      satisfied: criteria.hasSpecialChar,
    },
  ];

  return (
    <div
      id="password-rules-id"
      className="glass-card-subtle p-3.5 sm:p-4 rounded-2xl flex flex-col gap-3 mt-2 border border-slate-200/60 dark:border-white/5 transition-all duration-300"
    >
      {/* Barra de Força Segmentada em 3 níveis */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#2f2f4d] dark:text-[#bab195] font-semibold">Força da senha:</span>
          <span
            className="font-bold tracking-wide transition-colors duration-300"
            style={{ color: score === 0 ? '#626970' : color }}
          >
            {score === 0 ? 'Insira sua senha' : label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full bg-slate-200/60 dark:bg-white/[0.04] p-0.5 rounded-full overflow-hidden">
          {[1, 2, 3].map((segmentIndex) => {
            const isFilled = segmentIndex <= activeSegments;
            return (
              <div
                key={segmentIndex}
                className="h-full rounded-full transition-all duration-300"
                style={{
                  backgroundColor: isFilled ? color : 'rgba(98, 105, 112, 0.25)',
                  boxShadow: isFilled ? `0 0 8px ${color}80` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Checklist Interativo dos 5 Critérios */}
      {showChecklist && (
        <div className="flex flex-col gap-2 pt-1 border-t border-slate-200 dark:border-white/[0.06]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#2f2f4d] dark:text-[#626970]">
            Requisitos de Segurança Obrigatórios
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {checklistItems.map((item) => {
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 p-1.5 rounded-lg transition-all duration-200 ${
                    item.satisfied
                      ? 'bg-emerald-500/10 dark:bg-emerald-950/20 text-[#11091a] dark:text-[#F3F4F6]'
                      : 'text-[#626970]'
                  }`}
                >
                  {item.satisfied ? (
                    // Checkmark Atendido
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500 dark:border-emerald-400 flex items-center justify-center shrink-0">
                      <svg
                        className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-scaleCheck"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    // Círculo Oco Pendente
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-[#626970]/50 flex items-center justify-center shrink-0" />
                  )}
                  <span
                    className={`text-[12px] leading-tight ${
                      item.satisfied
                        ? 'font-medium text-[#11091a] dark:text-[#F3F4F6]'
                        : 'text-[#626970]'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
