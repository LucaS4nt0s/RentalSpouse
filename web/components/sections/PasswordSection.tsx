'use client';

import React from 'react';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';
import { usePasswordStrength } from '../../hooks/usePasswordStrength';

export interface PasswordData {
  senha: string;
  confirmacaoSenha: string;
}

export interface PasswordErrors {
  senha?: string;
  confirmacaoSenha?: string;
}

export interface PasswordSectionProps {
  data: PasswordData;
  errors: PasswordErrors;
  onChange: (field: keyof PasswordData, value: string) => void;
  onBlur?: (field: keyof PasswordData) => void;
  disabled?: boolean;
}

export const PasswordSection: React.FC<PasswordSectionProps> = ({
  data,
  errors,
  onChange,
  onBlur,
  disabled = false,
}) => {
  // Avaliação reativa instantânea dos 5 critérios (<10ms)
  const passwordEvaluation = usePasswordStrength(data.senha);

  // Verificação de coincidência em tempo real
  const hasConfirmationText = Boolean(data.confirmacaoSenha);
  const passwordsMatch =
    hasConfirmationText && data.senha === data.confirmacaoSenha;
  const passwordsMismatch =
    hasConfirmationText && data.senha !== data.confirmacaoSenha;

  const confirmationError =
    errors.confirmacaoSenha || (passwordsMismatch ? 'As senhas não coincidem.' : undefined);

  return (
    <div className="glass-card-subtle p-5 sm:p-6 rounded-2xl flex flex-col gap-5 border border-slate-200/60 dark:border-white/5 transition-colors">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="w-8 h-8 rounded-xl bg-[#e8d18e]/25 dark:bg-[#e8d18e]/10 border border-[#e8d18e]/40 dark:border-[#e8d18e]/30 flex items-center justify-center text-[#6e581c] dark:text-[#e8d18e]">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#11091a] dark:text-[#F3F4F6] tracking-tight">
            3. Segurança & Senha de Acesso
          </h2>
          <p className="text-xs text-[#626970] dark:text-[#bab195]/80">
            Crie uma credencial forte e exclusiva para proteger sua conta
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Campo Senha */}
        <div>
          <FormFieldWrapper
            id="senha"
            label="Senha Forte"
            required
            hint="Mínimo 8 caracteres e critérios"
            error={errors.senha}
          >
            <PasswordInput
              id="senha"
              name="senha"
              placeholder="Digite sua senha segura"
              value={data.senha}
              onChange={(e) => onChange('senha', e.target.value)}
              onBlur={() => onBlur?.('senha')}
              hasError={Boolean(errors.senha)}
              hasSuccess={passwordEvaluation.isValid}
              disabled={disabled}
              aria-describedby="password-rules-id"
            />
          </FormFieldWrapper>

          {/* Medidor Reativo de Força e Checklist dos 5 Critérios */}
          <PasswordStrengthMeter evaluation={passwordEvaluation} />
        </div>

        {/* Campo Confirmação de Senha */}
        <div>
          <FormFieldWrapper
            id="confirmacaoSenha"
            label="Confirmar Senha"
            required
            hint="Repita a senha idêntica"
            error={confirmationError}
          >
            <div className="relative">
              <PasswordInput
                id="confirmacaoSenha"
                name="confirmacaoSenha"
                placeholder="Repita a senha digitada acima"
                value={data.confirmacaoSenha}
                onChange={(e) => onChange('confirmacaoSenha', e.target.value)}
                onBlur={() => onBlur?.('confirmacaoSenha')}
                hasError={Boolean(confirmationError)}
                hasSuccess={passwordsMatch && passwordEvaluation.isValid}
                disabled={disabled}
              />

              {/* Indicador visual de senhas idênticas */}
              {passwordsMatch && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-400 text-xs font-semibold pointer-events-none">
                  <svg
                    className="w-4 h-4 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="hidden sm:inline">Coincidem</span>
                </div>
              )}
            </div>
          </FormFieldWrapper>
        </div>
      </div>
    </div>
  );
};
