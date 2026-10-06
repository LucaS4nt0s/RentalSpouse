"""Motor de busca inteligente do RentalSpouse (backend).

Implementa normalização de acentos, similaridade Damerau-Levenshtein, catálogo
de sinônimos por especialidade e ranqueamento por relevância. Espelha o pacote
`@rentalspouse/shared-search` para que a busca funcione no servidor e seja
consistente com o filtro otimista do frontend.

O módulo depende apenas da biblioteca padrão, o que o torna portável (SQLite nos
testes e PostgreSQL em produção) e testável sem subir a aplicação.
"""

import re
import unicodedata
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple


SPECIALTY_SYNONYMS: Dict[str, List[str]] = {
    "Elétrica": [
        "eletrica", "eletrico", "eletricista", "fiacao", "tomada", "disjuntor",
        "luz", "iluminacao", "curto circuito", "quadro de luz", "fio", "lustre",
        "interruptor",
    ],
    "Hidráulica": [
        "hidraulica", "hidraulico", "encanador", "encanamento", "vazamento",
        "desentupimento", "desentupidor", "torneira", "chuveiro", "cano", "pia",
        "infiltracao", "esgoto", "bombeiro hidraulico", "ralo", "sifao", "descarga",
    ],
    "Pintura": [
        "pintura", "pintor", "pintar", "tinta", "parede", "verniz",
        "massa corrida", "emassamento", "textura", "grafiato", "rolinho",
    ],
    "Montagem de Móveis": [
        "montagem de moveis", "montagem", "montador", "moveis", "armario",
        "guarda roupa", "comoda", "mesa", "estante", "rack", "painel",
        "instalacao de tv", "suporte tv",
    ],
    "Marcenaria": [
        "marcenaria", "marceneiro", "madeira", "moveis planejados", "porta",
        "gaveta", "compensado", "mdf", "puxador",
    ],
    "Limpeza": [
        "limpeza", "faxina", "faxineira", "diarista", "limpeza pos obra",
        "higienizacao", "lavagem", "aspirador", "vidros",
    ],
    "Jardinagem": [
        "jardinagem", "jardineiro", "grama", "jardim", "poda", "cortar grama",
        "arvore", "paisagismo", "plantas",
    ],
    "Ar-condicionado": [
        "ar condicionado", "ar-condicionado", "ar", "climatizacao", "split",
        "refrigeracao", "limpeza de ar", "instalacao ar", "gas ar",
    ],
    "Reparos Gerais": [
        "reparos gerais", "reparos", "reparo", "marido de aluguel", "faz tudo",
        "conserto", "instalacao", "furadeira", "quadros", "fechadura", "varal",
        "cortina", "persiana",
    ],
}


def normalize_text(text: Optional[str]) -> str:
    """Remove acentos, converte para minúsculas e colapsa espaços múltiplos."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    cleaned = "".join(c for c in normalized if not unicodedata.combining(c)).lower()
    return " ".join(cleaned.split())


def clean_text(text: Optional[str]) -> str:
    """Normaliza e mantém apenas caracteres alfanuméricos e espaços simples."""
    without_symbols = re.sub(r"[^a-z0-9\s]", " ", normalize_text(text))
    return re.sub(r"\s+", " ", without_symbols).strip()


# Lookup do catálogo indexado pela versão normalizada, para casar a especialidade
# salva mesmo que o valor no banco venha sem acento ou em caixa diferente.
_SYNONYMS_BY_NORMALIZED = {
    clean_text(category): synonyms for category, synonyms in SPECIALTY_SYNONYMS.items()
}


def synonyms_for(specialty: Optional[str]) -> List[str]:
    """Retorna os sinônimos canônicos de uma especialidade, tolerante a acento/caixa."""
    return _SYNONYMS_BY_NORMALIZED.get(clean_text(specialty), [])


# Limites defensivos para evitar custo quadrático descontrolado em buscas longas.
MAX_QUERY_TOKENS = 12
MAX_TOKEN_LENGTH = 40


def damerau_levenshtein(a: str, b: str) -> int:
    """Distância de Damerau-Levenshtein (inserção, deleção, substituição e transposição)."""
    al, bl = len(a), len(b)
    if al == 0:
        return bl
    if bl == 0:
        return al

    matrix = [[0] * (bl + 1) for _ in range(al + 1)]
    for i in range(al + 1):
        matrix[i][0] = i
    for j in range(bl + 1):
        matrix[0][j] = j

    for i in range(1, al + 1):
        for j in range(1, bl + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            matrix[i][j] = min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            )
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                matrix[i][j] = min(matrix[i][j], matrix[i - 2][j - 2] + 1)

    return matrix[al][bl]


@lru_cache(maxsize=32768)
def calculate_similarity(a: str, b: str) -> float:
    """Similaridade normalizada entre duas strings no intervalo [0, 1]."""
    if a == b:
        return 1.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    # Poda: a distância é sempre >= diferença de tamanho. Se a diferença já
    # ultrapassa o limiar usado pelo matching (0.75), o resultado seria 0.
    if abs(len(a) - len(b)) > max_len * 0.25:
        return 0.0
    return max(0.0, 1 - damerau_levenshtein(a, b) / max_len)


@lru_cache(maxsize=32768)
def is_fuzzy_word_match(query_word: str, target_word: str) -> Tuple[bool, float]:
    """Avalia se uma palavra da busca aproxima-se de uma palavra alvo com tolerância a erros."""
    if query_word == target_word:
        return True, 1.0
    if len(query_word) <= 3:
        return False, 0.0
    if target_word.startswith(query_word) and len(query_word) >= 4:
        return True, 0.95

    # Poda barata: a distância nunca é menor que a diferença de tamanho, então
    # pares com tamanhos muito distantes não passariam do limiar e nem calculam a matriz.
    if abs(len(query_word) - len(target_word)) > 2:
        return False, 0.0

    dist = damerau_levenshtein(query_word, target_word)
    sim = 1 - dist / max(len(query_word), len(target_word))

    if len(query_word) <= 5:
        return (dist <= 1 and sim >= 0.75), sim
    return (dist <= 2 and sim >= 0.70), sim


def match_synonym_or_term(
    target_term: str, clean_q: str, q_tokens: List[str]
) -> Tuple[bool, int, bool]:
    """Avalia o casamento de um termo/sinônimo com a busca, evitando falsos positivos curtos."""
    clean_target = clean_text(target_term)
    if not clean_target or not clean_q:
        return False, 0, False

    if clean_q == clean_target:
        return True, 95, False

    target_tokens = clean_target.split()
    if len(target_tokens) > 1:
        if re.search(rf"(^|\s){re.escape(clean_target)}(\s|$)", clean_q):
            return True, 90, False
        if len(clean_q) >= 4 and re.search(rf"(^|\s){re.escape(clean_q)}(\s|$)", clean_target):
            return True, 90, False

    if len(clean_target) < 4:
        return (True, 90, False) if clean_target in q_tokens else (False, 0, False)

    if clean_target in q_tokens:
        return True, 90, False

    for q_token in q_tokens:
        if len(q_token) >= 4 and (
            clean_target.startswith(q_token)
            or (len(clean_target) >= 4 and q_token.startswith(clean_target))
        ):
            return True, 88, False

    # Comparação da busca inteira só vale a pena para consultas curtas; para
    # consultas longas o loop por token abaixo cobre a tolerância a erros.
    if 4 <= len(clean_q) <= 40:
        sim = calculate_similarity(clean_q, clean_target)
        if sim >= 0.75:
            return True, round(sim * 85), True

    for q_token in q_tokens:
        if len(q_token) >= 4:
            token_sim = calculate_similarity(q_token, clean_target)
            if token_sim >= 0.78:
                return True, round(token_sim * 85), True

    return False, 0, False


def find_best_category_suggestion(
    query: str,
) -> Optional[Tuple[str, bool]]:
    """Identifica se a busca é um termo próximo ou sinônimo de uma categoria oficial."""
    clean_q = clean_text(query)
    if not clean_q or len(clean_q) < 3:
        return None

    q_tokens = clean_q.split()
    best_cat: Optional[str] = None
    highest_score = 0
    is_synonym = False

    for category, synonyms in SPECIALTY_SYNONYMS.items():
        clean_cat = clean_text(category)

        if clean_cat == clean_q or (len(clean_cat) >= 4 and clean_cat.startswith(clean_q)):
            return category, False

        if len(clean_q) >= 4:
            sim_cat = calculate_similarity(clean_q, clean_cat)
            if sim_cat > highest_score and sim_cat >= 0.75:
                highest_score = sim_cat
                best_cat = category
                is_synonym = False

        for syn in synonyms:
            is_match, score, _ = match_synonym_or_term(syn, clean_q, q_tokens)
            if is_match and score > highest_score:
                highest_score = score
                best_cat = category
                is_synonym = True

    if best_cat and highest_score >= 70:
        return best_cat, is_synonym
    return None


def _field(obj: Any, name: str, default: Any = None) -> Any:
    """Lê um campo tanto de objetos ORM quanto de dicionários."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def filter_professionals_intelligent(
    professionals: List[Any],
    q: str = "",
    specialty: str = "",
    city: str = "",
) -> Tuple[List[Any], Optional[str]]:
    """Filtra e ranqueia profissionais por acento, sinônimo e tolerância a erros.

    Retorna a lista ordenada por relevância e a categoria sugerida (se houver).
    """
    if not isinstance(professionals, list):
        return [], None

    clean_specialty = clean_text(specialty)
    clean_city = clean_text(city)
    clean_q = clean_text(q)[:120]
    q_tokens = [t[:MAX_TOKEN_LENGTH] for t in clean_q.split() if t][:MAX_QUERY_TOKENS]

    suggestion = find_best_category_suggestion(clean_q) if clean_q else None
    detected_suggestion = suggestion[0] if suggestion else None

    scored: List[Tuple[int, Any]] = []

    for prof in professionals:
        specialties = _field(prof, "specialties") or []

        if clean_specialty and clean_specialty != "todas":
            has_spec = any(
                clean_text(s) == clean_specialty
                or (len(clean_text(s)) >= 4 and clean_specialty in clean_text(s))
                for s in specialties
                if isinstance(s, str)
            )
            if not has_spec:
                continue

        if clean_city:
            prof_city = clean_text(_field(prof, "city"))
            # Profissionais sem cidade cadastrada não podem "casar" com a cidade
            # buscada (evita que "" seja substring de qualquer termo).
            if not prof_city:
                continue
            is_city_match = (
                prof_city == clean_city
                or clean_city in prof_city
                or prof_city in clean_city
            )
            if not is_city_match and calculate_similarity(prof_city, clean_city) < 0.75:
                continue

        if not clean_q or not q_tokens:
            scored.append((100, prof))
            continue

        best_score = 0
        name_text = clean_text(_field(prof, "name"))
        bio_text = clean_text(_field(prof, "bio"))
        prof_city_text = clean_text(_field(prof, "city"))

        for spec in specialties:
            if not isinstance(spec, str):
                continue
            clean_spec = clean_text(spec)
            is_match, score, _ = match_synonym_or_term(clean_spec, clean_q, q_tokens)
            if is_match and score > best_score:
                best_score = score

            for syn in synonyms_for(spec):
                is_match, score, _ = match_synonym_or_term(syn, clean_q, q_tokens)
                if is_match and score > best_score:
                    best_score = score

        if clean_q in name_text:
            best_score = max(best_score, 100)
        else:
            name_words = [w for w in name_text.split() if w]
            for q_token in q_tokens:
                for name_word in name_words:
                    is_match, similarity = is_fuzzy_word_match(q_token, name_word)
                    if is_match:
                        best_score = max(best_score, round(similarity * 95))

        if prof_city_text and (prof_city_text == clean_q or clean_q in prof_city_text):
            best_score = max(best_score, 80)

        if clean_q in bio_text:
            best_score = max(best_score, 70)
        else:
            bio_words = bio_text.split()[:100]
            for q_token in q_tokens:
                if len(q_token) < 4:
                    continue
                for bio_word in bio_words:
                    is_match, similarity = is_fuzzy_word_match(q_token, bio_word)
                    if is_match:
                        best_score = max(best_score, round(similarity * 65))
                        break

        if best_score >= 50:
            scored.append((best_score, prof))

    scored.sort(key=lambda item: item[0], reverse=True)

    results = [prof for _, prof in scored]
    return results, (detected_suggestion if clean_q else None)
