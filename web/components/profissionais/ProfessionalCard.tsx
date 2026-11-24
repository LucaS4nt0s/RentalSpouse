'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, MapPin, MessageSquare, Calendar, Flag, Star } from 'lucide-react';
import { Professional } from '../../types/professional';
import { formatarMediaNotas } from '../../types/avaliacoes';

export interface ProfessionalRatingSummary {
  media_notas: number;
  total_avaliacoes: number;
}

export interface ProfessionalCardProps {
  professional: Professional;
  activeSpecialty?: string;
  onSpecialtyClick?: (specialty: string) => void;
  onRequestQuote?: (professional: Professional) => void;
  /** Abre o modal de perfil detalhado do profissional (issue #96). */
  onViewProfile?: (professional: Professional) => void;
  /** Abre o modal de avaliações e comentários do profissional (issue #21). */
  onViewReviews?: (professional: Professional) => void;
  /** Resumo de reputação já carregado para exibição imediata no card (issue #21). */
  ratingSummary?: ProfessionalRatingSummary;
  /** Abre o fluxo de denúncia do profissional (issue #68). */
  onReportProfessional?: (professional: Professional) => void;
  /** Rota para a tela de agendamento do profissional (issue #79). */
  scheduleHref?: string;
}

export const ProfessionalCard: React.FC<ProfessionalCardProps> = ({
  professional,
  activeSpecialty,
  onSpecialtyClick,
  onRequestQuote,
  onViewProfile,
  onViewReviews,
  ratingSummary,
  onReportProfessional,
  scheduleHref,
}) => {
  // Iniciais do nome para o avatar caso não haja foto
  const getInitials = (name: string) => {
    if (!name) return 'RS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(professional.name);

  // Localização formatada
  const locationText = [
    professional.city,
    professional.state ? professional.state.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  const radiusText = professional.service_radius_km
    ? `Raio de ${Math.round(professional.service_radius_km)} km`
    : null;

  const fullLocation = [locationText, radiusText].filter(Boolean).join(' • ');

  // Specialties
  const specialties = professional.specialties || [];
  const displayedSpecialties = specialties.slice(0, 3);
  const remainingCount = specialties.length - displayedSpecialties.length;

  // Resumo de avaliações (vindo da prop cached ou do próprio objeto Professional)
  const mediaNotas =
    ratingSummary?.media_notas ??
    (typeof professional.average_rating === 'number'
      ? professional.average_rating
      : null);
  const totalAvaliacoes =
    ratingSummary?.total_avaliacoes ??
    (typeof professional.reviews_count === 'number'
      ? professional.reviews_count
      : null);
  const temAvaliacoes =
    mediaNotas !== null && totalAvaliacoes !== null && totalAvaliacoes > 0;

  const handleOpenProfile = () => {
    if (onViewProfile) {
      onViewProfile(professional);
    }
  };

  const handleProfileKeyDown = (e: React.KeyboardEvent) => {
    if (!onViewProfile) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onViewProfile(professional);
    }
  };

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-2xl glass-panel p-5 transition-all duration-300 hover:border-rental-primary/40 hover:shadow-lg animate-fadeIn">
      <div>
        {/* Cabeçalho do Card: Avatar, Nome, Verificado e Denunciar */}
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={handleOpenProfile}
            disabled={!onViewProfile}
            aria-label={`Ver perfil completo de ${professional.name}`}
            className={`flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -m-1.5 p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-rental-primary/50 ${
              onViewProfile ? 'cursor-pointer hover:bg-rental-surface2/60' : 'cursor-default'
            }`}
          >
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-base transition-transform duration-300 group-hover:scale-105">
              <span>{initials}</span>
              {professional.approval_status === 'approved' && (
                <span
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rental-surface text-rental-success ring-1 ring-rental-border"
                  title="Profissional Verificado pelo RentalSpouse"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-rental-ink text-base truncate group-hover:text-rental-primary transition-colors">
                {professional.name}
              </h3>
              {fullLocation && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-rental-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-rental-primary/80" />
                  <span className="truncate">{fullLocation}</span>
                </div>
              )}
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {onViewReviews && (
              <button
                type="button"
                onClick={() => onViewReviews(professional)}
                title={`Ver avaliações e comentários de ${professional.name}`}
                aria-label={`Ver avaliações e comentários de ${professional.name}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600 transition-all hover:bg-amber-500/20 active:scale-[0.98]"
              >
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {temAvaliacoes ? (
                  <>
                    <span>{formatarMediaNotas(mediaNotas)}</span>
                    <span className="font-medium opacity-80">
                      ({totalAvaliacoes})
                    </span>
                  </>
                ) : (
                  <span>Avaliar</span>
                )}
              </button>
            )}

            {onReportProfessional && (
              <button
                type="button"
                onClick={() => onReportProfessional(professional)}
                title="Denunciar este profissional"
                aria-label={`Denunciar ${professional.name}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-rental-muted/70 transition-colors hover:bg-[var(--rs-error)]/10 hover:text-[var(--rs-error)] active:scale-95"
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Chips de Especialidades */}
        <div className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Especialidades do profissional">
          {displayedSpecialties.map((spec) => {
            const isHighlighted =
              activeSpecialty &&
              spec.toLowerCase() === activeSpecialty.toLowerCase();

            return (
              <button
                key={spec}
                type="button"
                onClick={() => onSpecialtyClick && onSpecialtyClick(spec)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  isHighlighted
                    ? 'bg-rental-primary text-white font-semibold shadow-sm'
                    : 'bg-rental-surface2 text-rental-muted border border-rental-border hover:border-rental-primary/40 hover:text-rental-ink'
                }`}
              >
                {spec}
              </button>
            );
          })}
          {remainingCount > 0 && (
            <button
              type="button"
              onClick={handleOpenProfile}
              disabled={!onViewProfile}
              className={`rounded-lg bg-rental-surface2 px-2 py-1 text-[11px] font-medium text-rental-muted border border-rental-border transition-colors ${
                onViewProfile ? 'cursor-pointer hover:border-rental-primary/40 hover:text-rental-primary' : ''
              }`}
              title={`Ver mais ${remainingCount} especialidade(s) no perfil`}
            >
              +{remainingCount}
            </button>
          )}
        </div>

        {/* Biografia Resumida clicável (abre perfil completo) */}
        <div
          role={onViewProfile ? 'button' : undefined}
          tabIndex={onViewProfile ? 0 : undefined}
          onClick={onViewProfile ? handleOpenProfile : undefined}
          onKeyDown={onViewProfile ? handleProfileKeyDown : undefined}
          aria-label={onViewProfile ? `Abrir perfil completo de ${professional.name}` : undefined}
          className={`mt-3 rounded-xl -mx-1.5 px-1.5 py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-rental-primary/50 ${
            onViewProfile ? 'cursor-pointer hover:bg-rental-surface2/50' : ''
          }`}
        >
          <p className="text-xs text-rental-muted leading-relaxed line-clamp-3">
            {professional.bio || 'Profissional qualificado disponível para serviços residenciais.'}
          </p>
          {onViewProfile && (
            <span className="mt-1.5 inline-block text-[11px] font-semibold text-rental-primary group-hover:underline">
              Ver perfil completo →
            </span>
          )}
        </div>
      </div>

      {/* Ações do Card */}
      <div className="mt-5 pt-3 border-t border-rental-border/60 grid grid-cols-[auto_1fr] items-center gap-2">
        <Link
          href={scheduleHref ?? `/profissionais/${professional.id}/agendar`}
          aria-label={`Agendar atendimento com ${professional.name}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rental-primary/40 bg-rental-primary/10 px-3.5 py-2.5 text-xs font-bold text-rental-primary transition-all hover:bg-rental-primary hover:text-white active:scale-[0.98]"
        >
          <Calendar className="h-4 w-4 shrink-0" />
          <span>Agendar</span>
        </Link>

        <button
          type="button"
          onClick={() => onRequestQuote && onRequestQuote(professional)}
          className="min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rental-primary px-3.5 py-2.5 text-xs font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] active:scale-[0.98]"
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="truncate">Solicitar Orçamento</span>
        </button>
      </div>
    </article>
  );
};
