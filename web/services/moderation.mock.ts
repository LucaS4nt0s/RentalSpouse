import {
  ModerationStatusFilter,
  ProfessionalModerationDecision,
  ProfessionalModerationItem,
  ProfessionalModerationReview,
  ProfessionalRejectPayload,
} from '../types/moderation';
import { ProfessionalDocument } from '../types/professionalDocuments';

const MOCK_MODERATION_STORAGE_KEY = 'rentalspouse_mock_moderation_data';

interface MockModerationRecord {
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
  approval_status: string;
  approval_notes?: string | null;
  documents_submitted_at?: string | null;
  approved_at?: string | null;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  created_at: string;
  updated_at: string;
  documents: ProfessionalDocument[];
}

function getInitialMockRecords(): MockModerationRecord[] {
  const now = new Date();
  const sub1 = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h atrás
  const sub2 = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30m atrás
  const appDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 101,
      name: 'Marcos Silva Santos',
      email: 'marcos.eletrica@gmail.com',
      phone: '(11) 98765-4321',
      bio: 'Eletricista residencial com mais de 8 anos de experiência em reparos de quadros, tomadas e cabeamento.',
      service_radius_km: 20,
      specialties: ['Elétrica', 'Reparos Gerais'],
      city: 'São Paulo',
      state: 'SP',
      is_active: true,
      approval_status: 'pending_approval',
      approval_notes: null,
      documents_submitted_at: sub1,
      approved_at: null,
      approved_by_id: null,
      approved_by_name: null,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: sub1,
      documents: [
        {
          id: 201,
          professional_id: 101,
          document_type: 'photo_id',
          file_name: 'cnh_marcos_frente_verso.pdf',
          file_size: 1450000,
          mime_type: 'application/pdf',
          uploaded_at: sub1,
          download_url: 'https://placehold.co/800x600.png?text=CNH+Marcos',
        },
        {
          id: 202,
          professional_id: 101,
          document_type: 'proof_of_residence',
          file_name: 'comprovante_enel_setembro.pdf',
          file_size: 890000,
          mime_type: 'application/pdf',
          uploaded_at: sub1,
          download_url: 'https://placehold.co/800x600.png?text=Comprovante+Residencia',
        },
        {
          id: 203,
          professional_id: 101,
          document_type: 'technical_certificate',
          file_name: 'certificado_nr10_senai.pdf',
          file_size: 2100000,
          mime_type: 'application/pdf',
          uploaded_at: sub1,
          download_url: 'https://placehold.co/800x600.png?text=Certificado+NR10',
        },
      ],
    },
    {
      id: 102,
      name: 'Juliana Oliveira Mendes',
      email: 'juliana.pintura@hotmail.com',
      phone: '(21) 99887-1122',
      bio: 'Pintura residencial fina, restauração de texturas, grafiato e aplicação de papel de parede.',
      service_radius_km: 15,
      specialties: ['Pintura'],
      city: 'Rio de Janeiro',
      state: 'RJ',
      is_active: true,
      approval_status: 'pending_approval',
      approval_notes: null,
      documents_submitted_at: sub2,
      approved_at: null,
      approved_by_id: null,
      approved_by_name: null,
      created_at: '2026-10-05T14:30:00Z',
      updated_at: sub2,
      documents: [
        {
          id: 204,
          professional_id: 102,
          document_type: 'photo_id',
          file_name: 'rg_frente_verso.jpg',
          file_size: 980000,
          mime_type: 'image/jpeg',
          uploaded_at: sub2,
          download_url: 'https://placehold.co/800x600.png?text=RG+Juliana',
        },
        {
          id: 205,
          professional_id: 102,
          document_type: 'proof_of_residence',
          file_name: 'conta_gas_juliana.pdf',
          file_size: 750000,
          mime_type: 'application/pdf',
          uploaded_at: sub2,
          download_url: 'https://placehold.co/800x600.png?text=Conta+Gas',
        },
      ],
    },
    {
      id: 103,
      name: 'Roberto Souza Costa',
      email: 'roberto.clima@gmail.com',
      phone: '(19) 97123-4567',
      bio: 'Instalação e higienização de ar-condicionado split e inverter com garantia de 1 ano.',
      service_radius_km: 30,
      specialties: ['Ar-condicionado'],
      city: 'Campinas',
      state: 'SP',
      is_active: true,
      approval_status: 'approved',
      approval_notes: null,
      documents_submitted_at: appDate,
      approved_at: appDate,
      approved_by_id: 1,
      approved_by_name: 'Administrador Inicial',
      created_at: '2026-09-20T08:00:00Z',
      updated_at: appDate,
      documents: [
        {
          id: 206,
          professional_id: 103,
          document_type: 'photo_id',
          file_name: 'cnh_roberto.pdf',
          file_size: 1200000,
          mime_type: 'application/pdf',
          uploaded_at: appDate,
          download_url: 'https://placehold.co/800x600.png?text=CNH+Roberto',
        },
        {
          id: 207,
          professional_id: 103,
          document_type: 'proof_of_residence',
          file_name: 'conta_luz.pdf',
          file_size: 650000,
          mime_type: 'application/pdf',
          uploaded_at: appDate,
          download_url: 'https://placehold.co/800x600.png?text=Conta+Luz',
        },
      ],
    },
  ];
}

function loadRecords(): MockModerationRecord[] {
  if (typeof window === 'undefined') {
    return getInitialMockRecords();
  }
  try {
    const raw = localStorage.getItem(MOCK_MODERATION_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Erro ao carregar dados mock de moderação:', err);
  }
  const initial = getInitialMockRecords();
  saveRecords(initial);
  return initial;
}

function saveRecords(records: MockModerationRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MOCK_MODERATION_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Erro ao salvar dados mock de moderação:', err);
  }
}

function toModerationItem(r: MockModerationRecord): ProfessionalModerationItem {
  const docTypes = new Set(r.documents.map((d) => d.document_type));
  const has_photo_id = docTypes.has('photo_id');
  const has_proof_of_residence = docTypes.has('proof_of_residence');
  const has_technical_certificate = docTypes.has('technical_certificate');
  const has_profile_photo = docTypes.has('profile_photo');
  const is_complete = has_photo_id && has_proof_of_residence;

  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    state: r.state,
    specialties: r.specialties,
    approval_status: r.approval_status,
    approval_notes: r.approval_notes,
    documents_submitted_at: r.documents_submitted_at,
    approved_at: r.approved_at,
    approved_by_id: r.approved_by_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    documents_count: r.documents.length,
    has_photo_id,
    has_proof_of_residence,
    has_technical_certificate,
    has_profile_photo,
    is_complete,
  };
}

export async function listPendingProfessionals(
  skip = 0,
  limit = 50
): Promise<ProfessionalModerationItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const records = loadRecords();
  return records
    .filter(
      (r) =>
        r.approval_status === 'pending_approval' && r.documents_submitted_at !== null
    )
    .sort((a, b) => {
      const ta = new Date(a.documents_submitted_at || 0).getTime();
      const tb = new Date(b.documents_submitted_at || 0).getTime();
      return ta - tb;
    })
    .slice(skip, skip + limit)
    .map(toModerationItem);
}

export async function listProfessionals(
  statusFilter?: ModerationStatusFilter,
  skip = 0,
  limit = 50
): Promise<ProfessionalModerationItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const records = loadRecords();
  let filtered = records;
  if (statusFilter && statusFilter !== 'all') {
    filtered = records.filter((r) => r.approval_status === statusFilter);
  }
  return filtered
    .sort((a, b) => {
      const ta = new Date(a.documents_submitted_at || a.created_at).getTime();
      const tb = new Date(b.documents_submitted_at || b.created_at).getTime();
      return tb - ta;
    })
    .slice(skip, skip + limit)
    .map(toModerationItem);
}

export async function getProfessionalReview(
  professionalId: number
): Promise<ProfessionalModerationReview> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const records = loadRecords();
  const found = records.find((r) => r.id === professionalId);
  if (!found) {
    throw new Error('Profissional não encontrado.');
  }

  const docTypes = new Set(found.documents.map((d) => d.document_type));
  const is_complete =
    docTypes.has('photo_id') && docTypes.has('proof_of_residence');

  return {
    ...found,
    is_complete,
  };
}

export async function approveProfessional(
  professionalId: number
): Promise<ProfessionalModerationDecision> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === professionalId);
  if (idx === -1) {
    throw new Error('Profissional não encontrado.');
  }

  const prof = records[idx];
  if (prof.approval_status === 'approved') {
    throw new Error('O profissional já se encontra com cadastro aprovado.');
  }

  const docTypes = new Set(prof.documents.map((d) => d.document_type));
  if (!docTypes.has('photo_id') || !docTypes.has('proof_of_residence')) {
    throw new Error(
      'Não é possível aprovar: documentos obrigatórios ausentes.'
    );
  }

  const now = new Date().toISOString();
  prof.approval_status = 'approved';
  prof.approved_at = now;
  prof.approved_by_id = 1;
  prof.approved_by_name = 'Admin (Mock)';
  prof.approval_notes = null;
  prof.updated_at = now;

  saveRecords(records);

  return {
    id: prof.id,
    name: prof.name,
    email: prof.email,
    approval_status: prof.approval_status,
    approval_notes: null,
    approved_at: prof.approved_at,
    approved_by_id: prof.approved_by_id,
    updated_at: prof.updated_at,
    message: 'Cadastro e documentos do profissional aprovados com sucesso.',
  };
}

export async function rejectProfessional(
  professionalId: number,
  payload: ProfessionalRejectPayload
): Promise<ProfessionalModerationDecision> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === professionalId);
  if (idx === -1) {
    throw new Error('Profissional não encontrado.');
  }

  const prof = records[idx];
  if (prof.approval_status === 'rejected') {
    throw new Error('O profissional já se encontra com cadastro reprovado.');
  }

  const reason = (payload?.reason || '').trim();
  if (reason.length < 5) {
    throw new Error('O motivo da rejeição deve ter no mínimo 5 caracteres.');
  }

  const now = new Date().toISOString();
  prof.approval_status = 'rejected';
  prof.approval_notes = reason;
  prof.approved_at = null;
  prof.approved_by_id = 1;
  prof.updated_at = now;

  saveRecords(records);

  return {
    id: prof.id,
    name: prof.name,
    email: prof.email,
    approval_status: prof.approval_status,
    approval_notes: reason,
    approved_at: null,
    approved_by_id: prof.approved_by_id,
    updated_at: prof.updated_at,
    message: 'Cadastro do profissional reprovado e justificativa registrada com sucesso.',
  };
}
