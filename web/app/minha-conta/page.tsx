'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  User,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck2,
  Sun,
  Moon,
  MapPin,
  Wrench,
  Mail,
  Save,
  KeyRound,
} from 'lucide-react';
import { AppHeader } from '../../components/layout/AppHeader';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { FormFieldWrapper } from '../../components/ui/FormFieldWrapper';
import { Select } from '../../components/ui/Select';
import { SpecialtiesChips } from '../../components/ui/SpecialtiesChips';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { VALID_UFS } from '../../utils/validators';
import { cleanDigits, maskCEP, maskPhone } from '../../utils/formatters';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type ActiveTab = 'dados' | 'preferencias';

interface ProfileResponse {
  id?: number;
  name: string;
  nome?: string;
  email: string;
  role: string;
  tipo?: string;
  is_active: boolean;
  email_verificado: boolean;
  // Cliente
  cpf?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  // Profissional
  phone?: string | null;
  bio?: string | null;
  service_radius_km?: number | null;
  specialties?: string[] | null;
  city?: string | null;
  state?: string | null;
  approval_status?: string | null;
}

export default function MinhaContaPage() {
  const { user, token, isAuthenticated, isLoading: authLoading, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dados');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Campos comuns
  const [name, setName] = useState('');

  // Campos de Cliente
  const [dataNascimento, setDataNascimento] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  // Campos de Profissional
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState<number>(10);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');

  // Alteração de senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');

  // Estados de submissão e feedback
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const populateForm = useCallback((data: ProfileResponse) => {
    setProfile(data);
    setName(data.name || data.nome || '');
    setDataNascimento(data.data_nascimento || '');
    setCep(data.cep ? maskCEP(data.cep) : '');
    setLogradouro(data.logradouro || '');
    setNumero(data.numero || '');
    setComplemento(data.complemento || '');
    setBairro(data.bairro || '');
    setCidade(data.cidade || '');
    setEstado(data.estado || '');
    setPhone(data.phone ? maskPhone(data.phone) : '');
    setBio(data.bio || '');
    setServiceRadiusKm(data.service_radius_km ?? 10);
    setSpecialties(Array.isArray(data.specialties) ? data.specialties : []);
    setCity(data.city || '');
    setStateUf(data.state || '');
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    setIsLoadingProfile(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || 'Não foi possível carregar os dados da sua conta.');
      }
      const data: ProfileResponse = await res.json();
      populateForm(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Falha na comunicação com o servidor.'
      );
    } finally {
      setIsLoadingProfile(false);
    }
  }, [token, populateForm]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && token) {
      fetchProfile();
    } else if (!authLoading && !isAuthenticated) {
      setIsLoadingProfile(false);
    }
  }, [authLoading, isAuthenticated, token, fetchProfile]);

  const role =
    profile?.role ||
    (user?.tipo === 'profissional'
      ? 'professional'
      : user?.tipo === 'admin'
      ? 'admin'
      : user?.role || 'client');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedbackBanner(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      setFeedbackBanner({
        type: 'error',
        message: 'O nome completo deve ter no mínimo 3 caracteres.',
      });
      return;
    }

    const payload: Record<string, unknown> = { name: trimmedName };

    if (role === 'client') {
      const cleanCepDigits = cleanDigits(cep);
      if (cleanCepDigits && cleanCepDigits.length !== 8) {
        setFeedbackBanner({
          type: 'error',
          message: 'O CEP deve conter exatamente 8 dígitos numéricos.',
        });
        return;
      }
      if (cleanCepDigits) payload.cep = cleanCepDigits;
      if (dataNascimento) payload.data_nascimento = dataNascimento;
      if (logradouro.trim()) payload.logradouro = logradouro.trim();
      if (numero.trim()) payload.numero = numero.trim();
      payload.complemento = complemento.trim() || null;
      if (bairro.trim()) payload.bairro = bairro.trim();
      if (cidade.trim()) payload.cidade = cidade.trim();
      if (estado.trim()) payload.estado = estado.trim().toUpperCase();
    } else if (role === 'professional') {
      if (bio.trim().length < 10) {
        setFeedbackBanner({
          type: 'error',
          message: 'A biografia profissional deve ter no mínimo 10 caracteres.',
        });
        return;
      }
      if (specialties.length < 1) {
        setFeedbackBanner({
          type: 'error',
          message: 'Selecione ao menos uma especialidade de atendimento.',
        });
        return;
      }
      payload.phone = cleanDigits(phone) || null;
      payload.bio = bio.trim();
      payload.service_radius_km = Number(serviceRadiusKm) || 10;
      payload.specialties = specialties;
      const cleanProfCep = cleanDigits(cep);
      if (cleanProfCep && cleanProfCep.length !== 8) {
        setFeedbackBanner({
          type: 'error',
          message: 'O CEP deve conter exatamente 8 dígitos numéricos.',
        });
        return;
      }
      if (cleanProfCep) payload.cep = cleanProfCep;
      if (logradouro.trim()) payload.logradouro = logradouro.trim();
      if (numero.trim()) payload.numero = numero.trim();
      payload.complemento = complemento.trim() || null;
      if (bairro.trim()) payload.bairro = bairro.trim();
      if (city.trim()) payload.city = city.trim();
      if (stateUf.trim()) payload.state = stateUf.trim().toUpperCase();
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
            ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
            : 'Não foi possível salvar as alterações.';
        throw new Error(msg);
      }

      populateForm(data);
      updateUser({
        nome: data.name || data.nome || trimmedName,
        name: data.name || trimmedName,
      });
      setFeedbackBanner({
        type: 'success',
        message: 'Seus dados cadastrais foram atualizados com sucesso!',
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao atualizar perfil.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedbackBanner(null);

    if (!senhaAtual) {
      setFeedbackBanner({
        type: 'error',
        message: 'Informe sua senha atual para confirmar a alteração.',
      });
      return;
    }
    if (novaSenha.length < 8) {
      setFeedbackBanner({
        type: 'error',
        message: 'A nova senha deve conter no mínimo 8 caracteres (com letras e números).',
      });
      return;
    }
    if (novaSenha !== confirmarNovaSenha) {
      setFeedbackBanner({
        type: 'error',
        message: 'A confirmação de senha não coincide com a nova senha.',
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
          confirmar_nova_senha: confirmarNovaSenha,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
            ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
            : 'Não foi possível alterar a senha.';
        throw new Error(msg);
      }

      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarNovaSenha('');
      setFeedbackBanner({
        type: 'success',
        message: 'Sua senha foi alterada com sucesso!',
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao alterar senha.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Estado 1: Loading (Skeleton)
  if (authLoading || isLoadingProfile) {
    return (
      <div className="min-h-screen flex flex-col bg-rental-bg text-rental-ink">
        <AppHeader />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 space-y-6">
          <div className="h-24 animate-pulse rounded-3xl bg-rental-surface2" />
          <div className="h-96 animate-pulse rounded-3xl bg-rental-surface2" />
        </main>
      </div>
    );
  }

  // Visitante não autenticado
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-rental-bg text-rental-ink">
        <AppHeader />
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-3xl border border-rental-border bg-rental-surface p-8 text-center space-y-5 shadow-panel animate-fadeIn">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary">
              <Lock className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-rental-ink">
                Acesse sua Conta
              </h1>
              <p className="text-sm text-rental-muted leading-relaxed">
                Faça login para visualizar e editar seus dados cadastrais, preferências de tema e configurações de segurança.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Link href="/entrar?mode=signin">
                <Button variant="primary" className="w-full">
                  Entrar na Minha Conta
                </Button>
              </Link>
              <Link href="/">
                <Button variant="secondary" className="w-full">
                  Voltar para a Página Inicial
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Estado 2: Erro ao carregar com opção de retry
  if (loadError && !profile) {
    return (
      <div className="min-h-screen flex flex-col bg-rental-bg text-rental-ink">
        <AppHeader />
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-3xl border border-[var(--rs-error)]/30 bg-rental-surface p-8 text-center space-y-5 shadow-panel">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rs-error)]/10 text-[var(--rs-error)]">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-rental-ink">
                Erro ao carregar perfil
              </h1>
              <p className="text-sm text-rental-muted">{loadError}</p>
            </div>
            <Button
              variant="primary"
              onClick={fetchProfile}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              className="w-full"
            >
              Tentar Novamente
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const roleBadgeLabel =
    role === 'professional'
      ? 'Profissional'
      : role === 'admin'
      ? 'Administrador'
      : 'Cliente';

  return (
    <div className="min-h-screen flex flex-col bg-rental-bg text-rental-ink">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 space-y-6 animate-fadeIn">
        {/* Cabeçalho do Perfil */}
        <section className="rounded-3xl border border-rental-border bg-rental-surface p-6 shadow-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-extrabold text-xl">
              {(name || user.nome || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-rental-ink">
                  Minha Conta
                </h1>
                <span className="rounded-full bg-rental-primary/10 px-2.5 py-0.5 text-xs font-bold text-rental-primary">
                  {roleBadgeLabel}
                </span>
                {profile?.email_verificado ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    E-mail verificado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Verificação pendente
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-rental-muted mt-0.5">
                {profile?.email || user.email}
              </p>
            </div>
          </div>

          {role === 'professional' && (
            <Link href="/profissional/documentos">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FileCheck2 className="h-4 w-4 text-rental-primary" />}
              >
                Meus Documentos
              </Button>
            </Link>
          )}
        </section>

        {/* Seletor de Abas */}
        <div
          role="tablist"
          aria-label="Seções da Minha Conta"
          className="flex rounded-2xl border border-rental-border bg-rental-surface p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dados'}
            onClick={() => {
              setActiveTab('dados');
              setFeedbackBanner(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'dados'
                ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                : 'text-rental-muted hover:text-rental-ink'
            }`}
          >
            <User className="h-4 w-4" />
            <span>
              {role === 'professional'
                ? 'Dados & Perfil Profissional'
                : 'Dados Pessoais & Endereço'}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preferencias'}
            onClick={() => {
              setActiveTab('preferencias');
              setFeedbackBanner(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'preferencias'
                ? 'bg-rental-primary text-[var(--rs-primary-text)] shadow-sm'
                : 'text-rental-muted hover:text-rental-ink'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Preferências & Segurança</span>
          </button>
        </div>

        {/* Banner Global de Feedback (Sucesso / Erro) */}
        {feedbackBanner && (
          <div
            role="alert"
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs sm:text-sm font-semibold animate-fadeIn ${
              feedbackBanner.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                : 'border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 text-[var(--rs-error)]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              <span>{feedbackBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs underline opacity-80 hover:opacity-100"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ABA 1: Dados Cadastrais */}
        {activeTab === 'dados' && (
          <form
            onSubmit={handleSaveProfile}
            className="rounded-3xl border border-rental-border bg-rental-surface p-6 sm:p-8 shadow-panel space-y-6"
          >
            <div className="border-b border-rental-border pb-4">
              <h2 className="text-base sm:text-lg font-extrabold text-rental-ink flex items-center gap-2">
                <User className="h-5 w-5 text-rental-primary" />
                <span>Informações Principais</span>
              </h2>
              <p className="text-xs text-rental-muted mt-0.5">
                Mantenha seus dados cadastrais atualizados na plataforma RentalSpouse.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormFieldWrapper id="conta-nome" label="Nome Completo" required>
                  <TextInput
                    id="conta-nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    disabled={isSavingProfile}
                  />
                </FormFieldWrapper>
              </div>

              <div>
                <FormFieldWrapper
                  id="conta-email"
                  label="E-mail da Conta"
                  hint="Somente leitura"
                >
                  <TextInput
                    id="conta-email"
                    value={profile?.email || user.email}
                    disabled
                    leftIcon={<Mail className="h-4 w-4" />}
                  />
                </FormFieldWrapper>
              </div>

              {role === 'client' && (
                <>
                  <div>
                    <FormFieldWrapper
                      id="conta-cpf"
                      label="CPF Cadastrado"
                      hint="Protegido (LGPD)"
                    >
                      <TextInput
                        id="conta-cpf"
                        value={profile?.cpf || '***.***.***-**'}
                        disabled
                      />
                    </FormFieldWrapper>
                  </div>

                  <div>
                    <FormFieldWrapper id="conta-nascimento" label="Data de Nascimento">
                      <TextInput
                        id="conta-nascimento"
                        type="date"
                        value={dataNascimento}
                        onChange={(e) => setDataNascimento(e.target.value)}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>
                </>
              )}
            </div>

            {/* Seção de Endereço (Cliente) */}
            {role === 'client' && (
              <div className="space-y-4 pt-4 border-t border-rental-border">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-rental-ink flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-rental-primary" />
                    <span>Endereço Principal</span>
                  </h3>
                  <p className="text-xs text-rental-muted">
                    Endereço utilizado para solicitações de orçamento e visitas técnicas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-cep" label="CEP" required>
                      <TextInput
                        id="conta-cep"
                        value={cep}
                        onChange={(e) => setCep(maskCEP(e.target.value))}
                        placeholder="00000-000"
                        maxLength={9}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-4">
                    <FormFieldWrapper id="conta-logradouro" label="Logradouro" required>
                      <TextInput
                        id="conta-logradouro"
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                        placeholder="Rua, Avenida..."
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-numero" label="Número" required>
                      <TextInput
                        id="conta-numero"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="123"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-4">
                    <FormFieldWrapper id="conta-complemento" label="Complemento">
                      <TextInput
                        id="conta-complemento"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                        placeholder="Apto, Bloco, Casa (opcional)"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-bairro" label="Bairro" required>
                      <TextInput
                        id="conta-bairro"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                        placeholder="Bairro"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-3">
                    <FormFieldWrapper id="conta-cidade" label="Cidade" required>
                      <TextInput
                        id="conta-cidade"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        placeholder="Cidade"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-1">
                    <FormFieldWrapper id="conta-uf" label="UF" required>
                      <Select
                        id="conta-uf"
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                        options={VALID_UFS}
                        placeholder="UF"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>
                </div>
              </div>
            )}

            {/* Seção de Perfil Profissional (Profissional) */}
            {role === 'professional' && (
              <div className="space-y-4 pt-4 border-t border-rental-border">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-rental-ink flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-rental-primary" />
                    <span>Atuação & Perfil Público</span>
                  </h3>
                  <p className="text-xs text-rental-muted">
                    Dados exibidos na vitrine para clientes que buscam seus serviços.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-phone" label="Telefone / WhatsApp">
                      <TextInput
                        id="conta-phone"
                        value={phone}
                        onChange={(e) => setPhone(maskPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        maxLength={15}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-raio" label="Raio de Atendimento (km)" required>
                      <TextInput
                        id="conta-raio"
                        type="number"
                        min={1}
                        max={100}
                        value={String(serviceRadiusKm)}
                        onChange={(e) => setServiceRadiusKm(Number(e.target.value) || 1)}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-prof-cep" label="CEP">
                      <TextInput
                        id="conta-prof-cep"
                        value={cep}
                        onChange={(e) => setCep(maskCEP(e.target.value))}
                        placeholder="00000-000"
                        maxLength={9}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-4">
                    <FormFieldWrapper id="conta-prof-logradouro" label="Logradouro">
                      <TextInput
                        id="conta-prof-logradouro"
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                        placeholder="Rua, Avenida..."
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-prof-numero" label="Número">
                      <TextInput
                        id="conta-prof-numero"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="123"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-2">
                    <FormFieldWrapper id="conta-prof-bairro" label="Bairro">
                      <TextInput
                        id="conta-prof-bairro"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                        placeholder="Bairro"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-1">
                    <FormFieldWrapper id="conta-prof-city" label="Cidade">
                      <TextInput
                        id="conta-prof-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Cidade"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-1">
                    <FormFieldWrapper id="conta-prof-uf" label="UF">
                      <Select
                        id="conta-prof-uf"
                        value={stateUf}
                        onChange={(e) => setStateUf(e.target.value)}
                        options={VALID_UFS}
                        placeholder="UF"
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-6">
                    <FormFieldWrapper
                      id="conta-especialidades"
                      label="Especialidades"
                      required
                    >
                      <SpecialtiesChips
                        id="conta-especialidades"
                        value={specialties}
                        onChange={setSpecialties}
                        disabled={isSavingProfile}
                      />
                    </FormFieldWrapper>
                  </div>

                  <div className="sm:col-span-6">
                    <FormFieldWrapper
                      id="conta-bio"
                      label="Biografia e Apresentação"
                      required
                      hint="Mínimo 10 caracteres"
                    >
                      <textarea
                        id="conta-bio"
                        rows={4}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        disabled={isSavingProfile}
                        placeholder="Descreva sua experiência e os serviços realizados..."
                        className="glass-input w-full rounded-xl p-3.5 text-sm font-medium text-rental-ink focus:outline-none"
                      />
                    </FormFieldWrapper>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-rental-border">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSavingProfile}
                loadingText="Salvando alterações..."
                leftIcon={<Save className="h-4 w-4" />}
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        )}

        {/* ABA 2: Preferências e Segurança */}
        {activeTab === 'preferencias' && (
          <div className="space-y-6">
            {/* Preferência de Tema */}
            <section className="rounded-3xl border border-rental-border bg-rental-surface p-6 sm:p-8 shadow-panel space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-rental-ink">
                  Aparência e Tema da Interface
                </h2>
                <p className="text-xs text-rental-muted mt-0.5">
                  Escolha entre o tema claro ou escuro. Sua preferência é salva automaticamente neste navegador.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    theme === 'light'
                      ? 'border-rental-primary bg-rental-primary/10 text-rental-primary'
                      : 'border-rental-border bg-rental-surface2/40 text-rental-ink hover:border-rental-primary/40'
                  }`}
                >
                  <Sun className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="block text-sm font-bold">Tema Claro</span>
                    <span className="block text-xs text-rental-muted">
                      Visual luminoso de alto contraste diurno
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    theme === 'dark'
                      ? 'border-rental-primary bg-rental-primary/10 text-rental-primary'
                      : 'border-rental-border bg-rental-surface2/40 text-rental-ink hover:border-rental-primary/40'
                  }`}
                >
                  <Moon className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="block text-sm font-bold">Tema Escuro</span>
                    <span className="block text-xs text-rental-muted">
                      Conforto visual e menor emissão de luz
                    </span>
                  </div>
                </button>
              </div>
            </section>

            {/* Alteração de Senha */}
            <form
              onSubmit={handleSavePassword}
              className="rounded-3xl border border-rental-border bg-rental-surface p-6 sm:p-8 shadow-panel space-y-5"
            >
              <div className="border-b border-rental-border pb-4">
                <h2 className="text-base sm:text-lg font-extrabold text-rental-ink flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-rental-primary" />
                  <span>Alterar Senha de Acesso</span>
                </h2>
                <p className="text-xs text-rental-muted mt-0.5">
                  Para sua segurança, confirme sua senha atual antes de definir uma nova credencial.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormFieldWrapper id="senha-atual" label="Senha Atual" required>
                  <PasswordInput
                    id="senha-atual"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    placeholder="••••••••"
                    disabled={isSavingPassword}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper
                  id="nova-senha"
                  label="Nova Senha"
                  required
                  hint="Mín. 8 caracteres"
                >
                  <PasswordInput
                    id="nova-senha"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Nova senha segura"
                    disabled={isSavingPassword}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper
                  id="confirmar-nova-senha"
                  label="Confirmar Nova Senha"
                  required
                >
                  <PasswordInput
                    id="confirmar-nova-senha"
                    value={confirmarNovaSenha}
                    onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                    disabled={isSavingPassword}
                  />
                </FormFieldWrapper>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSavingPassword}
                  loadingText="Atualizando senha..."
                  leftIcon={<Lock className="h-4 w-4" />}
                >
                  Atualizar Senha
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
