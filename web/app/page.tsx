'use client';

import { useEffect, useState } from 'react';

interface StatusResponse {
  id: number;
  message: string;
}

interface Professional {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  bio: string;
  service_radius_km: number;
  specialties: string[];
  city?: string | null;
  state?: string | null;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_SPECIALTIES = [
  'Elétrica',
  'Encanamento',
  'Hidráulica',
  'Pintura',
  'Montagem de Móveis',
  'Marcenaria',
  'Alvenaria',
  'Reparos Gerais',
  'Jardinagem',
  'Ar-Condicionado',
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'profile' | 'explore' | 'status'>('profile');

  // Backend Status state
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service_radius_km: 10,
    bio: '',
    city: '',
    state: 'SP',
  });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(['Reparos Gerais']);
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdProfile, setCreatedProfile] = useState<Professional | null>(null);

  // Explore / List state
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

  const fetchStatus = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch(`${apiUrl}/api/hello`);
      if (!res.ok) {
        throw new Error(`Erro na requisição: ${res.status} ${res.statusText}`);
      }
      const result: StatusResponse = await res.json();
      setStatusData(result);
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : `Não foi possível conectar ao backend em ${apiUrl}`
      );
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchProfessionals = async () => {
    setExploreLoading(true);
    setExploreError(null);
    try {
      const params = new URLSearchParams();
      if (filterSpecialty.trim()) params.append('specialty', filterSpecialty.trim());
      if (filterCity.trim()) params.append('city', filterCity.trim());

      const url = `${apiUrl}/api/professionals?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Erro ao buscar profissionais: ${res.status}`);
      }
      const data: Professional[] = await res.json();
      setProfessionals(data);
    } catch (err) {
      setExploreError(
        err instanceof Error ? err.message : 'Erro ao listar profissionais.'
      );
    } finally {
      setExploreLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'explore') {
      fetchProfessionals();
    }
  }, [activeTab]);

  const toggleSpecialty = (item: string) => {
    if (selectedSpecialties.includes(item)) {
      if (selectedSpecialties.length > 1) {
        setSelectedSpecialties(selectedSpecialties.filter((s) => s !== item));
      }
    } else {
      setSelectedSpecialties([...selectedSpecialties, item]);
    }
  };

  const handleAddCustomSpecialty = () => {
    const trimmed = customSpecialty.trim();
    if (trimmed && !selectedSpecialties.includes(trimmed)) {
      setSelectedSpecialties([...selectedSpecialties, trimmed]);
      setCustomSpecialty('');
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setCreatedProfile(null);

    if (formData.service_radius_km < 1) {
      setSubmitError('O raio de atendimento deve ser de no mínimo 1 km.');
      setSubmitLoading(false);
      return;
    }

    if (selectedSpecialties.length === 0) {
      setSubmitError('Selecione pelo menos uma especialidade.');
      setSubmitLoading(false);
      return;
    }

    if (formData.bio.trim().length < 10) {
      setSubmitError('A bio para o cliente deve ter pelo menos 10 caracteres.');
      setSubmitLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        bio: formData.bio.trim(),
        service_radius_km: Number(formData.service_radius_km),
        specialties: selectedSpecialties,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
      };

      const res = await fetch(`${apiUrl}/api/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();
      if (!res.ok) {
        throw new Error(responseData.detail || 'Falha ao cadastrar perfil profissional.');
      }

      setCreatedProfile(responseData);
      // Limpa campos
      setFormData({
        name: '',
        email: '',
        phone: '',
        service_radius_km: 10,
        bio: '',
        city: '',
        state: 'SP',
      });
      setSelectedSpecialties(['Reparos Gerais']);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao cadastrar perfil.');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Navbar Superior */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-200">
              R
            </span>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-slate-900 block leading-tight">
                RentalSpouse
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Marido de Aluguel & Serviços Residenciais
              </span>
            </div>
          </div>

          {/* Navegação de Abas */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Criar Perfil Profissional
            </button>
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'explore'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Buscar Profissionais
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'status'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Status da API
            </button>
          </nav>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ABA 1: CRIAR PERFIL PROFISSIONAL */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                História #2 • Perfil do Profissional
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
                Cadastre seu perfil de prestador
              </h2>
              <p className="text-slate-600 text-sm mt-1 max-w-2xl">
                Configure suas especialidades, raio de atuação em quilômetros e apresente uma biografia profissional para ser encontrado pelos clientes ideais.
              </p>
            </div>

            {/* Alerta de Sucesso */}
            {createdProfile && (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-bold text-emerald-800 text-base">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                      ✓
                    </span>
                    Perfil criado com sucesso!
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">
                    Profissional <strong>{createdProfile.name}</strong> registrado com raio de{' '}
                    <strong>{createdProfile.service_radius_km} km</strong> e {createdProfile.specialties.length} especialidade(s).
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('explore');
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shrink-0"
                >
                  Ver no Diretório
                </button>
              </div>
            )}

            {/* Alerta de Erro */}
            {submitError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* Formulário */}
            <form
              onSubmit={handleCreateProfile}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    E-mail Comercial *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Ex: joao.silva@exemplo.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (11) 98765-4321"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                {/* Raio de Atendimento */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Raio de Atendimento (em km) *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      required
                      min={1}
                      max={500}
                      step={1}
                      value={formData.service_radius_km}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          service_radius_km: Number(e.target.value),
                        })
                      }
                      className="w-28 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={formData.service_radius_km}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          service_radius_km: Number(e.target.value),
                        })
                      }
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-500 shrink-0">
                      {formData.service_radius_km} km
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Defina o raio máximo (mínimo de 1 km) que você se desloca para atender clientes.
                  </span>
                </div>

                {/* Cidade */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Cidade Base
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Estado */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Ex: SP"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Especialidades */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Especialidades e Habilidades *
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Clique nas especialidades que você domina para adicioná-las ao seu perfil.
                </p>

                <div className="flex flex-wrap gap-2 mb-3">
                  {DEFAULT_SPECIALTIES.map((spec) => {
                    const isSelected = selectedSpecialties.includes(spec);
                    return (
                      <button
                        type="button"
                        key={spec}
                        onClick={() => toggleSpecialty(spec)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {spec}
                      </button>
                    );
                  })}
                </div>

                {/* Adicionar especialidade customizada */}
                <div className="flex gap-2 max-w-sm">
                  <input
                    type="text"
                    placeholder="Outra especialidade..."
                    value={customSpecialty}
                    onChange={(e) => setCustomSpecialty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSpecialty();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSpecialty}
                    className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900 transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Bio para o cliente */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Bio para os Clientes *
                </label>
                <textarea
                  required
                  rows={4}
                  minLength={10}
                  maxLength={2000}
                  placeholder="Conte sua experiência, tipos de serviços executados, pontualidade, garantia ou diferenciais para conquistar o cliente..."
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>Mínimo de 10 caracteres.</span>
                  <span>{formData.bio.length} / 2000</span>
                </div>
              </div>

              {/* Botão de Envio */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
                >
                  {submitLoading && (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Salvar Perfil Profissional
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ABA 2: BUSCAR PROFISSIONAIS */}
        {activeTab === 'explore' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Profissionais Disponíveis
                </h2>
                <p className="text-slate-600 text-xs mt-0.5">
                  Consulte os profissionais cadastrados por especialidade e raio de atendimento.
                </p>
              </div>
              <button
                onClick={fetchProfessionals}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shrink-0"
              >
                Atualizar Lista
              </button>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Filtrar por especialidade (ex: Elétrica)..."
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchProfessionals()}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Filtrar por cidade..."
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchProfessionals()}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Lista com Estados (Loading, Error, Empty, Data) */}
            {exploreLoading && (
              <div className="py-16 text-center text-slate-500">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs font-semibold">Buscando profissionais...</p>
              </div>
            )}

            {!exploreLoading && exploreError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center text-red-600 text-xs">
                <p className="font-semibold mb-2">{exploreError}</p>
                <button
                  onClick={fetchProfessionals}
                  className="px-3 py-1 bg-red-600 text-white rounded text-xs"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!exploreLoading && !exploreError && professionals.length === 0 && (
              <div className="py-16 bg-white rounded-2xl border border-dashed border-slate-300 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 text-xl mb-3">
                  🔍
                </div>
                <h3 className="text-sm font-bold text-slate-700">
                  Nenhum profissional encontrado
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Seja o primeiro a cadastrar seu perfil na aba "Criar Perfil Profissional"!
                </p>
              </div>
            )}

            {!exploreLoading && !exploreError && professionals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {professionals.map((prof) => (
                  <div
                    key={prof.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">
                            {prof.name}
                          </h3>
                          <span className="text-[11px] text-slate-500">
                            {prof.city ? `${prof.city} - ${prof.state || 'BR'}` : 'Localização a combinar'}
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 shrink-0">
                          Raio: {prof.service_radius_km} km
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mb-4 line-clamp-3 leading-relaxed">
                        {prof.bio}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {prof.specialties.map((spec, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>{prof.email}</span>
                      {prof.phone && <span className="font-semibold">{prof.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 3: STATUS DA API */}
        {activeTab === 'status' && (
          <div className="flex items-center justify-center py-12">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 flex flex-col items-center text-center">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 tracking-wide uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  RentalSpouse Health
                </span>
                <h1 className="text-2xl font-bold mt-3 tracking-tight text-slate-900">
                  Status do Backend
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Comunicação FastAPI + PostgreSQL + Next.js
                </p>
              </div>

              <div className="w-full min-h-[140px] flex items-center justify-center">
                {statusLoading && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-slate-600 animate-pulse">
                      Carregando...
                    </p>
                  </div>
                )}

                {!statusLoading && statusError && (
                  <div className="flex flex-col items-center gap-3 text-red-600">
                    <p className="text-sm text-center font-medium">{statusError}</p>
                    <button
                      onClick={fetchStatus}
                      className="mt-1 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                {!statusLoading && !statusError && statusData && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                      ✓
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-semibold text-slate-800">
                        {statusData.message}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">
                        Registro ID: #{statusData.id}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>GET /api/hello</span>
                <span>Port 8000</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
