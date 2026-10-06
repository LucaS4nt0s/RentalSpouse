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

export declare function normalizeText(str: string | null | undefined): string;
export declare function cleanText(str: string | null | undefined): string;
export declare function damerauLevenshtein(a: string, b: string): number;
export declare function calculateSimilarity(a: string, b: string): number;
export declare const SPECIALTY_SYNONYMS: Record<string, string[]>;
export declare function isFuzzyWordMatch(
  queryWord: string,
  targetWord: string
): { isMatch: boolean; similarity: number };
export declare function matchSynonymOrTerm(
  targetTerm: string,
  cleanQ: string,
  qTokens: string[]
): { isMatch: boolean; score: number; isApprox: boolean };
export declare function findBestCategorySuggestion(
  query: string
): { suggested: string; isSynonym: boolean } | null;
export declare function filterProfessionalsIntelligent<T extends ProfessionalData = ProfessionalData>(
  professionals: T[],
  filters?: SearchFilterOptions
): { results: T[]; detectedSuggestion: string | null };
