'use client';

import React from 'react';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { TextInput } from '../ui/TextInput';
import { MaskedInput } from '../ui/MaskedInput';
import { FormDatePicker } from '../form/FormDatePicker';

export interface PersonalInfoData {
  nomeCompleto: string;
  email: string;
  cpf: string;
  dataNascimento: string;
}

export interface PersonalInfoErrors {
  nomeCompleto?: string;
  email?: string;
  cpf?: string;
  dataNascimento?: string;
}

export interface PersonalInfoSectionProps {
  data: PersonalInfoData;
  errors: PersonalInfoErrors;
  onChange: (field: keyof PersonalInfoData, value: string) => void;
  onBlur?: (field: keyof PersonalInfoData) => void;
  disabled?: boolean;
}

export const PersonalInfoSection: React.FC<PersonalInfoSectionProps> = ({
  data,
  errors,
  onChange,
  onBlur,
  disabled = false,
}) => {
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#11091a] dark:text-[#F3F4F6] tracking-tight">
            1. Dados Pessoais
          </h2>
          <p className="text-xs text-[#626970] dark:text-[#bab195]/80">
            Identificação segura para emissão de orçamentos e chamados
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {/* Nome Completo */}
        <div className="md:col-span-2">
          <FormFieldWrapper
            id="nomeCompleto"
            label="Nome Completo"
            required
            hint="Nome e sobrenome"
            error={errors.nomeCompleto}
          >
            <TextInput
              id="nomeCompleto"
              name="nomeCompleto"
              autoComplete="name"
              placeholder="Ex: Carlos Eduardo dos Santos"
              value={data.nomeCompleto}
              onChange={(e) => onChange('nomeCompleto', e.target.value)}
              onBlur={() => onBlur?.('nomeCompleto')}
              hasError={Boolean(errors.nomeCompleto)}
              disabled={disabled}
              maxLength={120}
            />
          </FormFieldWrapper>
        </div>

        {/* E-mail */}
        <div className="md:col-span-2">
          <FormFieldWrapper
            id="email"
            label="E-mail de Contato"
            required
            hint="Receberá avisos e notas de serviços"
            error={errors.email}
          >
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="exemplo@dominio.com.br"
              value={data.email}
              onChange={(e) => onChange('email', e.target.value.toLowerCase())}
              onBlur={() => onBlur?.('email')}
              hasError={Boolean(errors.email)}
              disabled={disabled}
              leftIcon={
                <svg
                  className="w-4 h-4 text-[#bab195]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              }
            />
          </FormFieldWrapper>
        </div>

        {/* CPF */}
        <div>
          <FormFieldWrapper
            id="cpf"
            label="CPF"
            required
            hint="Apenas números ou formatado"
            error={errors.cpf}
          >
            <MaskedInput
              id="cpf"
              name="cpf"
              maskType="cpf"
              placeholder="000.000.000-00"
              value={data.cpf}
              onChange={(e) => onChange('cpf', e.target.value)}
              onBlur={() => onBlur?.('cpf')}
              hasError={Boolean(errors.cpf)}
              disabled={disabled}
              inputMode="numeric"
              maxLength={14}
            />
          </FormFieldWrapper>
        </div>

        {/* Data de Nascimento */}
        <div>
          <FormFieldWrapper
            id="dataNascimento"
            label="Data de Nascimento"
            required
            hint="Maioridade obrigatória (18+)"
            error={errors.dataNascimento}
          >
            <FormDatePicker
              id="dataNascimento"
              value={data.dataNascimento}
              onChange={(val) => onChange('dataNascimento', val)}
              hasError={Boolean(errors.dataNascimento)}
              disabled={disabled}
            />
          </FormFieldWrapper>
        </div>
      </div>
    </div>
  );
};
