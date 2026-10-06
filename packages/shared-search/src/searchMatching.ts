/**
 * Motor de Busca Inteligente e Tolerância a Erros para RentalSpouse (Web e Mobile).
 * Implementa normalização de acentos, similaridade Damerau-Levenshtein,
 * mapeamento semântico de sinônimos e eliminação estrita de falsos positivos em sinônimos curtos.
 */

export interface ProfessionalData {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  bio: string;
  service_radius_km?: number | null;
  specialties: string[];
  city?: string | null;
  state?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MatchResult<T = ProfessionalData> {
  professional: T;
  score: number;
  matchedReason?: string;
  suggestedTerm?: string;
}

export interface SearchFilterOptions {
  q?: string;
  specialty?: string;
  city?: string;
}

/**
 * Remove acentos, caracteres diacríticos e converte para minúsculas.
 * Ex: "São Paulo" -> "sao paulo", "Elétrica" -> "eletrica".
 */
export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normaliza e mantém apenas caracteres alfanuméricos e espaços simples.
 */
export function cleanText(str: string | null | undefined): string {
  return normalizeText(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Distância de Damerau-Levenshtein (inserção, deleção, substituição e transposição adjacente).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const matrix: number[][] = Array.from({ length: al + 1 }, () =>
    new Array(bl + 1).fill(0)
  );

  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deleção
        matrix[i][j - 1] + 1, // inserção
        matrix[i - 1][j - 1] + cost // substituição
      );

      // Transposição
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[al][bl];
}

/**
 * Similaridade normalizada entre duas strings no intervalo [0, 1].
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = damerauLevenshtein(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Catálogo Canônico Unificado de Sinônimos por Especialidade.
 * Compartilhado entre Web e Mobile para consistência absoluta nos resultados.
 */
export const SPECIALTY_SYNONYMS: Record<string, string[]> = {
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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Avalia se uma palavra da query aproxima-se de uma palavra alvo com tolerância a erros.
 */
export function isFuzzyWordMatch(
  queryWord: string,
  targetWord: string
): { isMatch: boolean; similarity: number } {
  if (queryWord === targetWord) {
    return { isMatch: true, similarity: 1 };
  }

  // Se a palavra da query for pequena (<= 3 chars), EXIGE correspondência exata
  if (queryWord.length <= 3) {
    return { isMatch: false, similarity: 0 };
  }

  // Prefixo para palavras com 4+ caracteres
  if (targetWord.startsWith(queryWord) && queryWord.length >= 4) {
    return { isMatch: true, similarity: 0.95 };
  }

  const dist = damerauLevenshtein(queryWord, targetWord);
  const maxLen = Math.max(queryWord.length, targetWord.length);
  const sim = 1 - dist / maxLen;

  if (queryWord.length <= 5) {
    // 4 a 5 letras: permite no máximo 1 erro se sim >= 0.75
    return { isMatch: dist <= 1 && sim >= 0.75, similarity: sim };
  } else {
    // 6 ou mais letras: permite até 2 erros
    return { isMatch: dist <= 2 && sim >= 0.70, similarity: sim };
  }
}

/**
 * Avalia casamento entre um termo/sinônimo e a query digitada pelo usuário.
 * PREVINE RIGOROSAMENTE falsos positivos por substrings curtas:
 * - Para termos < 4 caracteres (como "ar", "pia", "fio", "luz"), NUNCA usa includes().
 *   Exige comparação exata de palavra inteira (token).
 * - Termos de múltiplas palavras exigem casamento de fronteira de palavras.
 */
export function matchSynonymOrTerm(
  targetTerm: string,
  cleanQ: string,
  qTokens: string[]
): { isMatch: boolean; score: number; isApprox: boolean } {
  const cleanTarget = cleanText(targetTerm);
  if (!cleanTarget || !cleanQ) {
    return { isMatch: false, score: 0, isApprox: false };
  }

  // 1. Igualdade exata com toda a busca
  if (cleanQ === cleanTarget) {
    return { isMatch: true, score: 95, isApprox: false };
  }

  const targetTokens = cleanTarget.split(/\s+/).filter(Boolean);

  // 2. Termo composto (ex: "ar condicionado", "curto circuito")
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

  // 3. Termos curtos (< 4 caracteres, ex: "ar", "pia", "fio", "luz"):
  // OBRIGATORIAMENTE exige que a palavra tenha sido digitada exatamente como token isolado!
  // NUNCA permite substring arbitrária (ex: "reparo", "armário", "largar" NÃO casam com "ar").
  if (cleanTarget.length < 4) {
    const hasExactToken = qTokens.includes(cleanTarget);
    if (hasExactToken) {
      return { isMatch: true, score: 90, isApprox: false };
    }
    return { isMatch: false, score: 0, isApprox: false };
  }

  // 4. Termos com 4+ caracteres:
  // A. Match exato de token
  if (qTokens.includes(cleanTarget)) {
    return { isMatch: true, score: 90, isApprox: false };
  }

  // B. Prefixo seguro para palavras médias/longas
  for (const qToken of qTokens) {
    if (qToken.length >= 4) {
      if (cleanTarget.startsWith(qToken) || (cleanTarget.length >= 4 && qToken.startsWith(cleanTarget))) {
        return { isMatch: true, score: 88, isApprox: false };
      }
    }
  }

  // C. Tolerância a erros (fuzzy) APENAS se ambas as strings tiverem tamanho >= 4
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

/**
 * Identifica se a query digitada é um termo próximo ou sinônimo de uma categoria oficial.
 */
export function findBestCategorySuggestion(
  query: string
): { suggested: string; isSynonym: boolean } | null {
  const cleanQ = cleanText(query);
  if (!cleanQ || cleanQ.length < 3) return null;

  const qTokens = cleanQ.split(/\s+/).filter(Boolean);
  let bestCat: string | null = null;
  let highestScore = 0;
  let isSynonym = false;

  for (const [category, synonyms] of Object.entries(SPECIALTY_SYNONYMS)) {
    const cleanCat = cleanText(category);

    // Match exato ou prefixo seguro com o nome da categoria
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

    // Match seguro com os sinônimos
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

/**
 * Filtra e ranqueia profissionais com:
 * 1. Insensibilidade total a acentos e maiúsculas
 * 2. Tolerância a erros ortográficos (Fuzzy Matching estilo Spotify/YouTube)
 * 3. Mapeamento semântico de sinônimos com eliminação de falsos positivos
 * 4. Ordenação por relevância do resultado
 */
export function filterProfessionalsIntelligent<T extends ProfessionalData = ProfessionalData>(
  professionals: T[],
  { q = '', specialty = '', city = '' }: SearchFilterOptions = {}
): { results: T[]; detectedSuggestion: string | null } {
  if (!Array.isArray(professionals)) {
    return { results: [], detectedSuggestion: null };
  }

  const cleanSpecialty = cleanText(specialty);
  const cleanCity = cleanText(city);
  const cleanQ = cleanText(q);
  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 0);

  const suggestion = cleanQ ? findBestCategorySuggestion(cleanQ) : null;
  const detectedSuggestion = suggestion ? suggestion.suggested : null;

  const scored: MatchResult<T>[] = [];

  for (const prof of professionals) {
    // 1. Filtro estrito de Categoria Selecionada (se houver chip ativo)
    if (cleanSpecialty && cleanSpecialty !== 'todas') {
      const hasSpec = prof.specialties?.some((s) => {
        const norm = cleanText(s);
        return norm === cleanSpecialty || (norm.length >= 4 && norm.includes(cleanSpecialty));
      });
      if (!hasSpec) continue;
    }

    // 2. Filtro estrito de Cidade Selecionada (com insensibilidade a acentos)
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

    // 3. Se não houver busca textual livre (q), inclui diretamente
    if (!cleanQ || qTokens.length === 0) {
      scored.push({ professional: prof, score: 100 });
      continue;
    }

    // 4. Avaliação de relevância textual
    let bestScore = 0;
    let matchReason = '';

    const nameText = cleanText(prof.name);
    const bioText = cleanText(prof.bio);
    const profCityText = cleanText(prof.city);

    // A. Match com Especialidades e Sinônimos
    for (const spec of prof.specialties || []) {
      const cleanSpec = cleanText(spec);

      // Casamento com a própria especialidade declarada
      const specMatch = matchSynonymOrTerm(cleanSpec, cleanQ, qTokens);
      if (specMatch.isMatch && specMatch.score > bestScore) {
        bestScore = specMatch.score;
        matchReason = specMatch.isApprox
          ? `Aproximação com ${spec}`
          : `Especialidade: ${spec}`;
      }

      // Casamento com os sinônimos da especialidade
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

    // B. Match no Nome do Profissional
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

    // C. Match na Cidade
    if (profCityText && (profCityText === cleanQ || profCityText.includes(cleanQ))) {
      bestScore = Math.max(bestScore, 80);
      matchReason = 'Cidade correspondente';
    }

    // D. Match na Biografia
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
