import {
  Denuncia,
  DenunciaCreatePayload,
} from '../types/denuncias';
import { ApiError, parseErrorMessage } from './apiError';
import * as mockService from './denuncias.mock';

export { ApiError, parseErrorMessage } from './apiError';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Quando ativo, o fluxo de denúncia usa o serviço mock (sem backend). */
const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_DENUNCIAS_MOCK === 'true';

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
