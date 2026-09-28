'use client';

import React from 'react';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { PhoneInput } from '../ui/PhoneInput';
import { SpecialtiesChips } from '../ui/SpecialtiesChips';
import { ServiceRadiusInput } from '../ui/ServiceRadiusInput';
import { BioTextarea } from '../ui/BioTextarea';
import { MIN_BIO_LENGTH, MAX_BIO_LENGTH } from '../../utils/validators';

export interface ProviderSkillsData {
  telefone: string;
  especialidades: string[];
  raioAtendimento: number;
  bio: string;
}

export interface ProviderSkillsErrors {
  telefone?: string;
  especialidades?: string;
  raioAtendimento?: string;
  bio?: string;
}

export interface ProviderSkillsSectionProps {
  data: ProviderSkillsData;
  errors: ProviderSkillsErrors;
  onChange: (field: keyof ProviderSkillsData, value: string | string[] | number) => void;
  onBlur?: (field: keyof ProviderSkillsData) => void;
  disabled?: boolean;
}

export const ProviderSkillsSection: React.FC<ProviderSkillsSectionProps> = ({
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.35-4.35M8 11h6M11 8v6"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#11091a] dark:text-[#F3F4F6] tracking-tight">
            4. Perfil Profissional
          </h2>
          <p className="text-xs text-[#626970] dark:text-[#bab195]/80">
            Especialidades, área de atendimento e apresentação
          </p>
        </div>
      </div>

      {/* Telefone */}
      <FormFieldWrapper
        id="telefone"
        label="Telefone / WhatsApp"
        required
        hint="Com DDD"
        error={errors.telefone}
      >
        <PhoneInput
          id="telefone"
          name="telefone"
          value={data.telefone}
          onChange={(e) => onChange('telefone', e.target.value)}
          onBlur={() => onBlur?.('telefone')}
          hasError={Boolean(errors.telefone)}
          disabled={disabled}
        />
      </FormFieldWrapper>

      {/* Especialidades */}
      <FormFieldWrapper
        id="especialidades"
        label="Especialidades"
        required
        hint="Selecione uma ou mais"
        error={errors.especialidades}
      >
        <SpecialtiesChips
          id="especialidades"
          value={data.especialidades}
          onChange={(next) => onChange('especialidades', next)}
          hasError={Boolean(errors.especialidades)}
          disabled={disabled}
        />
      </FormFieldWrapper>

      {/* Raio de Atendimento */}
      <FormFieldWrapper
        id="raioAtendimento"
        label="Raio de Atendimento"
        required
        hint="Em quilômetros"
        error={errors.raioAtendimento}
      >
        <ServiceRadiusInput
          id="raioAtendimento"
          value={data.raioAtendimento}
          onChange={(value) => onChange('raioAtendimento', value)}
          hasError={Boolean(errors.raioAtendimento)}
          disabled={disabled}
        />
      </FormFieldWrapper>

      {/* Biografia */}
      <FormFieldWrapper
        id="bio"
        label="Biografia"
        required
        hint={`${MIN_BIO_LENGTH} a ${MAX_BIO_LENGTH} caracteres`}
        error={errors.bio}
      >
        <BioTextarea
          id="bio"
          name="bio"
          placeholder="Conte um pouco sobre sua experiência, formação e tipos de serviço que realiza..."
          value={data.bio}
          onChange={(e) => onChange('bio', e.target.value)}
          onBlur={() => onBlur?.('bio')}
          hasError={Boolean(errors.bio)}
          disabled={disabled}
        />
      </FormFieldWrapper>
    </div>
  );
};
