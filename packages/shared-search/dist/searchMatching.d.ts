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
export declare function normalizeText(str: string | null | undefined): string;
/**
 * Normaliza e mantém apenas caracteres alfanuméricos e espaços simples.
 */
export declare function cleanText(str: string | null | undefined): string;
/**
 * Distância de Damerau-Levenshtein (inserção, deleção, substituição e transposição adjacente).
 */
export declare function damerauLevenshtein(a: string, b: string): number;
/**
 * Similaridade normalizada entre duas strings no intervalo [0, 1].
 */
export declare function calculateSimilarity(a: string, b: string): number;
/**
 * Catálogo Canônico Unificado de Sinônimos por Especialidade.
 * Compartilhado entre Web e Mobile para consistência absoluta nos resultados.
 */
export declare const SPECIALTY_SYNONYMS: Record<string, string[]>;
/**
 * Avalia se uma palavra da query aproxima-se de uma palavra alvo com tolerância a erros.
 */
export declare function isFuzzyWordMatch(queryWord: string, targetWord: string): {
    isMatch: boolean;
    similarity: number;
};
/**
 * Avalia casamento entre um termo/sinônimo e a query digitada pelo usuário.
 * PREVINE RIGOROSAMENTE falsos positivos por substrings curtas:
 * - Para termos < 4 caracteres (como "ar", "pia", "fio", "luz"), NUNCA usa includes().
 *   Exige comparação exata de palavra inteira (token).
 * - Termos de múltiplas palavras exigem casamento de fronteira de palavras.
 */
export declare function matchSynonymOrTerm(targetTerm: string, cleanQ: string, qTokens: string[]): {
    isMatch: boolean;
    score: number;
    isApprox: boolean;
};
/**
 * Identifica se a query digitada é um termo próximo ou sinônimo de uma categoria oficial.
 */
export declare function findBestCategorySuggestion(query: string): {
    suggested: string;
    isSynonym: boolean;
} | null;
/**
 * Filtra e ranqueia profissionais com:
 * 1. Insensibilidade total a acentos e maiúsculas
 * 2. Tolerância a erros ortográficos (Fuzzy Matching estilo Spotify/YouTube)
 * 3. Mapeamento semântico de sinônimos com eliminação de falsos positivos
 * 4. Ordenação por relevância do resultado
 */
export declare function filterProfessionalsIntelligent<T extends ProfessionalData = ProfessionalData>(professionals: T[], { q, specialty, city }?: SearchFilterOptions): {
    results: T[];
    detectedSuggestion: string | null;
};
