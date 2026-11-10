import {
  AvaliacaoCreatePayload,
  AvaliacaoRead,
  ListarAvaliacoesProfissionalParams,
  ProfissionalAvaliacoesResumo,
} from '../types/avaliacoes';
import { ApiError, parseErrorMessage } from './apiError';
import * as mockService from './avaliacoes.mock';

export { ApiError, parseErrorMessage } from './apiError';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Quando ativo, utiliza o serviço mock local sem depender do backend. */
const IS_MOCK_ENABLED =
  process.env.NEXT_PUBLIC_AVALIACOES_MOCK === 'true';

/**
 * Consulta o resumo de reputação (média de notas, total e distribuição de 1 a 5 estrelas)
 * e a lista paginada de avaliações e comentários públicos de um profissional (issue #21).
 */
export async function getAvaliacoesProfissional(
  professionalId: number,
  params: ListarAvaliacoesProfissionalParams = {},
  signal?: AbortSignal,
): Promise<ProfissionalAvaliacoesResumo> {
  if (IS_MOCK_ENABLED) {
    return mockService.getAvaliacoesProfissionalMock(professionalId, params);
  }

  const url = new URL(
    `${API_BASE_URL}/api/professionals/${professionalId}/avaliacoes`,
  );

  if (params.nota !== undefined && params.nota !== null) {
    url.searchParams.set('nota', String(params.nota));
  }
  if (params.skip !== undefined) {
    url.searchParams.set('skip', String(params.skip));
  }
  if (params.limit !== undefined) {
    url.searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível carregar as avaliações deste profissional.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Registra uma avaliação de 1 a 5 estrelas (e comentário opcional) do cliente
 * autenticado para um profissional ativo e aprovado (issue #19).
 */
export async function createAvaliacao(
  token: string,
  payload: AvaliacaoCreatePayload,
): Promise<AvaliacaoRead> {
  if (IS_MOCK_ENABLED) {
    return mockService.createAvaliacaoMock(payload);
  }

  const comentarioLimpo = payload.comentario?.trim() || null;
  const bodyPayload: AvaliacaoCreatePayload = {
    professional_id: payload.professional_id,
    nota: payload.nota,
    ...(comentarioLimpo ? { comentario: comentarioLimpo } : {}),
    ...(payload.agendamento_id ? { agendamento_id: payload.agendamento_id } : {}),
    ...(payload.orcamento_id ? { orcamento_id: payload.orcamento_id } : {}),
  };

  const response = await fetch(`${API_BASE_URL}/api/avaliacoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      parseErrorMessage(
        errorBody,
        'Não foi possível registrar sua avaliação.',
      ),
      errorBody,
    );
  }

  return response.json();
}

/**
 * Lista as avaliações realizadas pelo próprio cliente autenticado.
 */
export async function getMinhasAvaliacoes(
  token: string,
): Promise<AvaliacaoRead[]> {
  if (IS_MOCK_ENABLED) {
    return mockService.getMinhasAvaliacoesMock();
  }

  const response = await fetch(`${API_BASE_URL}/api/avaliacoes/me`, {
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
      parseErrorMessage(
        errorBody,
        'Não foi possível carregar suas avaliações.',
      ),
      errorBody,
    );
  }

  return response.json();
}
