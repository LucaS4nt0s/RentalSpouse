import {
  DocumentType,
  ProfessionalDocument,
  ProfessionalDocumentsSummary,
} from '../types/professionalDocuments';
import { ApiError, parseErrorMessage } from './apiError';
import * as mockService from './professionalDocuments.mock';

export { ApiError, parseErrorMessage } from './apiError';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_DOCUMENTS_MOCK === 'true';

export function resolveApiUrl(path: string): string {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  const cleanBase = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Busca o resumo dos documentos do profissional autenticado.
 */
export async function getDocumentsSummary(
  token: string,
): Promise<ProfessionalDocumentsSummary> {
  if (IS_MOCK_ENABLED) {
    return mockService.getDocumentsSummaryMock();
  }

  const response = await fetch(`${API_BASE_URL}/api/professionals/me/documents`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Erro ao carregar documentos do profissional.'),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Envia um arquivo de documento para o servidor (multipart/form-data).
 */
export async function uploadDocument(
  token: string,
  documentType: DocumentType,
  file: File,
): Promise<ProfessionalDocument> {
  if (IS_MOCK_ENABLED) {
    return mockService.uploadDocumentMock(documentType, file);
  }

  const formData = new FormData();
  formData.append('document_type', documentType);
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/professionals/me/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Erro ao enviar documento.'),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Exclui um documento previamente enviado pelo profissional.
 */
export async function deleteDocument(
  token: string,
  documentId: number,
): Promise<void> {
  if (IS_MOCK_ENABLED) {
    return mockService.deleteDocumentMock(documentId);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/professionals/me/documents/${documentId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Erro ao excluir documento.'),
      errorBody,
    );
  }
}

/**
 * Submete os documentos enviados para análise da equipe de administração.
 */
export async function submitDocumentsForReview(
  token: string,
): Promise<ProfessionalDocumentsSummary> {
  if (IS_MOCK_ENABLED) {
    return mockService.submitDocumentsForReviewMock();
  }

  const response = await fetch(
    `${API_BASE_URL}/api/professionals/me/documents/submit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Erro ao submeter documentos para análise do administrador.',
      ),
      errorBody,
    );
  }

  return response.json();
}
