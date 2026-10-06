const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeText,
  cleanText,
  damerauLevenshtein,
  calculateSimilarity,
  matchSynonymOrTerm,
  findBestCategorySuggestion,
  filterProfessionalsIntelligent,
  SPECIALTY_SYNONYMS,
} = require('./index.js');

describe('Motor de Busca Inteligente RentalSpouse', () => {
  describe('Normalização de Texto', () => {
    it('deve remover acentos e diacríticos corretamente', () => {
      assert.strictEqual(normalizeText('São Paulo'), 'sao paulo');
      assert.strictEqual(normalizeText('Elétrica & Pintura'), 'eletrica & pintura');
      assert.strictEqual(normalizeText('Niterói'), 'niteroi');
      assert.strictEqual(normalizeText(''), '');
      assert.strictEqual(normalizeText(null), '');
    });

    it('cleanText deve sanitizar caracteres mantendo apenas alfanuméricos e espaços', () => {
      assert.strictEqual(cleanText('Ar-condicionado!'), 'ar condicionado');
      assert.strictEqual(cleanText('  São   José   dos   Campos  '), 'sao jose dos campos');
    });
  });

  describe('Damerau-Levenshtein e Similaridade', () => {
    it('deve calcular distância 0 para strings idênticas', () => {
      assert.strictEqual(damerauLevenshtein('eletrica', 'eletrica'), 0);
      assert.strictEqual(calculateSimilarity('eletrica', 'eletrica'), 1);
    });

    it('deve detectar transposição adjacente com custo 1 (Damerau)', () => {
      // "encanadro" vs "encanador" (dr -> rd)
      assert.strictEqual(damerauLevenshtein('encanadro', 'encanador'), 1);
      assert.ok(calculateSimilarity('encanadro', 'encanador') > 0.85);
    });

    it('deve tolerar 1 erro por substituição ou omissão', () => {
      // "eletria" vs "eletrica" (falta c)
      assert.strictEqual(damerauLevenshtein('eletria', 'eletrica'), 1);
      assert.ok(calculateSimilarity('eletria', 'eletrica') >= 0.8);
    });
  });

  describe('Prevenção Estrita de Falsos Positivos em Sinônimos Curtos (Code Review)', () => {
    it('NÃO deve casar "reparo", "armário" ou "largar" com o sinônimo "ar" de Ar-condicionado', () => {
      const qTokensReparo = ['reparo'];
      const matchReparo = matchSynonymOrTerm('ar', 'reparo', qTokensReparo);
      assert.strictEqual(matchReparo.isMatch, false, '"reparo" não deve casar com "ar"');

      const qTokensArmario = ['armario'];
      const matchArmario = matchSynonymOrTerm('ar', 'armario', qTokensArmario);
      assert.strictEqual(matchArmario.isMatch, false, '"armário" não deve casar com "ar"');

      const qTokensLargar = ['largar'];
      const matchLargar = matchSynonymOrTerm('ar', 'largar', qTokensLargar);
      assert.strictEqual(matchLargar.isMatch, false, '"largar" não deve casar com "ar"');
    });

    it('DEVE casar quando a palavra "ar" for buscada como termo/token isolado', () => {
      const qTokensExato = ['ar'];
      const matchExato = matchSynonymOrTerm('ar', 'ar', qTokensExato);
      assert.strictEqual(matchExato.isMatch, true);

      const qTokensComposto = ['conserto', 'de', 'ar'];
      const matchComposto = matchSynonymOrTerm('ar', 'conserto de ar', qTokensComposto);
      assert.strictEqual(matchComposto.isMatch, true);
    });

    it('NÃO deve casar "terapia" ou "copiadora" com o sinônimo "pia"', () => {
      const matchTerapia = matchSynonymOrTerm('pia', 'terapia', ['terapia']);
      assert.strictEqual(matchTerapia.isMatch, false);

      const matchCopiadora = matchSynonymOrTerm('pia', 'copiadora', ['copiadora']);
      assert.strictEqual(matchCopiadora.isMatch, false);
    });

    it('DEVE casar "pia" como token isolado com Hidráulica', () => {
      const matchPia = matchSynonymOrTerm('pia', 'desentupir pia', ['desentupir', 'pia']);
      assert.strictEqual(matchPia.isMatch, true);
    });

    it('NÃO deve casar "desafio" com o sinônimo "fio"', () => {
      const matchDesafio = matchSynonymOrTerm('fio', 'desafio', ['desafio']);
      assert.strictEqual(matchDesafio.isMatch, false);
    });

    it('NÃO deve casar "reluz" com o sinônimo "luz"', () => {
      const matchReluz = matchSynonymOrTerm('luz', 'reluz', ['reluz']);
      assert.strictEqual(matchReluz.isMatch, false);
    });
  });

  describe('Paridade e Sincronização do Catálogo de Sinônimos', () => {
    it('deve conter todos os novos sinônimos em ambas as plataformas', () => {
      assert.ok(SPECIALTY_SYNONYMS['Pintura'].includes('rolinho'));
      assert.ok(SPECIALTY_SYNONYMS['Limpeza'].includes('vidros'));
      assert.ok(SPECIALTY_SYNONYMS['Reparos Gerais'].includes('persiana'));
      assert.ok(SPECIALTY_SYNONYMS['Montagem de Móveis'].includes('suporte tv'));
      assert.ok(SPECIALTY_SYNONYMS['Marcenaria'].includes('puxador'));
      assert.ok(SPECIALTY_SYNONYMS['Jardinagem'].includes('plantas'));
      assert.ok(SPECIALTY_SYNONYMS['Ar-condicionado'].includes('gas ar'));
    });
  });

  describe('findBestCategorySuggestion', () => {
    it('deve sugerir categoria com sinônimo válido sem falsos positivos', () => {
      const sugEletricista = findBestCategorySuggestion('eletricista');
      assert.ok(sugEletricista);
      assert.strictEqual(sugEletricista.suggested, 'Elétrica');

      const sugEncanador = findBestCategorySuggestion('encanador');
      assert.ok(sugEncanador);
      assert.strictEqual(sugEncanador.suggested, 'Hidráulica');

      // "reparo" NÃO deve sugerir Ar-condicionado
      const sugReparo = findBestCategorySuggestion('reparo');
      assert.ok(sugReparo);
      assert.strictEqual(sugReparo.suggested, 'Reparos Gerais');
    });
  });

  describe('filterProfessionalsIntelligent', () => {
    const mockProfessionals = [
      {
        id: 1,
        name: 'Carlos Silva',
        email: 'carlos@test.com',
        bio: 'Instalações elétricas e troca de disjuntor',
        specialties: ['Elétrica'],
        city: 'São Paulo',
      },
      {
        id: 2,
        name: 'Roberto Ar-condicionado',
        email: 'roberto@test.com',
        bio: 'Instalação e limpeza de split',
        specialties: ['Ar-condicionado'],
        city: 'Campinas',
      },
      {
        id: 3,
        name: 'Maria Encanadora',
        email: 'maria@test.com',
        bio: 'Conserto de pia e torneiras com vazamento',
        specialties: ['Hidráulica'],
        city: 'Niterói',
      },
      {
        id: 4,
        name: 'João Faz Tudo',
        email: 'joao@test.com',
        bio: 'Pequenos reparos residenciais e pintura',
        specialties: ['Reparos Gerais', 'Pintura'],
        city: 'São Paulo',
      },
    ];

    it('busca por "reparo" deve retornar apenas quem faz Reparos Gerais, JAMAIS Ar-condicionado', () => {
      const { results } = filterProfessionalsIntelligent(mockProfessionals, { q: 'reparo' });
      const ids = results.map((p) => p.id);
      assert.ok(ids.includes(4), 'João Faz Tudo deve ser encontrado');
      assert.ok(!ids.includes(2), 'Roberto Ar-condicionado NÃO pode ser encontrado com "reparo"');
    });

    it('busca por "niteroi" (sem acento) no filtro de cidade deve encontrar profissional de "Niterói"', () => {
      const { results } = filterProfessionalsIntelligent(mockProfessionals, { city: 'niteroi' });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 3);
    });

    it('busca por erro ortográfico "eletria" deve tolerar e encontrar profissional de Elétrica', () => {
      const { results } = filterProfessionalsIntelligent(mockProfessionals, { q: 'eletria' });
      const ids = results.map((p) => p.id);
      assert.ok(ids.includes(1), 'Carlos Silva deve ser encontrado via fuzzy');
    });
  });
});
