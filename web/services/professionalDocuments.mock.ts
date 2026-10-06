import {
  DocumentType,
  ProfessionalDocument,
  ProfessionalDocumentsSummary,
} from '../types/professionalDocuments';

const MOCK_STORAGE_KEY = 'rentalspouse_mock_professional_documents';

interface MockState {
  professionalId: number;
  approvalStatus: string;
  approvalNotes: string | null;
  submittedAt: string | null;
  documents: ProfessionalDocument[];
}

function getInitialState(): MockState {
  return {
    professionalId: 1,
    approvalStatus: 'pending_approval',
    approvalNotes: null,
    submittedAt: null,
    documents: [],
  };
}

function loadState(): MockState {
  if (typeof window === 'undefined') {
    return getInitialState();
  }
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Erro ao carregar estado mock:', err);
  }
  const initial = getInitialState();
  saveState(initial);
  return initial;
}

function saveState(state: MockState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Erro ao salvar estado mock:', err);
  }
}

function buildSummary(state: MockState): ProfessionalDocumentsSummary {
  const docTypes = new Set(state.documents.map((d) => d.document_type));
  const has_photo_id = docTypes.has('photo_id');
  const has_proof_of_residence = docTypes.has('proof_of_residence');
  const has_technical_certificate = docTypes.has('technical_certificate');
  const has_profile_photo = docTypes.has('profile_photo');
  const is_complete = has_photo_id && has_proof_of_residence;

  const missing_required: DocumentType[] = [];
  if (!has_photo_id) missing_required.push('photo_id');
  if (!has_proof_of_residence) missing_required.push('proof_of_residence');

  // Can submit se os obrigatórios estiverem presentes e ainda não tiver sido submetido, ou se foi rejeitado
  const can_submit =
    is_complete &&
    (state.submittedAt === null || state.approvalStatus === 'rejected');

  return {
    professional_id: state.professionalId,
    approval_status: state.approvalStatus,
    approval_notes: state.approvalNotes,
    has_photo_id,
    has_proof_of_residence,
    has_technical_certificate,
    has_profile_photo,
    is_complete,
    submitted_at: state.submittedAt,
    can_submit,
    missing_required,
    documents: [...state.documents],
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDocumentsSummaryMock(): Promise<ProfessionalDocumentsSummary> {
  await delay(250);
  const state = loadState();
  return buildSummary(state);
}

export async function uploadDocumentMock(
  documentType: DocumentType,
  file: File,
): Promise<ProfessionalDocument> {
  await delay(400);

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O arquivo excede o limite máximo permitido de 10 MB.');
  }

  const state = loadState();

  // Se já foi submetido e não está rejeitado, bloqueia edição
  if (state.submittedAt && state.approvalStatus !== 'rejected') {
    throw new Error(
      'Documentos já foram submetidos para análise e não podem ser alterados no momento.',
    );
  }

  // Remove anterior do mesmo tipo se existir (substituição)
  const filtered = state.documents.filter((d) => d.document_type !== documentType);

  const newDoc: ProfessionalDocument = {
    id: Date.now(),
    professional_id: state.professionalId,
    document_type: documentType,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
    download_url: URL.createObjectURL(file),
  };

  filtered.push(newDoc);
  state.documents = filtered;
  saveState(state);

  return newDoc;
}

export async function deleteDocumentMock(documentId: number): Promise<void> {
  await delay(300);
  const state = loadState();

  if (state.submittedAt && state.approvalStatus !== 'rejected') {
    throw new Error(
      'Documentos já foram submetidos para análise e não podem ser excluídos no momento.',
    );
  }

  state.documents = state.documents.filter((d) => d.id !== documentId);
  saveState(state);
}

export async function submitDocumentsForReviewMock(): Promise<ProfessionalDocumentsSummary> {
  await delay(450);
  const state = loadState();

  const summary = buildSummary(state);
  if (!summary.is_complete) {
    throw new Error(
      'Documentação incompleta. É obrigatório anexar Documento com Foto e Comprovante de Residência.',
    );
  }

  if (state.submittedAt && state.approvalStatus !== 'rejected') {
    throw new Error('Os documentos já foram enviados para análise.');
  }

  state.submittedAt = new Date().toISOString();
  state.approvalStatus = 'pending_approval';
  saveState(state);

  return buildSummary(state);
}

export function resetMockDocumentsState(): void {
  saveState(getInitialState());
}
