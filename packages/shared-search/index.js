/**
 * Motor de Busca Inteligente e Tolerância a Erros para RentalSpouse (Web e Mobile).
 * Implementa normalização de acentos, similaridade Damerau-Levenshtein,
 * mapeamento semântico de sinônimos e eliminação estrita de falsos positivos em sinônimos curtos.
 */

function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanText(str) {
  return normalizeText(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function damerauLevenshtein(a, b) {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const matrix = Array.from({ length: al + 1 }, () =>
    new Array(bl + 1).fill(0)
  );

  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[al][bl];
}

function calculateSimilarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = damerauLevenshtein(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

const SPECIALTY_SYNONYMS = {
  'Elétrica': [
    'eletrica',
    'eletrico',
    'eletricista',
    'fiacao',
    'tomada',
    'disjuntor',
    'luz',
    'iluminacao',
    'curto circuito',
    'quadro de luz',
    'fio',
    'lustre',
    'interruptor',
  ],
  'Hidráulica': [
    'hidraulica',
    'hidraulico',
    'encanador',
    'encanamento',
    'vazamento',
    'desentupimento',
    'desentupidor',
    'torneira',
    'chuveiro',
    'cano',
    'pia',
    'infiltracao',
    'esgoto',
    'bombeiro hidraulico',
    'ralo',
    'sifao',
    'descarga',
  ],
  'Pintura': [
    'pintura',
    'pintor',
    'pintar',
    'tinta',
    'parede',
    'verniz',
    'massa corrida',
    'emassamento',
    'textura',
    'grafiato',
    'rolinho',
  ],
  'Montagem de Móveis': [
    'montagem de moveis',
    'montagem',
    'montador',
    'moveis',
    'armario',
    'guarda roupa',
    'comoda',
    'mesa',
    'estante',
    'rack',
    'painel',
    'instalacao de tv',
    'suporte tv',
  ],
  'Marcenaria': [
    'marcenaria',
    'marceneiro',
    'madeira',
    'moveis planejados',
    'porta',
    'gaveta',
    'compensado',
    'mdf',
    'puxador',
  ],
  'Limpeza': [
    'limpeza',
    'faxina',
    'faxineira',
    'diarista',
    'limpeza pos obra',
    'higienizacao',
    'lavagem',
    'aspirador',
    'vidros',
  ],
  'Jardinagem': [
    'jardinagem',
    'jardineiro',
    'grama',
    'jardim',
    'poda',
    'cortar grama',
    'arvore',
    'paisagismo',
    'plantas',
  ],
  'Ar-condicionado': [
    'ar condicionado',
    'ar-condicionado',
    'ar',
    'climatizacao',
    'split',
    'refrigeracao',
    'limpeza de ar',
    'instalacao ar',
    'gas ar',
  ],
  'Reparos Gerais': [
    'reparos gerais',
    'reparos',
    'reparo',
    'marido de aluguel',
    'faz tudo',
    'conserto',
    'instalacao',
    'furadeira',
    'quadros',
    'fechadura',
    'varal',
    'cortina',
    'persiana',
  ],
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFuzzyWordMatch(queryWord, targetWord) {
  if (queryWord === targetWord) {
    return { isMatch: true, similarity: 1 };
  }

  if (queryWord.length <= 3) {
    return { isMatch: false, similarity: 0 };
  }

  if (targetWord.startsWith(queryWord) && queryWord.length >= 4) {
    return { isMatch: true, similarity: 0.95 };
  }

  const dist = damerauLevenshtein(queryWord, targetWord);
  const maxLen = Math.max(queryWord.length, targetWord.length);
  const sim = 1 - dist / maxLen;

  if (queryWord.length <= 5) {
    return { isMatch: dist <= 1 && sim >= 0.75, similarity: sim };
  } else {
    return { isMatch: dist <= 2 && sim >= 0.70, similarity: sim };
  }
}

function matchSynonymOrTerm(targetTerm, cleanQ, qTokens) {
  const cleanTarget = cleanText(targetTerm);
  if (!cleanTarget || !cleanQ) {
    return { isMatch: false, score: 0, isApprox: false };
  }

  if (cleanQ === cleanTarget) {
    return { isMatch: true, score: 95, isApprox: false };
  }

  const targetTokens = cleanTarget.split(/\s+/).filter(Boolean);

  if (targetTokens.length > 1) {
    const phraseRegex = new RegExp(`(^|\\s)${escapeRegExp(cleanTarget)}(\\s|$)`);
    if (phraseRegex.test(cleanQ)) {
      return { isMatch: true, score: 90, isApprox: false };
    }
    const queryPhraseRegex = new RegExp(`(^|\\s)${escapeRegExp(cleanQ)}(\\s|$)`);
    if (cleanQ.length >= 4 && queryPhraseRegex.test(cleanTarget)) {
      return { isMatch: true, score: 90, isApprox: false };
    }
  }

  if (cleanTarget.length < 4) {
    const hasExactToken = qTokens.includes(cleanTarget);
    if (hasExactToken) {
      return { isMatch: true, score: 90, isApprox: false };
    }
    return { isMatch: false, score: 0, isApprox: false };
  }

  if (qTokens.includes(cleanTarget)) {
    return { isMatch: true, score: 90, isApprox: false };
  }

  for (const qToken of qTokens) {
    if (qToken.length >= 4) {
      if (cleanTarget.startsWith(qToken) || (cleanTarget.length >= 4 && qToken.startsWith(cleanTarget))) {
        return { isMatch: true, score: 88, isApprox: false };
      }
    }
  }

  if (cleanQ.length >= 4) {
    const sim = calculateSimilarity(cleanQ, cleanTarget);
    if (sim >= 0.75) {
      return { isMatch: true, score: Math.round(sim * 85), isApprox: true };
    }

    for (const qToken of qTokens) {
      if (qToken.length >= 4) {
        const tokenSim = calculateSimilarity(qToken, cleanTarget);
        if (tokenSim >= 0.78) {
          return { isMatch: true, score: Math.round(tokenSim * 85), isApprox: true };
        }
      }
    }
  }

  return { isMatch: false, score: 0, isApprox: false };
}

function findBestCategorySuggestion(query) {
  const cleanQ = cleanText(query);
  if (!cleanQ || cleanQ.length < 3) return null;

  const qTokens = cleanQ.split(/\s+/).filter(Boolean);
  let bestCat = null;
  let highestScore = 0;
  let isSynonym = false;

  for (const [category, synonyms] of Object.entries(SPECIALTY_SYNONYMS)) {
    const cleanCat = cleanText(category);

    if (cleanCat === cleanQ || (cleanCat.length >= 4 && cleanCat.startsWith(cleanQ))) {
      return { suggested: category, isSynonym: false };
    }

    if (cleanQ.length >= 4) {
      const simCat = calculateSimilarity(cleanQ, cleanCat);
      if (simCat > highestScore && simCat >= 0.75) {
        highestScore = simCat;
        bestCat = category;
        isSynonym = false;
      }
    }

    for (const syn of synonyms) {
      const match = matchSynonymOrTerm(syn, cleanQ, qTokens);
      if (match.isMatch && match.score > highestScore) {
        highestScore = match.score;
        bestCat = category;
        isSynonym = true;
      }
    }
  }

  if (bestCat && highestScore >= 70) {
    return { suggested: bestCat, isSynonym };
  }

  return null;
}

function filterProfessionalsIntelligent(
  professionals,
  { q = '', specialty = '', city = '' } = {}
) {
  if (!Array.isArray(professionals)) {
    return { results: [], detectedSuggestion: null };
  }

  const cleanSpecialty = cleanText(specialty);
  const cleanCity = cleanText(city);
  const cleanQ = cleanText(q);
  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 0);

  const suggestion = cleanQ ? findBestCategorySuggestion(cleanQ) : null;
  const detectedSuggestion = suggestion ? suggestion.suggested : null;

  const scored = [];

  for (const prof of professionals) {
    if (cleanSpecialty && cleanSpecialty !== 'todas') {
      const hasSpec = prof.specialties?.some((s) => {
        const norm = cleanText(s);
        return norm === cleanSpecialty || (norm.length >= 4 && norm.includes(cleanSpecialty));
      });
      if (!hasSpec) continue;
    }

    if (cleanCity) {
      const profCity = cleanText(prof.city);
      const isCityMatch =
        profCity === cleanCity ||
        profCity.includes(cleanCity) ||
        cleanCity.includes(profCity);
      if (!isCityMatch) {
        const sim = calculateSimilarity(profCity, cleanCity);
        if (sim < 0.75) continue;
      }
    }

    if (!cleanQ || qTokens.length === 0) {
      scored.push({ professional: prof, score: 100 });
      continue;
    }

    let bestScore = 0;
    let matchReason = '';

    const nameText = cleanText(prof.name);
    const bioText = cleanText(prof.bio);
    const profCityText = cleanText(prof.city);

    for (const spec of prof.specialties || []) {
      const cleanSpec = cleanText(spec);

      const specMatch = matchSynonymOrTerm(cleanSpec, cleanQ, qTokens);
      if (specMatch.isMatch && specMatch.score > bestScore) {
        bestScore = specMatch.score;
        matchReason = specMatch.isApprox
          ? `Aproximação com ${spec}`
          : `Especialidade: ${spec}`;
      }

      const syns = SPECIALTY_SYNONYMS[spec] || [];
      for (const syn of syns) {
        const synMatch = matchSynonymOrTerm(syn, cleanQ, qTokens);
        if (synMatch.isMatch && synMatch.score > bestScore) {
          bestScore = synMatch.score;
          matchReason = synMatch.isApprox
            ? `Aproximação (${syn})`
            : `Sinônimo de ${spec}`;
        }
      }
    }

    if (nameText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 100);
      matchReason = 'Nome correspondente';
    } else {
      const nameWords = nameText.split(/\s+/).filter(Boolean);
      for (const qToken of qTokens) {
        for (const nw of nameWords) {
          const { isMatch, similarity } = isFuzzyWordMatch(qToken, nw);
          if (isMatch) {
            bestScore = Math.max(bestScore, Math.round(similarity * 95));
            matchReason = 'Nome aproximado';
          }
        }
      }
    }

    if (profCityText && (profCityText === cleanQ || profCityText.includes(cleanQ))) {
      bestScore = Math.max(bestScore, 80);
      matchReason = 'Cidade correspondente';
    }

    if (bioText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 70);
      matchReason = 'Biografia';
    } else {
      const bioWords = bioText.split(/\s+/).slice(0, 100);
      for (const qToken of qTokens) {
        if (qToken.length >= 4) {
          for (const bw of bioWords) {
            const { isMatch, similarity } = isFuzzyWordMatch(qToken, bw);
            if (isMatch) {
              bestScore = Math.max(bestScore, Math.round(similarity * 65));
              matchReason = 'Menção na biografia';
              break;
            }
          }
        }
      }
    }

    if (bestScore >= 50) {
      scored.push({
        professional: prof,
        score: bestScore,
        matchedReason: matchReason,
        suggestedTerm: detectedSuggestion || undefined,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.map((item) => item.professional),
    detectedSuggestion: cleanQ && detectedSuggestion ? detectedSuggestion : null,
  };
}

module.exports = {
  normalizeText,
  cleanText,
  damerauLevenshtein,
  calculateSimilarity,
  SPECIALTY_SYNONYMS,
  isFuzzyWordMatch,
  matchSynonymOrTerm,
  findBestCategorySuggestion,
  filterProfessionalsIntelligent,
};
