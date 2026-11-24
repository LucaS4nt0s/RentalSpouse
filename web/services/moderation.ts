import {
  ModerationStatusFilter,
  ProfessionalModerationDecision,
  ProfessionalModerationItem,
  ProfessionalModerationReview,
  ProfessionalRejectPayload,
} from '../types/moderation';
import { ApiError, parseErrorMessage } from './apiError';
import * as mockService from './moderation.mock';

export { ApiError, parseErrorMessage } from './apiError';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_MODERATION_MOCK === 'true';

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

export async function listPendingProfessionals(
  token: string,
  skip = 0,
  limit = 50
): Promise<ProfessionalModerationItem[]> {
  if (IS_MOCK_ENABLED) {
    return mockService.listPendingProfessionals(skip, limit);
  }

  const url = resolveApiUrl(
    `/api/admins/professionals/pending?skip=${skip}&limit=${limit}`
  );
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => null);
    throw new ApiError(
      resp.status,
      parseErrorMessage(errorBody, 'Erro ao carregar fila de moderação.'),
      errorBody
    );
  }

  return resp.json();
}

export async function listProfessionals(
  token: string,
  statusFilter?: ModerationStatusFilter,
  skip = 0,
  limit = 50
): Promise<ProfessionalModerationItem[]> {
  if (IS_MOCK_ENABLED) {
    return mockService.listProfessionals(statusFilter, skip, limit);
  }

  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (statusFilter && statusFilter !== 'all') {
    params.set('status', statusFilter);
  }

  const url = resolveApiUrl(`/api/admins/professionals?${params.toString()}`);
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => null);
    throw new ApiError(
      resp.status,
      parseErrorMessage(errorBody, 'Erro ao listar profissionais.'),
      errorBody
    );
  }

  return resp.json();
}

export async function getProfessionalReview(
  token: string,
  professionalId: number
): Promise<ProfessionalModerationReview> {
  if (IS_MOCK_ENABLED) {
    return mockService.getProfessionalReview(professionalId);
  }

  const url = resolveApiUrl(`/api/admins/professionals/${professionalId}/review`);
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => null);
    throw new ApiError(
      resp.status,
      parseErrorMessage(
        errorBody,
        'Erro ao carregar dados do profissional para auditoria.'
      ),
      errorBody
    );
  }

  return resp.json();
}

export async function approveProfessional(
  token: string,
  professionalId: number
): Promise<ProfessionalModerationDecision> {
  if (IS_MOCK_ENABLED) {
    return mockService.approveProfessional(professionalId);
  }

  const url = resolveApiUrl(`/api/admins/professionals/${professionalId}/approve`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => null);
    throw new ApiError(
      resp.status,
      parseErrorMessage(errorBody, 'Erro ao aprovar cadastro do profissional.'),
      errorBody
    );
  }

  return resp.json();
}

export async function rejectProfessional(
  token: string,
  professionalId: number,
  payload: ProfessionalRejectPayload
): Promise<ProfessionalModerationDecision> {
  if (IS_MOCK_ENABLED) {
    return mockService.rejectProfessional(professionalId, payload);
  }

  const url = resolveApiUrl(`/api/admins/professionals/${professionalId}/reject`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => null);
    throw new ApiError(
      resp.status,
      parseErrorMessage(errorBody, 'Erro ao reprovar cadastro do profissional.'),
      errorBody
    );
  }

  return resp.json();
}

export async function fetchDocumentBlob(
  token: string,
  downloadUrl: string
): Promise<string> {
  const url = resolveApiUrl(downloadUrl);
  if (!url || url.startsWith('blob:') || url.includes('placehold.co')) {
    return url;
  }
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) {
      return url;
    }
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}
