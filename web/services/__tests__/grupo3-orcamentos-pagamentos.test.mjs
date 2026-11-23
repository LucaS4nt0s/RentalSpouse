import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectarBandeiraCartao,
  obterResumoGanhos,
  tokenizarCartaoMercadoPago,
  validarCpfDigitos,
} from '../pagamentos.ts';
import {
  aprovarEstimativaOrcamento,
  cancelarOrcamentoCliente,
} from '../orcamentos.ts';

test('validarCpfDigitos e detectarBandeiraCartao validam formatos brasileiros e bandeiras', () => {
  assert.equal(validarCpfDigitos('52998224725'), true);
  assert.equal(validarCpfDigitos('529.982.247-25'), true);
  assert.equal(validarCpfDigitos('11111111111'), false);
  assert.equal(validarCpfDigitos('12345678900'), false);
  assert.equal(validarCpfDigitos('123'), false);

  assert.equal(detectarBandeiraCartao('4111111111111111'), 'visa');
  assert.equal(detectarBandeiraCartao('5500000000000004'), 'master');
  assert.equal(detectarBandeiraCartao('340000000000009'), 'amex');
  assert.equal(detectarBandeiraCartao('6362970000000000'), 'elo');
});

test('tokenizarCartaoMercadoPago gera token sandbox deterministico quando dados sao validos', async () => {
  const resultado = await tokenizarCartaoMercadoPago({
    numeroCartao: '5500 0000 0000 4242',
    nomeTitular: 'Mariana Ferreira',
    cpfTitular: '529.982.247-25',
    mesValidade: '12',
    anoValidade: '30',
    cvv: '123',
  });

  assert.deepEqual(resultado, {
    card_token: 'tok_sandbox_4242',
    payment_method_id: 'master',
  });
});

test('tokenizarCartaoMercadoPago valida numero, nome, CPF, validade e CVV em pt-BR', async () => {
  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '1234',
        nomeTitular: 'Mariana Ferreira',
        cpfTitular: '52998224725',
        mesValidade: '12',
        anoValidade: '30',
        cvv: '123',
      }),
    /número de cartão válido/i
  );

  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '4111111111111111',
        nomeTitular: 'AB',
        cpfTitular: '52998224725',
        mesValidade: '12',
        anoValidade: '30',
        cvv: '123',
      }),
    /nome do titular/i
  );

  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '4111111111111111',
        nomeTitular: 'Mariana Ferreira',
        cpfTitular: '11111111111',
        mesValidade: '12',
        anoValidade: '30',
        cvv: '123',
      }),
    /CPF válido/i
  );

  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '4111111111111111',
        nomeTitular: 'Mariana Ferreira',
        cpfTitular: '52998224725',
        mesValidade: '13',
        anoValidade: '30',
        cvv: '123',
      }),
    /mês de validade/i
  );

  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '4111111111111111',
        nomeTitular: 'Mariana Ferreira',
        cpfTitular: '52998224725',
        mesValidade: '01',
        anoValidade: '20',
        cvv: '123',
      }),
    /vencido/i
  );

  await assert.rejects(
    () =>
      tokenizarCartaoMercadoPago({
        numeroCartao: '4111111111111111',
        nomeTitular: 'Mariana Ferreira',
        cpfTitular: '52998224725',
        mesValidade: '12',
        anoValidade: '30',
        cvv: '12',
      }),
    /\(CVV\) válido/i
  );
});

test('aprovarEstimativaOrcamento e cancelarOrcamentoCliente enviam contratos PATCH corretos', async () => {
  const originalFetch = globalThis.fetch;
  const chamadas = [];

  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        id: 42,
        status: String(url).includes('aprovar-estimativa') ? 'aceito' : 'cancelado',
        valor_estimado: 350,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const aprovado = await aprovarEstimativaOrcamento(42, 'jwt-cli', {
      mensagem: 'Pode confirmar!',
    });
    assert.equal(aprovado.status, 'aceito');
    assert.equal(chamadas[0].init.method, 'PATCH');
    assert.match(chamadas[0].url, /\/api\/orcamentos\/42\/aprovar-estimativa$/);
    assert.deepEqual(JSON.parse(chamadas[0].init.body), { mensagem: 'Pode confirmar!' });

    const cancelado = await cancelarOrcamentoCliente(42, 'jwt-cli', {
      motivo: 'Valor acima do esperado',
    });
    assert.equal(cancelado.status, 'cancelado');
    assert.equal(chamadas[1].init.method, 'PATCH');
    assert.match(chamadas[1].url, /\/api\/orcamentos\/42\/cancelar$/);
    assert.deepEqual(JSON.parse(chamadas[1].init.body), { motivo: 'Valor acima do esperado' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('obterResumoGanhos consome GET /api/pagamentos/resumo-ganhos e propaga erro da API', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/pagamentos\/resumo-ganhos$/);
    assert.equal(init.headers.Authorization, 'Bearer jwt-prof');
    return new Response(
      JSON.stringify({
        total_acumulado: 1850.5,
        ganhos_mes_atual: 850.0,
        ganhos_semana_atual: 350.0,
        total_atendimentos_pagos: 6,
        ticket_medio: 308.42,
        mes_referencia: '2026-11',
        semana_referencia: 'Semana 48/2026',
        pagamentos_recentes: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const resumo = await obterResumoGanhos('jwt-prof');
    assert.equal(resumo.total_acumulado, 1850.5);
    assert.equal(resumo.total_atendimentos_pagos, 6);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: 'Apenas profissionais autorizados.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(() => obterResumoGanhos('jwt-cli'), /Apenas profissionais autorizados/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
