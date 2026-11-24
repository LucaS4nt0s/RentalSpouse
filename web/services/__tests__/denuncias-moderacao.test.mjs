/**
 * Testes da decisão de moderação de denúncias (issue #99, Fatia 2).
 *
 * Cobrem as validações e o estado oferecidos à UI antes do PATCH
 * `/api/admin/denuncias/{id}/moderar`, além da paridade dos limites do parecer
 * com os schemas Pydantic do backend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  PARECER_MAX_CARACTERES,
  PARECER_MIN_CARACTERES,
  acaoModeracaoLabel,
  denunciaAguardaDecisao,
  podeReativarProfissional,
  statusDenunciaLabel,
  validarParecerModeracao,
} from '../../types/denuncias.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));

function denunciaAdmin(overrides = {}) {
  return {
    id: 501,
    motivo: 'cobranca_indevida',
    descricao: 'Cobrança diferente do combinado no atendimento.',
    status: 'pendente',
    created_at: '2026-11-20T12:00:00Z',
    updated_at: '2026-11-20T12:00:00Z',
    cliente_id: 1,
    cliente_nome: 'Mariana Costa',
    cliente_email: 'mariana@exemplo.com',
    professional_id: 10,
    professional_name: 'Carlos Eletricista',
    professional_email: 'carlos@exemplo.com',
    professional_is_active: true,
    professional_total_denuncias: 1,
    total_denuncias_profissional: 1,
    moderacao_acao: null,
    moderacao_parecer: null,
    moderado_em: null,
    moderado_por_id: null,
    moderado_por_nome: null,
    ...overrides,
  };
}

test('validarParecerModeracao exige pelo menos 10 caracteres e mensagem em pt-BR', () => {
  assert.match(validarParecerModeracao(''), /pelo menos 10 caracteres/);
  assert.match(validarParecerModeracao('curto'), /pelo menos 10 caracteres/);
  assert.match(validarParecerModeracao('        '), /pelo menos 10 caracteres/);
  assert.equal(validarParecerModeracao('Relato confirmado pela equipe.'), null);
  assert.equal(validarParecerModeracao('1234567890'), null);
});

test('validarParecerModeracao recusa parecer acima do limite maximo', () => {
  const noLimite = 'a'.repeat(PARECER_MAX_CARACTERES);
  const acimaDoLimite = 'a'.repeat(PARECER_MAX_CARACTERES + 1);

  assert.equal(validarParecerModeracao(noLimite), null);
  assert.match(validarParecerModeracao(acimaDoLimite), /no máximo 2000 caracteres/);
});

test('limites do parecer acompanham os constantes do backend', () => {
  const schemas = readFileSync(
    resolve(AQUI, '../../../backend/schemas.py'),
    'utf-8',
  );

  const minimo = /DENUNCIA_PARECER_MIN_CARACTERES = (\d+)/.exec(schemas);
  const maximo = /DENUNCIA_PARECER_MAX_CARACTERES = (\d+)/.exec(schemas);

  assert.ok(minimo, 'constante DENUNCIA_PARECER_MIN_CARACTERES ausente no backend');
  assert.ok(maximo, 'constante DENUNCIA_PARECER_MAX_CARACTERES ausente no backend');
  assert.equal(PARECER_MIN_CARACTERES, Number(minimo[1]));
  assert.equal(PARECER_MAX_CARACTERES, Number(maximo[1]));
});

test('denunciaAguardaDecisao cobre apenas os status em aberto', () => {
  assert.equal(denunciaAguardaDecisao({ status: 'pendente' }), true);
  assert.equal(denunciaAguardaDecisao({ status: 'em_analise' }), true);
  assert.equal(denunciaAguardaDecisao({ status: 'resolvida' }), false);
  assert.equal(denunciaAguardaDecisao({ status: 'arquivada' }), false);
});

test('podeReativarProfissional so libera reversao de banimento efetivo', () => {
  assert.equal(podeReativarProfissional(denunciaAdmin()), false);
  assert.equal(
    podeReativarProfissional(
      denunciaAdmin({ status: 'resolvida', moderacao_acao: 'banimento' }),
    ),
    false,
    'profissional ainda ativo nao precisa de reativacao',
  );
  assert.equal(
    podeReativarProfissional(
      denunciaAdmin({
        status: 'resolvida',
        moderacao_acao: 'banimento',
        professional_is_active: false,
      }),
    ),
    true,
  );
  assert.equal(
    podeReativarProfissional(
      denunciaAdmin({
        status: 'resolvida',
        moderacao_acao: 'arquivamento',
        professional_is_active: false,
      }),
    ),
    false,
    'arquivamento nunca oferece reativacao',
  );
  assert.equal(
    podeReativarProfissional(
      denunciaAdmin({
        status: 'em_analise',
        moderacao_acao: 'reativacao',
        professional_is_active: true,
      }),
    ),
    false,
  );
});

test('rotulos de acao e status da moderacao sao em pt-BR', () => {
  assert.equal(acaoModeracaoLabel('banimento'), 'Procedente: profissional suspenso');
  assert.equal(acaoModeracaoLabel('arquivamento'), 'Improcedente: denúncia arquivada');
  assert.equal(acaoModeracaoLabel('reativacao'), 'Reversão: profissional reativado');
  assert.equal(acaoModeracaoLabel(null), 'Sem decisão registrada');
  assert.equal(acaoModeracaoLabel('outro_valor'), 'outro_valor');

  assert.equal(statusDenunciaLabel('pendente'), 'Aguardando análise');
  assert.equal(statusDenunciaLabel('em_analise'), 'Em análise');
  assert.equal(statusDenunciaLabel('resolvida'), 'Resolvida');
  assert.equal(statusDenunciaLabel('arquivada'), 'Arquivada');
});
