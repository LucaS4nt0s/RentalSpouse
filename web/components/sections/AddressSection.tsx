'use client';

import React, { useRef } from 'react';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { TextInput } from '../ui/TextInput';
import { MaskedInput } from '../ui/MaskedInput';
import { Select } from '../ui/Select';
import { useAddressLookup, AddressResult } from '../../hooks/useAddressLookup';
import { VALID_UFS } from '../../utils/validators';

export interface AddressData {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado_uf: string;
}

export interface AddressErrors {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado_uf?: string;
}

export interface AddressSectionProps {
  data: AddressData;
  errors: AddressErrors;
  onChange: (field: keyof AddressData, value: string) => void;
  onBlur?: (field: keyof AddressData) => void;
  disabled?: boolean;
}

export const AddressSection: React.FC<AddressSectionProps> = ({
  data,
  errors,
  onChange,
  onBlur,
  disabled = false,
}) => {
  const numeroInputRef = useRef<HTMLInputElement>(null);

  // Hook assíncrono com busca de CEP, debounce e foco automático
  const { isLoading: isLoadingCep, error: cepLookupError } = useAddressLookup(data.cep, {
    onSuccess: (result: AddressResult) => {
      if (result.logradouro) onChange('logradouro', result.logradouro);
      if (result.bairro) onChange('bairro', result.bairro);
      if (result.cidade) onChange('cidade', result.cidade);
      if (result.estado_uf) onChange('estado_uf', result.estado_uf);

      // Foco automático no campo Número após resposta do CEP
      setTimeout(() => {
        numeroInputRef.current?.focus();
      }, 100);
    },
  });

  const displayCepError = errors.cep || cepLookupError || undefined;

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
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#11091a] dark:text-[#F3F4F6] tracking-tight">
            2. Endereço Principal
          </h2>
          <p className="text-xs text-[#626970] dark:text-[#bab195]/80">
            Local onde os atendimentos e manutenções serão solicitados
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 sm:gap-5">
        {/* CEP */}
        <div className="md:col-span-2">
          <FormFieldWrapper
            id="cep"
            label="CEP"
            required
            hint="Busca automática"
            error={displayCepError}
          >
            <div className="relative">
              <MaskedInput
                id="cep"
                name="cep"
                maskType="cep"
                placeholder="00000-000"
                value={data.cep}
                onChange={(e) => onChange('cep', e.target.value)}
                onBlur={() => onBlur?.('cep')}
                hasError={Boolean(displayCepError)}
                disabled={disabled}
                inputMode="numeric"
                maxLength={9}
                rightIcon={
                  isLoadingCep ? (
                    <svg
                      className="animate-spin h-4 w-4 text-[#e8d18e]"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : null
                }
              />
            </div>
          </FormFieldWrapper>
        </div>

        {/* Logradouro (Rua / Avenida) */}
        <div className="md:col-span-4">
          <FormFieldWrapper
            id="logradouro"
            label="Logradouro (Rua / Av.)"
            required
            error={errors.logradouro}
          >
            <TextInput
              id="logradouro"
              name="logradouro"
              autoComplete="street-address"
              placeholder="Ex: Av. Paulista, Rua das Flores"
              value={data.logradouro}
              onChange={(e) => onChange('logradouro', e.target.value)}
              onBlur={() => onBlur?.('logradouro')}
              hasError={Boolean(errors.logradouro)}
              disabled={disabled}
            />
          </FormFieldWrapper>
        </div>

        {/* Número */}
        <div className="md:col-span-2">
          <FormFieldWrapper
            id="numero"
            label="Número"
            required
            hint="Ex: 123 ou S/N"
            error={errors.numero}
          >
            <TextInput
              ref={numeroInputRef}
              id="numero"
              name="numero"
              placeholder="123"
              value={data.numero}
              onChange={(e) => onChange('numero', e.target.value)}
              onBlur={() => onBlur?.('numero')}
              hasError={Boolean(errors.numero)}
              disabled={disabled}
              maxLength={10}
            />
          </FormFieldWrapper>
        </div>

        {/* Complemento */}
        <div className="md:col-span-4">
          <FormFieldWrapper
            id="complemento"
            label="Complemento"
            hint="Opcional"
            error={errors.complemento}
          >
            <TextInput
              id="complemento"
              name="complemento"
              placeholder="Apto 42, Bloco B, Casa 2"
              value={data.complemento}
              onChange={(e) => onChange('complemento', e.target.value)}
              onBlur={() => onBlur?.('complemento')}
              hasError={Boolean(errors.complemento)}
              disabled={disabled}
              maxLength={60}
            />
          </FormFieldWrapper>
        </div>

        {/* Bairro */}
        <div className="md:col-span-2">
          <FormFieldWrapper
            id="bairro"
            label="Bairro"
            required
            error={errors.bairro}
          >
            <TextInput
              id="bairro"
              name="bairro"
              placeholder="Bairro"
              value={data.bairro}
              onChange={(e) => onChange('bairro', e.target.value)}
              onBlur={() => onBlur?.('bairro')}
              hasError={Boolean(errors.bairro)}
              disabled={disabled}
            />
          </FormFieldWrapper>
        </div>

        {/* Cidade */}
        <div className="md:col-span-3">
          <FormFieldWrapper
            id="cidade"
            label="Cidade"
            required
            error={errors.cidade}
          >
            <TextInput
              id="cidade"
              name="cidade"
              placeholder="Cidade"
              value={data.cidade}
              onChange={(e) => onChange('cidade', e.target.value)}
              onBlur={() => onBlur?.('cidade')}
              hasError={Boolean(errors.cidade)}
              disabled={disabled}
            />
          </FormFieldWrapper>
        </div>

        {/* Estado UF */}
        <div className="md:col-span-1">
          <FormFieldWrapper
            id="estado_uf"
            label="UF"
            required
            error={errors.estado_uf}
          >
            <Select
              id="estado_uf"
              name="estado_uf"
              value={data.estado_uf}
              onChange={(e) => onChange('estado_uf', e.target.value)}
              onBlur={() => onBlur?.('estado_uf')}
              options={VALID_UFS}
              placeholder="UF"
              hasError={Boolean(errors.estado_uf)}
              disabled={disabled}
            />
          </FormFieldWrapper>
        </div>
      </div>
    </div>
  );
};
