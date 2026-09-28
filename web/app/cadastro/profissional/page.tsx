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
  ProviderSkillsSection,
  ProviderSkillsData,
  ProviderSkillsErrors,
} from '../../../components/sections/ProviderSkillsSection';
import {
  PasswordSection,
  PasswordData,
  PasswordErrors,
} from '../../../components/sections/PasswordSection';
import { Button } from '../../../components/ui/Button';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import { ArrowLeft } from 'lucide-react';

import {
  validateFullName,
  validateEmail,
  validateCPF,
  validateBirthDate,
  validatePhone,
  validateSpecialties,
  validateServiceRadius,
  validateBio,
  evaluatePasswordStrength,
  validatePasswordMatch,
  validateCEP,
} from '../../../utils/validators';
import { cleanDigits, formatDateToISO } from '../../../utils/formatters';

interface SuccessResponseData {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  criado_em?: string;
}

export default function CadastroProfissionalPage() {
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

  // Estado 3: Perfil Profissional
  const [skillsData, setSkillsData] = useState<ProviderSkillsData>({
    telefone: '',
    especialidades: [],
    raioAtendimento: 10,
    bio: '',
  });

  // Estado 4: Credenciais
  const [passwordData, setPasswordData] = useState<PasswordData>({
    senha: '',
    confirmacaoSenha: '',
  });

  // Erros por seção
  const [personalErrors, setPersonalErrors] = useState<PersonalInfoErrors>({});
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [skillsErrors, setSkillsErrors] = useState<ProviderSkillsErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});

  // Estados Globais de UI
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<{
    type: 'conflict' | 'network' | 'validation';
    message: string;
    field?: string;
  } | null>(null);
  const [successData, setSuccessData] = useState<SuccessResponseData | null>(null);

  const handlePersonalChange = (field: keyof PersonalInfoData, value: string) => {
    setPersonalData((prev) => ({ ...prev, [field]: value }));
    if (personalErrors[field]) setPersonalErrors((prev) => ({ ...prev, [field]: undefined }));
    if (globalError) setGlobalError(null);
  };

  const handleAddressChange = (field: keyof AddressData, value: string) => {
    setAddressData((prev) => ({ ...prev, [field]: value }));
    if (addressErrors[field]) setAddressErrors((prev) => ({ ...prev, [field]: undefined }));
    if (globalError) setGlobalError(null);
  };

  const handleSkillsChange = (
    field: keyof ProviderSkillsData,
    value: string | string[] | number
  ) => {
    setSkillsData((prev) => ({ ...prev, [field]: value }));
    if (skillsErrors[field]) setSkillsErrors((prev) => ({ ...prev, [field]: undefined }));
    if (globalError) setGlobalError(null);
  };

  const handlePasswordChange = (field: keyof PasswordData, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) setPasswordErrors((prev) => ({ ...prev, [field]: undefined }));
    if (globalError) setGlobalError(null);
  };

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
    }
  };

  const handleSkillsBlur = (field: keyof ProviderSkillsData) => {
    if (field === 'telefone' && skillsData.telefone) {
      const res = validatePhone(skillsData.telefone);
      if (!res.isValid) setSkillsErrors((prev) => ({ ...prev, telefone: res.message }));
    } else if (field === 'bio' && skillsData.bio) {
      const res = validateBio(skillsData.bio);
      if (!res.isValid) setSkillsErrors((prev) => ({ ...prev, bio: res.message }));
    }
  };

  const handlePasswordBlur = (field: keyof PasswordData) => {
    if (field === 'confirmacaoSenha' && passwordData.confirmacaoSenha) {
      const res = validatePasswordMatch(passwordData.senha, passwordData.confirmacaoSenha);
      if (!res.isValid) setPasswordErrors((prev) => ({ ...prev, confirmacaoSenha: res.message }));
    }
  };

  const mapBackendValidationErrors = (
    detail: Array<{ loc?: (string | number)[]; msg?: string }>
  ): string => {
    const nextPersonalErrors: PersonalInfoErrors = {};
    const nextAddressErrors: AddressErrors = {};
    const nextSkillsErrors: ProviderSkillsErrors = {};
    const nextPasswordErrors: PasswordErrors = {};
    let unmappedMessage = '';

    detail.forEach((item) => {
      const loc = item.loc ?? [];
      const field = loc[loc.length - 1];
      const message = item.msg || 'Valor inválido.';
      switch (field) {
        case 'nome_completo':
        case 'nome':
          nextPersonalErrors.nomeCompleto = message;
          break;
        case 'email':
          nextPersonalErrors.email = message;
          break;
        case 'cpf':
          nextPersonalErrors.cpf = message;
          break;
        case 'data_nascimento':
          nextPersonalErrors.dataNascimento = message;
          break;
        case 'telefone':
          nextSkillsErrors.telefone = message;
          break;
        case 'especialidades':
          nextSkillsErrors.especialidades = message;
          break;
        case 'raio_atendimento_km':
        case 'raio_atendimento':
          nextSkillsErrors.raioAtendimento = message;
          break;
        case 'bio':
          nextSkillsErrors.bio = message;
          break;
        case 'senha':
          nextPasswordErrors.senha = message;
          break;
        case 'confirmar_senha':
        case 'confirmacao_senha':
        case 'body':
          nextPasswordErrors.confirmacaoSenha = message;
          break;
        case 'cep':
          nextAddressErrors.cep = message;
          break;
        case 'logradouro':
          nextAddressErrors.logradouro = message;
          break;
        case 'numero':
          nextAddressErrors.numero = message;
          break;
        case 'complemento':
          nextAddressErrors.complemento = message;
          break;
        case 'bairro':
          nextAddressErrors.bairro = message;
          break;
        case 'cidade':
          nextAddressErrors.cidade = message;
          break;
        case 'estado_uf':
        case 'estado':
          nextAddressErrors.estado_uf = message;
          break;
        default:
          if (!unmappedMessage) unmappedMessage = message;
      }
    });

    setPersonalErrors(nextPersonalErrors);
    setAddressErrors(nextAddressErrors);
    setSkillsErrors(nextSkillsErrors);
    setPasswordErrors(nextPasswordErrors);
    return unmappedMessage;
  };

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

    // 3. Perfil Profissional
    const newSkillsErrors: ProviderSkillsErrors = {};
    const phoneVal = validatePhone(skillsData.telefone);
    if (!phoneVal.isValid) {
      newSkillsErrors.telefone = phoneVal.message;
      hasError = true;
    }
    const specialtiesVal = validateSpecialties(skillsData.especialidades);
    if (!specialtiesVal.isValid) {
      newSkillsErrors.especialidades = specialtiesVal.message;
      hasError = true;
    }
    const radiusVal = validateServiceRadius(skillsData.raioAtendimento);
    if (!radiusVal.isValid) {
      newSkillsErrors.raioAtendimento = radiusVal.message;
      hasError = true;
    }
    const bioVal = validateBio(skillsData.bio);
    if (!bioVal.isValid) {
      newSkillsErrors.bio = bioVal.message;
      hasError = true;
    }
    setSkillsErrors(newSkillsErrors);

    // 4. Senha
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
      nome: personalData.nomeCompleto.trim(),
      email: personalData.email.trim().toLowerCase(),
      cpf: cleanDigits(personalData.cpf),
      data_nascimento: formatDateToISO(personalData.dataNascimento),
      telefone: cleanDigits(skillsData.telefone),
      especialidades: skillsData.especialidades,
      raio_atendimento_km: skillsData.raioAtendimento,
      bio: skillsData.bio.trim(),
      senha: passwordData.senha,
      confirmar_senha: passwordData.confirmacaoSenha,
      endereco: {
        cep: cleanDigits(addressData.cep),
        logradouro: addressData.logradouro.trim(),
        numero: addressData.numero.trim(),
        complemento: addressData.complemento.trim() || undefined,
        bairro: addressData.bairro.trim(),
        cidade: addressData.cidade.trim(),
        estado: addressData.estado_uf.trim().toUpperCase(),
      },
    };

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    try {
      const response = await fetch(`${apiUrl}/api/profissionais`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const createdProfessional: SuccessResponseData = await response.json();
        setSuccessData(createdProfessional);
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
        const detail = Array.isArray(errorData.detail) ? errorData.detail : [];
        const unmappedMessage = mapBackendValidationErrors(detail);
        setGlobalError({
          type: 'validation',
          message:
            unmappedMessage ||
            'Alguns campos foram rejeitados pelo servidor. Revise os itens destacados.',
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

  if (successData) {
    return (
      <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] text-[#0E1B2E] dark:text-[#EAF1FB] relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1D4ED8]/15 dark:bg-[#1D4ED8]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#16263F]/10 dark:bg-[var(--rs-surface)]/40 rounded-full blur-[140px] pointer-events-none" />

        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="relative w-full max-w-xl glass-panel-elevated rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center gap-6 animate-fadeIn transition-colors">
          <div className="w-20 h-20 rounded-3xl bg-[#1D4ED8]/20 dark:bg-[#1D4ED8]/15 border-2 border-[#1D4ED8] flex items-center justify-center text-[#1D4ED8] dark:text-[var(--rs-primary)] shadow-primary animate-bounceOnce">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Perfil Profissional Criado
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0E1B2E] dark:text-[#EAF1FB] tracking-tight">
              Bem-vindo ao RentalSpouse!
            </h1>
            <p className="text-sm text-[#64748B] dark:text-[#93A5C0] max-w-md mx-auto leading-relaxed">
              Cadastro realizado com sucesso,{' '}
              <strong className="text-[#1D4ED8] dark:text-[var(--rs-primary)] font-semibold">
                {successData.nome}
              </strong>
              ! Seu perfil está pronto para receber clientes.
            </p>
          </div>

          <div className="w-full glass-card-subtle rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200 dark:border-white/5">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-white/[0.04]">
              <span className="text-[#64748B]">Protocolo / ID:</span>
              <span className="font-mono text-[#16263F] dark:text-[#93A5C0] font-bold">#{successData.id}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-white/[0.04]">
              <span className="text-[#64748B]">E-mail:</span>
              <span className="text-[#0E1B2E] dark:text-[#EAF1FB] font-medium">{successData.email}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[#64748B]">Status do Perfil:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Em análise
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
            <Link href="/entrar?mode=signin" className="flex-1">
              <Button variant="primary" size="lg" className="w-full">
                Ir para Minha Conta / Login
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F7FE] dark:bg-[var(--rs-bg)] text-[#0E1B2E] dark:text-[#EAF1FB] relative overflow-hidden py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="absolute top-10 left-1/3 w-[500px] h-[500px] bg-[#1D4ED8]/15 dark:bg-[var(--rs-surface)]/30 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-[450px] h-[450px] bg-[#93A5C0]/20 dark:bg-[#1D4ED8]/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-[#64748B]/10 dark:bg-[#64748B]/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Link
              href="/entrar?mode=signup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold glass-card-subtle text-[#16263F] dark:text-[#93A5C0] hover:text-[#0E1B2E] dark:hover:text-[var(--rs-primary)] border border-slate-200/80 dark:border-white/10 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold glass-card-subtle text-[#16263F] dark:text-[#93A5C0] hover:text-[#0E1B2E] dark:hover:text-[var(--rs-primary)] border border-slate-200/80 dark:border-white/10 transition-colors"
            >
              <span>Início</span>
            </Link>
          </div>


          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#1D4ED8]/20 dark:bg-[#1D4ED8]/10 text-[#1E40AF] dark:text-[var(--rs-primary)] border border-[#1D4ED8]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] animate-pulse" />
              RentalSpouse • Profissional
            </span>
            <ThemeToggle />
          </div>
        </div>

        <header className="text-center flex flex-col items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0E1B2E] dark:text-[#EAF1FB]">
            Cadastro de Profissional
          </h1>
          <p className="text-sm sm:text-base text-[#64748B] dark:text-[#93A5C0] max-w-lg leading-relaxed">
            Crie seu perfil, defina suas especialidades e o raio de atendimento para receber
            solicitações de clientes próximos.
          </p>
        </header>

        {globalError && (
          <div
            className="glass-panel p-4 sm:p-5 rounded-2xl border-l-4 border-l-[#EF4444] border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-shake"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-[#EF4444] flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0E1B2E] dark:text-[#EAF1FB]">
                  {globalError.type === 'conflict'
                    ? 'Registro Já Cadastrado'
                    : globalError.type === 'network'
                    ? 'Falha de Conexão'
                    : 'Atenção ao Preenchimento'}
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#93A5C0] mt-0.5 leading-relaxed">
                  {globalError.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {globalError.type === 'conflict' && (
                <Link href="/entrar?mode=signin">
                  <Button variant="outline" size="sm">
                    Ir para Login
                  </Button>
                </Link>
              )}
              {globalError.type === 'network' && (
                <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
                  Tentar Novamente
                </Button>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="glass-panel rounded-3xl p-6 sm:p-8 lg:p-10 flex flex-col gap-8 shadow-glass transition-all duration-300"
        >
          <PersonalInfoSection
            data={personalData}
            errors={personalErrors}
            onChange={handlePersonalChange}
            onBlur={handlePersonalBlur}
            disabled={isSubmitting}
          />

          <AddressSection
            data={addressData}
            errors={addressErrors}
            onChange={handleAddressChange}
            onBlur={handleAddressBlur}
            disabled={isSubmitting}
          />

          <ProviderSkillsSection
            data={skillsData}
            errors={skillsErrors}
            onChange={handleSkillsChange}
            onBlur={handleSkillsBlur}
            disabled={isSubmitting}
          />

          <PasswordSection
            data={passwordData}
            errors={passwordErrors}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            disabled={isSubmitting}
          />

          <div className="pt-4 border-t border-slate-200/60 dark:border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#64748B] text-center sm:text-left">
              Ao cadastrar-se, você concorda com os termos do RentalSpouse e com a LGPD.
            </p>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              loadingText="Salvando perfil..."
              className="w-full sm:w-auto min-w-[220px]"
            >
              Finalizar Cadastro
            </Button>
          </div>
        </form>

        <footer className="text-center text-xs text-[#64748B] space-y-1">
          <p>RentalSpouse &copy; 2026 — Plataforma de Serviços Residenciais</p>
          <p className="font-mono text-[11px] text-[#64748B]/80">
            Next.js App Router • Glassmorphism (Light & Dark Theme)
          </p>
        </footer>
      </div>
    </main>
  );
}
