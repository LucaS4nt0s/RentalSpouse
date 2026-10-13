import {
  Denuncia,
  DenunciaCreatePayload,
} from '../types/denuncias';
import * as mockService from './denuncias.mock';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Quando ativo, o fluxo de denúncia usa o serviço mock (sem backend). */
const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_DENUNCIAS_MOCK === 'true';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            typeof item === 'object' && item && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : String(item),
          )
          .join(', ');
      }
      if (typeof detail === 'object' && detail !== null) {
        if (
          'message' in detail &&
          typeof (detail as { message: unknown }).message === 'string'
        ) {
          return (detail as { message: string }).message;
        }
      }
    }
    if ('message' in body && typeof (body as { message: unknown }).message === 'string') {
      return (body as { message: string }).message;
    }
  }
  return fallback;
}

/**
 * Registra uma denúncia do cliente autenticado contra um profissional.
 * O autor é derivado do token pelo backend — o payload não envia `cliente_id`.
 */
export async function createDenuncia(
  token: string,
  payload: DenunciaCreatePayload,
): Promise<Denuncia> {
  if (IS_MOCK_ENABLED) {
    return mockService.createDenunciaMock(payload);
  }

  const response = await fetch(`${API_BASE_URL}/api/denuncias`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível registrar a denúncia.'),
      errorBody,
    );
  }

  return response.json();
}

/** Lista as denúncias do próprio cliente autenticado (mais recentes primeiro). */
export async function getMinhasDenuncias(token: string): Promise<Denuncia[]> {
  if (IS_MOCK_ENABLED) {
    return mockService.getMinhasDenunciasMock();
  }

  const response = await fetch(`${API_BASE_URL}/api/denuncias/me`, {
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
      parseErrorMessage(errorBody, 'Não foi possível carregar suas denúncias.'),
      errorBody,
    );
  }

  return response.json();
}
