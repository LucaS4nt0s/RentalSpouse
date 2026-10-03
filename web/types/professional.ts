/**
 * Tipagens TypeScript para o diretório e busca de profissionais.
 * Em conformidade com PRD_Frontend_Busca_Profissionais.md e AI_RULES.md.
 */

export interface Professional {
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
  created_at?: string;
  updated_at?: string;
}

export interface ProfessionalSearchParams {
  specialty?: string;
  city?: string;
  q?: string;
  skip?: number;
  limit?: number;
}

export interface SpecialtyCategory {
  id: string;
  label: string;
  iconName: string;
}
