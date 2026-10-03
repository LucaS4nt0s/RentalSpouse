/**
 * Motor de Busca Inteligente com Tolerância a Erros e Insensibilidade a Acentos
 * Estilo Spotify / YouTube / Algolia para o RentalSpouse.
 */

import { Professional } from '../types/professional';

/**
 * Remove acentos, caracteres especiais supérfluos e normaliza para minúsculas.
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
 * Limpa o texto mantendo apenas caracteres alfanuméricos e espaços.
 */
export function cleanText(str: string | null | undefined): string {
  return normalizeText(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Distância de Damerau-Levenshtein (inserção, deleção, substituição e transposição de adjacentes).
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

      // Transposição (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[al][bl];
}

/**
 * Calcula a similaridade entre duas strings (0 a 1).
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = damerauLevenshtein(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Catálogo semântico de sinônimos e termos populares por especialidade.
 * Permite que "eletricista" encontre "Elétrica", "encanador" encontre "Hidráulica", etc.
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

export interface MatchResult {
  professional: Professional;
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
 * Avalia se uma palavra da query aproxima-se de uma palavra alvo com tolerância a erros.
 */
function isFuzzyWordMatch(queryWord: string, targetWord: string): { isMatch: boolean; similarity: number } {
  if (queryWord === targetWord) {
    return { isMatch: true, similarity: 1 };
  }

  // Prefix match
  if (targetWord.startsWith(queryWord) && queryWord.length >= 3) {
    return { isMatch: true, similarity: 0.95 };
  }

  // Se a palavra da query for pequena (<= 3 chars), exige match exato ou prefixo
  if (queryWord.length <= 3) {
    return { isMatch: false, similarity: 0 };
  }

  const dist = damerauLevenshtein(queryWord, targetWord);
  const maxLen = Math.max(queryWord.length, targetWord.length);
  const sim = 1 - dist / maxLen;

  // Tolerância progressiva baseada no tamanho da palavra
  if (queryWord.length <= 5) {
    // 4 a 5 letras: permite 1 erro (ex: "eletra" -> "eletrica" dist=2 n aceita, "lukas" -> "lucas" dist=1 aceita)
    return { isMatch: dist <= 1, similarity: sim };
  } else {
    // 6 ou mais letras: permite até 2 erros (ex: "eletria" -> "eletrica", "encanadro" -> "encanador")
    return { isMatch: dist <= 2, similarity: sim };
  }
}

/**
 * Identifica se a query digitada é um termo próximo ou sinônimo de uma categoria oficial.
 */
export function findBestCategorySuggestion(query: string): { suggested: string; isSynonym: boolean } | null {
  const cleanQ = cleanText(query);
  if (!cleanQ || cleanQ.length < 3) return null;

  let bestCat: string | null = null;
  let highestScore = 0;
  let isSynonym = false;

  for (const [category, synonyms] of Object.entries(SPECIALTY_SYNONYMS)) {
    const cleanCat = cleanText(category);

    // Match exato ou prefixo com a própria categoria
    if (cleanCat.includes(cleanQ) || cleanQ.includes(cleanCat)) {
      return { suggested: category, isSynonym: false };
    }

    const simCat = calculateSimilarity(cleanQ, cleanCat);
    if (simCat > highestScore && simCat >= 0.70) {
      highestScore = simCat;
      bestCat = category;
      isSynonym = false;
    }

    // Match com a lista de sinônimos
    for (const syn of synonyms) {
      if (syn === cleanQ || syn.startsWith(cleanQ)) {
        return { suggested: category, isSynonym: true };
      }
      const sim = calculateSimilarity(cleanQ, syn);
      if (sim > highestScore && sim >= 0.75) {
        highestScore = sim;
        bestCat = category;
        isSynonym = true;
      }
    }
  }

  if (bestCat && highestScore >= 0.70) {
    return { suggested: bestCat, isSynonym };
  }

  return null;
}

/**
 * Filtra e ranqueia profissionais com:
 * 1. Insensibilidade total a acentos e maiúsculas
 * 2. Tolerância a erros ortográficos (Fuzzy Matching estilo YouTube/Spotify)
 * 3. Mapeamento de sinônimos residenciais (ex: "eletricista" -> "Elétrica")
 * 4. Ordenação por relevância do resultado
 */
export function filterProfessionalsIntelligent(
  professionals: Professional[],
  { q = '', specialty = '', city = '' }: SearchFilterOptions
): { results: Professional[]; detectedSuggestion: string | null } {
  if (!Array.isArray(professionals)) {
    return { results: [], detectedSuggestion: null };
  }

  const cleanSpecialty = cleanText(specialty);
  const cleanCity = cleanText(city);
  const cleanQ = cleanText(q);
  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 0);

  // Detecta se a query geral sugere alguma categoria por aproximação ou sinônimo
  const suggestion = cleanQ ? findBestCategorySuggestion(cleanQ) : null;
  const detectedSuggestion = suggestion ? suggestion.suggested : null;

  const scored: MatchResult[] = [];

  for (const prof of professionals) {
    // 1. Filtro estrito de Categoria Selecionada (se houver chip ativo)
    if (cleanSpecialty && cleanSpecialty !== 'todas') {
      const hasSpec = prof.specialties?.some((s) => {
        const norm = cleanText(s);
        return norm === cleanSpecialty || norm.includes(cleanSpecialty);
      });
      if (!hasSpec) continue;
    }

    // 2. Filtro estrito de Cidade Selecionada (com insensibilidade a acentos)
    if (cleanCity) {
      const profCity = cleanText(prof.city);
      const isCityMatch = profCity.includes(cleanCity) || cleanCity.includes(profCity);
      if (!isCityMatch) {
        // Tolerância de 1 erro em cidades com 5+ caracteres
        const sim = calculateSimilarity(profCity, cleanCity);
        if (sim < 0.75) continue;
      }
    }

    // 3. Se não houver texto de busca livre (q), inclui diretamente
    if (!cleanQ || qTokens.length === 0) {
      scored.push({ professional: prof, score: 100 });
      continue;
    }

    // 4. Avaliação de relevância e similaridade fonética/ortográfica
    let bestScore = 0;
    let matchReason = '';

    const nameText = cleanText(prof.name);
    const bioText = cleanText(prof.bio);
    const profCityText = cleanText(prof.city);
    const specTexts = (prof.specialties || []).map(cleanText);

    // A. Match com Especialidades (Exato, Prefixo ou Sinônimo)
    for (const spec of prof.specialties || []) {
      const cleanSpec = cleanText(spec);
      if (cleanSpec === cleanQ || cleanSpec.includes(cleanQ) || cleanQ.includes(cleanSpec)) {
        bestScore = Math.max(bestScore, 95);
        matchReason = `Especialidade: ${spec}`;
      } else {
        // Similaridade ortográfica com a especialidade (ex: "eletria" -> "eletrica")
        const sim = calculateSimilarity(cleanQ, cleanSpec);
        if (sim >= 0.70) {
          bestScore = Math.max(bestScore, Math.round(sim * 90));
          matchReason = `Aproximação com ${spec}`;
        }
      }

      // Sinônimos da especialidade (ex: "encanador" -> "Hidráulica")
      const syns = SPECIALTY_SYNONYMS[spec] || [];
      for (const syn of syns) {
        if (syn === cleanQ || syn.includes(cleanQ) || cleanQ.includes(syn)) {
          bestScore = Math.max(bestScore, 90);
          matchReason = `Sinônimo de ${spec}`;
        } else {
          const sim = calculateSimilarity(cleanQ, syn);
          if (sim >= 0.75) {
            bestScore = Math.max(bestScore, Math.round(sim * 85));
            matchReason = `Aproximação (${syn})`;
          }
        }
      }
    }

    // B. Match no Nome do Profissional (com tolerância a erros e acentos)
    if (nameText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 100);
      matchReason = 'Nome correspondente';
    } else {
      const nameWords = nameText.split(/\s+/);
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
    if (profCityText && profCityText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 80);
      matchReason = 'Cidade correspondente';
    }

    // D. Match na Biografia
    if (bioText.includes(cleanQ)) {
      bestScore = Math.max(bestScore, 70);
      matchReason = 'Biografia';
    } else {
      // Procura tokens da query na bio com fuzzy
      const bioWords = bioText.split(/\s+/).slice(0, 100); // Primeiras 100 palavras
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

    // Threshold de aceitação: pontuação mínima de 50
    if (bestScore >= 50) {
      scored.push({
        professional: prof,
        score: bestScore,
        matchedReason: matchReason,
        suggestedTerm: detectedSuggestion || undefined,
      });
    }
  }

  // Ordena por relevância decrescente (exatos primeiro, depois aproximações)
  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored.map((item) => item.professional),
    detectedSuggestion: cleanQ && detectedSuggestion ? detectedSuggestion : null,
  };
}
