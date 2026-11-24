import {
  Denuncia,
  DenunciaAdminItem,
  DenunciaAdminResumo,
  DenunciaCreatePayload,
  DenunciaModerarPayload,
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

export interface ListAdminDenunciasParams {
  status?: string;
  motivo?: string;
  q?: string;
  skip?: number;
  limit?: number;
}

/** Lista denúncias para o painel administrativo com filtros e busca. */
export async function listAdminDenuncias(
  token: string,
  params: ListAdminDenunciasParams = {},
): Promise<DenunciaAdminItem[]> {
  if (IS_MOCK_ENABLED) {
    return mockService.listAdminDenunciasMock(params);
  }

  const query = new URLSearchParams();
  if (params.status && params.status !== 'all') {
    query.set('status', params.status);
  }
  if (params.motivo && params.motivo !== 'all') {
    query.set('motivo', params.motivo);
  }
  if (params.q && params.q.trim()) {
    query.set('q', params.q.trim());
  }
  if (typeof params.skip === 'number') {
    query.set('skip', String(params.skip));
  }
  if (typeof params.limit === 'number') {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();
  const url = `${API_BASE_URL}/api/admin/denuncias${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível carregar as denúncias para moderação.'),
      errorBody,
    );
  }

  return response.json();
}

/** Obtém os contadores resumidos de denúncias para os cards do painel admin. */
export async function getAdminDenunciasResumo(
  token: string,
): Promise<DenunciaAdminResumo> {
  if (IS_MOCK_ENABLED) {
    return mockService.getAdminDenunciasResumoMock();
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/denuncias/resumo`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível carregar o resumo de denúncias.'),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Registra a decisão do moderador sobre uma denúncia (issue #99, Fatia 2).
 *
 * `acao` aceita `banimento` (suspende profissional e conta), `arquivamento`
 * (improcedente) ou `reativacao` (reverte o banimento). O parecer é
 * obrigatório e fica registrado na trilha de auditoria da denúncia.
 */
export async function moderarDenuncia(
  token: string,
  denunciaId: number,
  payload: DenunciaModerarPayload,
): Promise<DenunciaAdminItem> {
  if (IS_MOCK_ENABLED) {
    return mockService.moderarDenunciaMock(denunciaId, payload);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/admin/denuncias/${denunciaId}/moderar`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(errorBody, 'Não foi possível registrar a decisão da moderação.'),
      errorBody,
    );
  }

  return response.json();
}
