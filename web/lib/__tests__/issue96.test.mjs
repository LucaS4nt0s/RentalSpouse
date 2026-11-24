import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acquireBodyScrollLock,
  getActiveBodyScrollLockCount,
  resetBodyScrollLockState,
} from '../scrollLock.ts';
import {
  buildProfessionalsSearchUrl,
  parseRadiusFilter,
  parseSortOrder,
  radiusFilterToApiParams,
} from '../professionalsSearchQuery.ts';

function createFakeBody(initialOverflow = '') {
  const style = {
    overflow: initialOverflow,
    removeProperty(prop) {
      if (prop === 'overflow') {
        const prev = style.overflow;
        style.overflow = '';
        return prev;
      }
      return '';
    },
  };
  return { style };
}

test('scrollLock: abrir e fechar modal de avaliação várias vezes nunca trava a rolagem', () => {
  resetBodyScrollLockState();
  const body = createFakeBody('');

  for (let i = 0; i < 3; i += 1) {
    const release = acquireBodyScrollLock(body);
    assert.equal(body.style.overflow, 'hidden');
    assert.equal(getActiveBodyScrollLockCount(), 1);

    release();
    assert.equal(body.style.overflow, '');
    assert.equal(getActiveBodyScrollLockCount(), 0);
  }
});

test('scrollLock: modais sobrepostos (Avaliações -> Avaliar) só destravam quando o último fecha', () => {
  resetBodyScrollLockState();
  const body = createFakeBody('');

  const releaseOuter = acquireBodyScrollLock(body);
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(getActiveBodyScrollLockCount(), 1);

  const releaseInner = acquireBodyScrollLock(body);
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(getActiveBodyScrollLockCount(), 2);

  // Fechar o modal interno mantém a página travada enquanto o modal pai estiver aberto
  releaseInner();
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(getActiveBodyScrollLockCount(), 1);

  // Chamada duplicada de releaseInner é idempotente e não corrompe o contador
  releaseInner();
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(getActiveBodyScrollLockCount(), 1);

  // Ao fechar o modal pai, a rolagem volta ao normal
  releaseOuter();
  assert.equal(body.style.overflow, '');
  assert.equal(getActiveBodyScrollLockCount(), 0);
});

test('scrollLock: transição de um modal para outro (perfil -> orçamento) não prende overflow hidden', () => {
  resetBodyScrollLockState();
  const body = createFakeBody('');

  const releaseProfile = acquireBodyScrollLock(body);
  const releaseQuote = acquireBodyScrollLock(body);
  releaseProfile();
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(getActiveBodyScrollLockCount(), 1);

  releaseQuote();
  assert.equal(body.style.overflow, '');
  assert.equal(getActiveBodyScrollLockCount(), 0);
});

test('scrollLock: recupera body caso overflow já estivesse preso em hidden', () => {
  resetBodyScrollLockState();
  const body = createFakeBody('hidden');

  const release = acquireBodyScrollLock(body);
  assert.equal(body.style.overflow, 'hidden');
  release();
  assert.equal(body.style.overflow, '');
});

test('professionalsSearchQuery: envia q, specialty, city, state, raio e order_by para /api/professionals/search', () => {
  const urlStr = buildProfessionalsSearchUrl('http://localhost:8000', {
    q: 'eletricista',
    specialty: 'Elétrica',
    city: 'Campinas',
    state: 'sp',
    radius: 'min_25',
    orderBy: 'avaliacao',
    limit: 50,
  });

  const parsed = new URL(urlStr);
  assert.equal(parsed.pathname, '/api/professionals/search');
  assert.equal(parsed.searchParams.get('q'), 'eletricista');
  assert.equal(parsed.searchParams.get('specialty'), 'Elétrica');
  assert.equal(parsed.searchParams.get('city'), 'Campinas');
  assert.equal(parsed.searchParams.get('state'), 'SP');
  assert.equal(parsed.searchParams.get('min_radius_km'), '25');
  assert.equal(parsed.searchParams.get('max_radius_km'), null);
  assert.equal(parsed.searchParams.get('order_by'), 'avaliacao');
  assert.equal(parsed.searchParams.get('approval_status'), 'approved');
});

test('professionalsSearchQuery: mapeia Até 10 km para max_radius_km=10 e limpa filtros vazios', () => {
  assert.deepEqual(radiusFilterToApiParams('max_10'), { max_radius_km: 10 });
  assert.deepEqual(radiusFilterToApiParams('min_10'), { min_radius_km: 10 });
  assert.deepEqual(radiusFilterToApiParams('min_50'), { min_radius_km: 50 });
  assert.deepEqual(radiusFilterToApiParams(''), {});

  assert.equal(parseRadiusFilter('invalido'), '');
  assert.equal(parseSortOrder('avaliacao'), 'avaliacao');
  assert.equal(parseSortOrder('desconhecido'), '');

  const urlClean = buildProfessionalsSearchUrl('http://localhost:8000/', {
    specialty: 'Todas',
    q: '   ',
    city: '',
    radius: 'max_10',
  });
  const parsed = new URL(urlClean);
  assert.equal(parsed.searchParams.get('q'), null);
  assert.equal(parsed.searchParams.get('specialty'), null);
  assert.equal(parsed.searchParams.get('city'), null);
  assert.equal(parsed.searchParams.get('max_radius_km'), '10');
});

test('professionalsSearchQuery: slider Tinder numérico mapeia para max_distance_km', () => {
  assert.equal(parseRadiusFilter('30'), '30');
  assert.equal(parseRadiusFilter('0'), '');
  assert.equal(parseRadiusFilter('999'), '');
  assert.deepEqual(radiusFilterToApiParams('45'), { max_distance_km: 45 });

  const sliderUrl = new URL(buildProfessionalsSearchUrl('http://localhost:8000', { radius: '35' }));
  assert.equal(sliderUrl.searchParams.get('max_distance_km'), '35');
});
