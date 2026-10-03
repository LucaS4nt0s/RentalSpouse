/**
 * Motor de Busca Inteligente com Tolerância a Erros e Insensibilidade a Acentos
 * Estilo Spotify / YouTube / Algolia para o RentalSpouse Mobile.
 */

export function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cleanText(str) {
  return normalizeText(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function damerauLevenshtein(a, b) {
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

export function calculateSimilarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = damerauLevenshtein(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

export const SPECIALTY_SYNONYMS = {
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
  ],
  'Limpeza': [
    'limpeza',
    'faxina',
    'faxineira',
    'diarista',
    'limpeza pos obra',
    'higienizacao',
    'lavagem',
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
  ],
  'Ar-condicionado': [
    'ar condicionado',
    'ar-condicionado',
    'ar',
    'climatizacao',
    'split',
    'refrigeracao',
    'limpeza de ar',
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
  ],
};

function isFuzzyWordMatch(queryWord, targetWord) {
  if (queryWord === targetWord) {
    return { isMatch: true, similarity: 1 };
  }

  if (targetWord.startsWith(queryWord) && queryWord.length >= 3) {
    return { isMatch: true, similarity: 0.95 };
  }

  if (queryWord.length <= 3) {
    return { isMatch: false, similarity: 0 };
  }

  const dist = damerauLevenshtein(queryWord, targetWord);
  const maxLen = Math.max(queryWord.length, targetWord.length);
  const sim = 1 - dist / maxLen;

  if (queryWord.length <= 5) {
    return { isMatch: dist <= 1, similarity: sim };
  } else {
    return { isMatch: dist <= 2, similarity: sim };
  }
}

export function findBestCategorySuggestion(query) {
  const cleanQ = cleanText(query);
  if (!cleanQ || cleanQ.length < 3) return null;

  let bestCat = null;
  let highestScore = 0;

  for (const [category, synonyms] of Object.entries(SPECIALTY_SYNONYMS)) {
    const cleanCat = cleanText(category);

    if (cleanCat.includes(cleanQ) || cleanQ.includes(cleanCat)) {
      return category;
    }

    const simCat = calculateSimilarity(cleanQ, cleanCat);
    if (simCat > highestScore && simCat >= 0.70) {
      highestScore = simCat;
      bestCat = category;
    }

    for (const syn of synonyms) {
      if (syn === cleanQ || syn.startsWith(cleanQ)) {
        return category;
      }
      const sim = calculateSimilarity(cleanQ, syn);
      if (sim > highestScore && sim >= 0.75) {
        highestScore = sim;
        bestCat = category;
      }
    }
  }

  if (bestCat && highestScore >= 0.70) {
    return bestCat;
  }
  return null;
}

export function filterProfessionalsIntelligent(
  professionals,
  { q = '', specialty = '', city = '', radius = null } = {}
) {
  if (!Array.isArray(professionals)) {
    return { results: [], detectedSuggestion: null };
  }

  const cleanSpecialty = cleanText(specialty);
  const cleanCity = cleanText(city);
  const cleanQ = cleanText(q);
  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 0);
  const detectedSuggestion = cleanQ ? findBestCategorySuggestion(cleanQ) : null;

  const scored = [];

  for (const prof of professionals) {
    // Filtro de Categoria
    if (cleanSpecialty && cleanSpecialty !== 'todas') {
      const hasSpec = prof.specialties?.some((s) => {
        const norm = cleanText(s);
        return norm === cleanSpecialty || norm.includes(cleanSpecialty);
      });
      if (!hasSpec) continue;
    }

    // Filtro de Cidade (insensível a acentos)
    if (cleanCity) {
      const profCity = cleanText(prof.city);
      const isCityMatch = profCity.includes(cleanCity) || cleanCity.includes(profCity);
      if (!isCityMatch) {
        const sim = calculateSimilarity(profCity, cleanCity);
        if (sim < 0.75) continue;
      }
    }

    // Filtro de Raio
    if (radius && Number(radius) > 0) {
      if ((prof.service_radius_km || 0) > Number(radius)) {
        continue;
      }
    }

    // Se busca vazia
    if (!cleanQ || qTokens.length === 0) {
      scored.push({ professional: prof, score: 100 });
      continue;
    }

    let bestScore = 0;
    const nameText = cleanText(prof.name);
    const bioText = cleanText(prof.bio);
    const profCityText = cleanText(prof.city);

    // Especialidades e Sinônimos
    for (const spec of prof.specialties || []) {
      const cleanSpec = cleanText(spec);
      if (cleanSpec === cleanQ || cleanSpec.includes(cleanQ) || cleanQ.includes(cleanSpec)) {
        bestScore = Math.max(bestScore, 95);
      } else {
        const sim = calculateSimilarity(cleanQ, cleanSpec);
        if (sim >= 0.70) {
          bestScore = Math.max(bestScore, Math.round(sim * 90));
        }
      }

      const syns = SPECIALTY_SYNONYMS[spec] || [];
      for (const syn of syns) {
        if (syn === cleanQ || syn.includes(cleanQ) || cleanQ.includes(syn)) {
          bestScore = Math.max(bestScore, 90);
        } else {
          const sim = calculateSimilarity(cleanQ, syn);
          if (sim >= 0.75) {
            bestScore = Math.max(bestScore, Math.round(sim * 85));
          }
        }
      }
    }

    // Nome
    if (nameText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 100);
    } else {
      const nameWords = nameText.split(/\s+/);
      for (const qToken of qTokens) {
        for (const nw of nameWords) {
          const { isMatch, similarity } = isFuzzyWordMatch(qToken, nw);
          if (isMatch) {
            bestScore = Math.max(bestScore, Math.round(similarity * 95));
          }
        }
      }
    }

    // Cidade
    if (profCityText && profCityText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 80);
    }

    // Biografia
    if (bioText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 70);
    } else {
      const bioWords = bioText.split(/\s+/).slice(0, 80);
      for (const qToken of qTokens) {
        if (qToken.length >= 4) {
          for (const bw of bioWords) {
            const { isMatch, similarity } = isFuzzyWordMatch(qToken, bw);
            if (isMatch) {
              bestScore = Math.max(bestScore, Math.round(similarity * 65));
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
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.map((item) => item.professional),
    detectedSuggestion,
  };
}
