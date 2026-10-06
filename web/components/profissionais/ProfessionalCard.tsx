'use client';

import React from 'react';
import { ShieldCheck, MapPin, MessageSquare, ArrowRight, User } from 'lucide-react';
import { Professional } from '../../types/professional';

export interface ProfessionalCardProps {
  professional: Professional;
  activeSpecialty?: string;
  onSpecialtyClick?: (specialty: string) => void;
  onRequestQuote?: (professional: Professional) => void;
}

export const ProfessionalCard: React.FC<ProfessionalCardProps> = ({
  professional,
  activeSpecialty,
  onSpecialtyClick,
  onRequestQuote,
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

  return (
    <article className="group flex flex-col justify-between rounded-2xl glass-panel p-5 transition-all duration-300 hover:border-rental-primary/40 hover:shadow-lg animate-fadeIn">
      <div>
        {/* Cabeçalho do Card: Avatar, Nome e Selo de Verificado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-base transition-transform duration-300 group-hover:scale-105">
              <span>{initials}</span>
            </div>

            <div className="min-w-0">
              <h3 className="font-bold text-rental-ink text-base line-clamp-1 group-hover:text-rental-primary transition-colors">
                {professional.name}
              </h3>
              {fullLocation && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-rental-muted line-clamp-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-rental-primary/80" />
                  <span>{fullLocation}</span>
                </div>
              )}
            </div>
          </div>

          {professional.approval_status === 'approved' && (
            <div
              className="flex items-center gap-1 rounded-full bg-rental-success/10 px-2 py-0.5 text-[11px] font-semibold text-rental-success shrink-0"
              title="Profissional Verificado pelo RentalSpouse"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Verificado</span>
            </div>
          )}
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
            <span
              className="rounded-lg bg-rental-surface2 px-2 py-1 text-[11px] font-medium text-rental-muted border border-rental-border"
              title={`${remainingCount} outras especialidades`}
            >
              +{remainingCount}
            </span>
          )}
        </div>

        {/* Biografia Resumida (line-clamp-3) */}
        <p className="mt-3 text-xs text-rental-muted leading-relaxed line-clamp-3">
          {professional.bio || 'Profissional qualificado disponível para serviços residenciais.'}
        </p>
      </div>

      {/* Ações do Card */}
      <div className="mt-5 pt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRequestQuote && onRequestQuote(professional)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary transition-all hover:bg-[var(--rs-primary-hover)] active:scale-[0.98]"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Solicitar Orçamento</span>
        </button>
      </div>
    </article>
  );
};
