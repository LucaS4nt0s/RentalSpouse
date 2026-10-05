export type DocumentType =
  | 'photo_id'
  | 'proof_of_residence'
  | 'technical_certificate'
  | 'profile_photo';

export type ProfessionalApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected';

export interface ProfessionalDocument {
  id: number;
  professional_id: number;
  document_type: DocumentType;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  download_url?: string;
}

export interface ProfessionalDocumentsSummary {
  professional_id: number;
  approval_status: ProfessionalApprovalStatus | string;
  approval_notes?: string | null;
  has_photo_id: boolean;
  has_proof_of_residence: boolean;
  has_technical_certificate: boolean;
  has_profile_photo: boolean;
  is_complete: boolean;
  submitted_at?: string | null;
  can_submit: boolean;
  missing_required: DocumentType[];
  documents: ProfessionalDocument[];
}

export interface DocumentTypeMeta {
  type: DocumentType;
  title: string;
  description: string;
  required: boolean;
  acceptedFormatsText: string;
  acceptMimeTypes: string;
}

export const DOCUMENT_TYPES_CONFIG: Record<DocumentType, DocumentTypeMeta> = {
  photo_id: {
    type: 'photo_id',
    title: 'Documento de Identidade com Foto',
    description: 'RG, CNH ou Carteira Profissional válida com foto nítida.',
    required: true,
    acceptedFormatsText: 'PDF, JPG, PNG ou WebP (máx. 10 MB)',
    acceptMimeTypes: 'application/pdf,image/jpeg,image/png,image/webp',
  },
  proof_of_residence: {
    type: 'proof_of_residence',
    title: 'Comprovante de Residência',
    description: 'Conta de água, luz, gás ou telefone recente (últimos 3 meses).',
    required: true,
    acceptedFormatsText: 'PDF, JPG, PNG ou WebP (máx. 10 MB)',
    acceptMimeTypes: 'application/pdf,image/jpeg,image/png,image/webp',
  },
  technical_certificate: {
    type: 'technical_certificate',
    title: 'Certificado Técnico / Especialização',
    description: 'Comprovante de cursos, certificações técnicas ou registros de classe.',
    required: false,
    acceptedFormatsText: 'PDF, JPG, PNG ou WebP (máx. 10 MB)',
    acceptMimeTypes: 'application/pdf,image/jpeg,image/png,image/webp',
  },
  profile_photo: {
    type: 'profile_photo',
    title: 'Foto de Perfil',
    description: 'Foto recente de rosto com boa iluminação para exibição no seu perfil público.',
    required: false,
    acceptedFormatsText: 'JPG, PNG ou WebP (máx. 10 MB)',
    acceptMimeTypes: 'image/jpeg,image/png,image/webp',
  },
};
