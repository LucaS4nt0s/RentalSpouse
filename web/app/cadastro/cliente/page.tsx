'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PersonalInfoSection,
  PersonalInfoData,
  PersonalInfoErrors,
} from '../../../components/sections/PersonalInfoSection';
import {
  AddressSection,
  AddressData,
  AddressErrors,
} from '../../../components/sections/AddressSection';
import {
  PasswordSection,
  PasswordData,
  PasswordErrors,
} from '../../../components/sections/PasswordSection';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import {
  validateFullName,
  validateEmail,
  validateCPF,
  validateBirthDate,
  evaluatePasswordStrength,
  validatePasswordMatch,
  validateCEP,
} from '../../../utils/validators';
import { cleanDigits, formatDateToISO } from '../../../utils/formatters';

interface SuccessResponseData {
  id: number;
  nome_completo: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  created_at?: string;
}

export default function CadastroClientePage() {
  // Estado 1: Dados Pessoais
  const [personalData, setPersonalData] = useState<PersonalInfoData>({
    nomeCompleto: '',
    email: '',
    cpf: '',
    dataNascimento: '',
  });

  // Estado 2: Endereço
  const [addressData, setAddressData] = useState<AddressData>({
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado_uf: '',
  });

  // Estado 3: Credenciais
  const [passwordData, setPasswordData] = useState<PasswordData>({
    senha: '',
    confirmacaoSenha: '',
  });

  // Erros de cada seção
  const [personalErrors, setPersonalErrors] = useState<PersonalInfoErrors>({});
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});

  // Estados Globais de UI (Loading, Error, Success)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<{
    type: 'conflict' | 'network' | 'validation';
    message: string;
    field?: string;
  } | null>(null);
  const [successData, setSuccessData] = useState<SuccessResponseData | null>(null);

  // Manipuladores de alteração
  const handlePersonalChange = (field: keyof PersonalInfoData, value: string) => {
    setPersonalData((prev) => ({ ...prev, [field]: value }));
    if (personalErrors[field]) {
      setPersonalErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  const handleAddressChange = (field: keyof AddressData, value: string) => {
    setAddressData((prev) => ({ ...prev, [field]: value }));
    if (addressErrors[field]) {
      setAddressErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  const handlePasswordChange = (field: keyof PasswordData, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) {
      setPasswordErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  // Validação em evento de blur por campo
  const handlePersonalBlur = (field: keyof PersonalInfoData) => {
    if (field === 'nomeCompleto' && personalData.nomeCompleto) {
      const res = validateFullName(personalData.nomeCompleto);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, nomeCompleto: res.message }));
    } else if (field === 'email' && personalData.email) {
      const res = validateEmail(personalData.email);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, email: res.message }));
    } else if (field === 'cpf' && personalData.cpf) {
      const res = validateCPF(personalData.cpf);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, cpf: res.message }));
    } else if (field === 'dataNascimento' && personalData.dataNascimento) {
      const res = validateBirthDate(personalData.dataNascimento);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, dataNascimento: res.message }));
    }
  };

  const handleAddressBlur = (field: keyof AddressData) => {
    if (field === 'cep' && addressData.cep) {
      const res = validateCEP(addressData.cep);
      if (!res.isValid) setAddressErrors((prev) => ({ ...prev, cep: res.message }));
    } else if (field === 'logradouro' && addressData.logradouro && addressData.logradouro.trim().length < 3) {
      setAddressErrors((prev) => ({ ...prev, logradouro: 'O logradouro deve ter no mínimo 3 caracteres.' }));
    } else if (field === 'numero' && addressData.numero && addressData.numero.trim().length < 1) {
      setAddressErrors((prev) => ({ ...prev, numero: 'O número é obrigatório.' }));
    }
  };

  const handlePasswordBlur = (field: keyof PasswordData) => {
    if (field === 'confirmacaoSenha' && passwordData.confirmacaoSenha) {
      const res = validatePasswordMatch(passwordData.senha, passwordData.confirmacaoSenha);
      if (!res.isValid) setPasswordErrors((prev) => ({ ...prev, confirmacaoSenha: res.message }));
    }
  };

  // Validação completa antes do envio
  const validateForm = (): boolean => {
    let hasError = false;

    // 1. Dados Pessoais
    const newPersonalErrors: PersonalInfoErrors = {};
    const nameVal = validateFullName(personalData.nomeCompleto);
    if (!nameVal.isValid) {
      newPersonalErrors.nomeCompleto = nameVal.message;
      hasError = true;
    }
    const emailVal = validateEmail(personalData.email);
    if (!emailVal.isValid) {
      newPersonalErrors.email = emailVal.message;
      hasError = true;
    }
    const cpfVal = validateCPF(personalData.cpf);
    if (!cpfVal.isValid) {
      newPersonalErrors.cpf = cpfVal.message;
      hasError = true;
    }
    const birthVal = validateBirthDate(personalData.dataNascimento);
    if (!birthVal.isValid) {
      newPersonalErrors.dataNascimento = birthVal.message;
      hasError = true;
    }
    setPersonalErrors(newPersonalErrors);

    // 2. Endereço
    const newAddressErrors: AddressErrors = {};
    const cepVal = validateCEP(addressData.cep);
    if (!cepVal.isValid) {
      newAddressErrors.cep = cepVal.message;
      hasError = true;
    }
    if (!addressData.logradouro || addressData.logradouro.trim().length < 3) {
      newAddressErrors.logradouro = 'O logradouro é obrigatório (mínimo 3 caracteres).';
      hasError = true;
    }
    if (!addressData.numero || addressData.numero.trim().length < 1) {
      newAddressErrors.numero = 'O número é obrigatório.';
      hasError = true;
    }
    if (!addressData.bairro || addressData.bairro.trim().length < 2) {
      newAddressErrors.bairro = 'O bairro é obrigatório.';
      hasError = true;
    }
    if (!addressData.cidade || addressData.cidade.trim().length < 2) {
      newAddressErrors.cidade = 'A cidade é obrigatória.';
      hasError = true;
    }
    if (!addressData.estado_uf) {
      newAddressErrors.estado_uf = 'Selecione o estado (UF).';
      hasError = true;
    }
    setAddressErrors(newAddressErrors);

    // 3. Senha Forte
    const newPasswordErrors: PasswordErrors = {};
    const passwordStrength = evaluatePasswordStrength(passwordData.senha);
    if (!passwordStrength.isValid) {
      newPasswordErrors.senha = 'A senha deve cumprir todos os 5 critérios de segurança.';
      hasError = true;
    }
    const matchVal = validatePasswordMatch(passwordData.senha, passwordData.confirmacaoSenha);
    if (!matchVal.isValid) {
      newPasswordErrors.confirmacaoSenha = matchVal.message;
      hasError = true;
    }
    setPasswordErrors(newPasswordErrors);

    return !hasError;
  };

  // Submissão do Formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    const isValid = validateForm();
    if (!isValid) {
      setGlobalError({
        type: 'validation',
        message: 'Por favor, revise os campos destacados em vermelho antes de prosseguir.',
      });
      window.scrollTo({ top: 120, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);

    const payload = {
      nome_completo: personalData.nomeCompleto.trim(),
      email: personalData.email.trim().toLowerCase(),
      cpf: cleanDigits(personalData.cpf),
      data_nascimento: formatDateToISO(personalData.dataNascimento),
      senha: passwordData.senha,
      endereco: {
        cep: cleanDigits(addressData.cep),
        logradouro: addressData.logradouro.trim(),
        numero: addressData.numero.trim(),
        complemento: addressData.complemento.trim() || undefined,
        bairro: addressData.bairro.trim(),
        cidade: addressData.cidade.trim(),
        estado_uf: addressData.estado_uf.trim().toUpperCase(),
      },
    };

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    try {
      const response = await fetch(`${apiUrl}/api/v1/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const createdClient: SuccessResponseData = await response.json();
        setSuccessData(createdClient);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (response.status === 409) {
        const errorData = await response.json();
        const conflictField = errorData.field || 'registro';
        setGlobalError({
          type: 'conflict',
          message:
            errorData.detail ||
            `Este ${conflictField === 'cpf' ? 'CPF' : 'E-mail'} já está cadastrado no RentalSpouse. Deseja fazer login?`,
          field: conflictField,
        });
        window.scrollTo({ top: 80, behavior: 'smooth' });
        return;
      }

      if (response.status === 422) {
        const errorData = await response.json();
        const firstError = errorData.detail?.[0]?.msg || 'Dados inválidos fornecidos no formulário.';
        setGlobalError({
          type: 'validation',
          message: `Erro de validação: ${firstError}`,
        });
        window.scrollTo({ top: 80, behavior: 'smooth' });
        return;
      }

      throw new Error(`Erro ${response.status}: Falha ao processar cadastro.`);
    } catch (err) {
      setGlobalError({
        type: 'network',
        message:
          'Não foi possível conectar ao servidor RentalSpouse. Verifique sua conexão e tente novamente.',
      });
      window.scrollTo({ top: 80, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Se o cadastro foi um sucesso, renderiza a tela de confirmação (Estado 3: Success)
  if (successData) {
    return (
      <main className="min-h-screen bg-[#f6f5f8] dark:bg-[#11091a] text-[#11091a] dark:text-[#F3F4F6] relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
        {/* Luzes de Fundo Ambient Glass */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#e8d18e]/15 dark:bg-[#e8d18e]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#2f2f4d]/10 dark:bg-[#2f2f4d]/40 rounded-full blur-[140px] pointer-events-none" />

        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="relative w-full max-w-xl glass-panel-elevated rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center gap-6 animate-fadeIn transition-colors">
          {/* Ícone de Sucesso com Soft Gold */}
          <div className="w-20 h-20 rounded-3xl bg-[#e8d18e]/20 dark:bg-[#e8d18e]/15 border-2 border-[#e8d18e] flex items-center justify-center text-[#947728] dark:text-[#e8d18e] shadow-gold-glow animate-bounceOnce">
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Conta Criada com Sucesso
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#11091a] dark:text-[#F3F4F6] tracking-tight">
              Bem-vindo ao RentalSpouse!
            </h1>
            <p className="text-sm text-[#626970] dark:text-[#bab195] max-w-md mx-auto leading-relaxed">
              Cadastro realizado com sucesso,{' '}
              <strong className="text-[#947728] dark:text-[#e8d18e] font-semibold">
                {successData.nome_completo}
              </strong>
              ! Sua conta está pronta para uso imediato.
            </p>
          </div>

          {/* Dados Resumidos em Card Glass */}
          <div className="w-full glass-card-subtle rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200 dark:border-white/5">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-white/[0.04]">
              <span className="text-[#626970]">Protocolo / ID:</span>
              <span className="font-mono text-[#2f2f4d] dark:text-[#bab195] font-bold">#{successData.id}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-white/[0.04]">
              <span className="text-[#626970]">E-mail:</span>
              <span className="text-[#11091a] dark:text-[#F3F4F6] font-medium">{successData.email}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[#626970]">Status da Conta:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                Ativa & Verificada
              </span>
            </div>
          </div>

          {/* Ações Subsequentes */}
          <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                alert('Fluxo para Solicitar um Serviço iniciado!');
              }}
            >
              Solicitar um Serviço Agora
            </Button>
            <Link href="/" className="flex-1">
              <Button variant="glass" size="lg" className="w-full">
                Ir para Minha Conta / Login
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f5f8] dark:bg-[#11091a] text-[#11091a] dark:text-[#F3F4F6] relative overflow-hidden py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      {/* Luzes de Fundo Ambientais Estilo Glass */}
      <div className="absolute top-10 left-1/3 w-[500px] h-[500px] bg-[#e8d18e]/15 dark:bg-[#2f2f4d]/30 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-[450px] h-[450px] bg-[#bab195]/20 dark:bg-[#e8d18e]/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-[#626970]/10 dark:bg-[#626970]/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto flex flex-col gap-6">
        {/* Barra de Topo com Atalhos e Alternância de Tema */}
        <div className="flex items-center justify-between w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold glass-card-subtle text-[#2f2f4d] dark:text-[#bab195] hover:text-[#11091a] dark:hover:text-[#e8d18e] border border-slate-200/80 dark:border-white/10 transition-colors"
          >
            <span>← Início</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#e8d18e]/20 dark:bg-[#e8d18e]/10 text-[#6e581c] dark:text-[#e8d18e] border border-[#e8d18e]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e8d18e] animate-pulse" />
              RentalSpouse
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Cabeçalho da Página */}
        <header className="text-center flex flex-col items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#11091a] dark:text-[#F3F4F6]">
            Cadastro de Novo Cliente
          </h1>
          <p className="text-sm sm:text-base text-[#626970] dark:text-[#bab195] max-w-lg leading-relaxed">
            Crie sua conta para solicitar manutenções, reparos e reformas com profissionais
            qualificados e credenciados.
          </p>
        </header>

        {/* Banner de Erro Global (Estado 2: Error) */}
        {globalError && (
          <div
            className="glass-panel p-4 sm:p-5 rounded-2xl border-l-4 border-l-[#EF4444] border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-shake"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-[#EF4444] flex items-center justify-center shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#11091a] dark:text-[#F3F4F6]">
                  {globalError.type === 'conflict'
                    ? 'Registro Já Cadastrado'
                    : globalError.type === 'network'
                    ? 'Falha de Conexão'
                    : 'Atenção ao Preenchimento'}
                </p>
                <p className="text-xs text-[#626970] dark:text-[#bab195] mt-0.5 leading-relaxed">
                  {globalError.message}
                </p>
              </div>
            </div>

            {/* Ações de Retry ou Login no Erro */}
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {globalError.type === 'conflict' && (
                <Link href="/">
                  <Button variant="outline" size="sm">
                    Ir para Login
                  </Button>
                </Link>
              )}
              {globalError.type === 'network' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                >
                  Tentar Novamente
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Formulário Principal em Painel Glassmorphism */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="glass-panel rounded-3xl p-6 sm:p-8 lg:p-10 flex flex-col gap-8 shadow-glass transition-all duration-300"
        >
          {/* Seção 1: Dados Pessoais */}
          <PersonalInfoSection
            data={personalData}
            errors={personalErrors}
            onChange={handlePersonalChange}
            onBlur={handlePersonalBlur}
            disabled={isSubmitting}
          />

          {/* Seção 2: Endereço */}
          <AddressSection
            data={addressData}
            errors={addressErrors}
            onChange={handleAddressChange}
            onBlur={handleAddressBlur}
            disabled={isSubmitting}
          />

          {/* Seção 3: Credenciais & Senha Forte */}
          <PasswordSection
            data={passwordData}
            errors={passwordErrors}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            disabled={isSubmitting}
          />

          {/* Rodapé e CTA de Envio (Estado 1: Loading tratado) */}
          <div className="pt-4 border-t border-slate-200/60 dark:border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#626970] text-center sm:text-left">
              Ao cadastrar-se, você concorda com os termos do RentalSpouse e com a LGPD.
            </p>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              loadingText="Cadastrando cliente..."
              className="w-full sm:w-auto min-w-[220px]"
            >
              Finalizar Cadastro
            </Button>
          </div>
        </form>

        {/* Rodapé Informativo */}
        <footer className="text-center text-xs text-[#626970] space-y-1">
          <p>RentalSpouse &copy; 2026 — Plataforma de Serviços Residenciais</p>
          <p className="font-mono text-[11px] text-[#626970]/80">
            Next.js App Router • Glassmorphism (Light & Dark Theme)
          </p>
        </footer>
      </div>
    </main>
  );
}
