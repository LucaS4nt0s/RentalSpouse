import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ehBloqueioDiaInteiro,
  formatarPeriodoBloqueio,
  montarPayloadBloqueio,
  somarDiasDataIso,
} from '../bloqueios-format.ts';

test('montarPayloadBloqueio: dia inteiro gera intervalo 00:00 até 00:00 do dia seguinte (inclusive virada de mês)', () => {
  const resultado = montarPayloadBloqueio({
    data: '2031-01-31',
    diaInteiro: true,
    motivo: '  Feriado local  ',
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.payload, {
      data_hora_inicio: '2031-01-31T00:00:00',
      data_hora_fim: '2031-02-01T00:00:00',
      motivo: 'Feriado local',
    });
  }
});

test('montarPayloadBloqueio: faixa horária específica valida ordem dos horários e normaliza motivo vazio', () => {
  const okRes = montarPayloadBloqueio({
    data: '2031-05-12',
    diaInteiro: false,
    horaInicio: '10:00',
    horaFim: '12:30',
    motivo: '   ',
  });

  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.deepEqual(okRes.payload, {
      data_hora_inicio: '2031-05-12T10:00:00',
      data_hora_fim: '2031-05-12T12:30:00',
      motivo: null,
    });
  }

  const invRes = montarPayloadBloqueio({
    data: '2031-05-12',
    diaInteiro: false,
    horaInicio: '14:00',
    horaFim: '12:00',
  });
  assert.equal(invRes.ok, false);

  const dataInexistente = montarPayloadBloqueio({
    data: '2031-02-30',
    diaInteiro: true,
  });
  assert.equal(dataInexistente.ok, false);
});

test('ehBloqueioDiaInteiro e formatarPeriodoBloqueio identificam dia inteiro e faixa horária em pt-BR', () => {
  const diaInteiro = {
    data_hora_inicio: '2031-05-12T00:00:00',
    data_hora_fim: '2031-05-13T00:00:00',
  };
  assert.equal(ehBloqueioDiaInteiro(diaInteiro), true);
  assert.deepEqual(formatarPeriodoBloqueio(diaInteiro), {
    tituloData: '12/05/2031',
    faixaHorario: 'Dia inteiro',
    diaInteiro: true,
  });

  const parcial = {
    data_hora_inicio: '2031-05-12T09:00:00',
    data_hora_fim: '2031-05-12T11:30:00',
  };
  assert.equal(ehBloqueioDiaInteiro(parcial), false);
  assert.deepEqual(formatarPeriodoBloqueio(parcial), {
    tituloData: '12/05/2031',
    faixaHorario: '09:00 às 11:30',
    diaInteiro: false,
  });

  assert.equal(somarDiasDataIso('2028-02-28', 1), '2028-02-29'); // ano bissexto
});
