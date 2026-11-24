import { ProfessionalDocument, ProfessionalApprovalStatus } from './professionalDocuments';

export type ModerationStatusFilter = 'pending_approval' | 'approved' | 'rejected' | 'all';

export interface ProfessionalModerationItem {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  specialties: string[];
  approval_status: ProfessionalApprovalStatus | string;
  approval_notes?: string | null;
  documents_submitted_at?: string | null;
  approved_at?: string | null;
  approved_by_id?: number | null;
  created_at: string;
  updated_at: string;
  documents_count: number;
  has_photo_id: boolean;
  has_proof_of_residence: boolean;
  has_technical_certificate: boolean;
  has_profile_photo: boolean;
  is_complete: boolean;
}

export interface ProfessionalModerationReview {
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
  approval_status: ProfessionalApprovalStatus | string;
  approval_notes?: string | null;
  documents_submitted_at?: string | null;
  approved_at?: string | null;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  created_at: string;
  updated_at: string;
  is_complete: boolean;
  documents: ProfessionalDocument[];
}

export interface ProfessionalModerationDecision {
  id: number;
  name: string;
  email: string;
  approval_status: ProfessionalApprovalStatus | string;
  approval_notes?: string | null;
  approved_at?: string | null;
  approved_by_id?: number | null;
  updated_at: string;
  message: string;
}

export interface ProfessionalRejectPayload {
  reason: string;
}
