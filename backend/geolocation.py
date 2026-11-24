"""Utilitários de geolocalização e cálculo de distância entre endereços (backend).

Calcula a distância geodésica via fórmula de Haversine a partir de coordenadas
explícitas ou resolvidas deterministicamente a partir do CEP/cidade/estado e
detalhes de logradouro/bairro/número — sem dependências externas.
"""

import hashlib
import math
import unicodedata
from typing import Any, Dict, Optional, Tuple


_EARTH_RADIUS_KM = 6371.0

# Coordenadas aproximadas do centro de capitais e polos brasileiros.
_CITY_COORDS: Dict[str, Tuple[float, float]] = {
    "sao paulo": (-23.5505, -46.6333),
    "campinas": (-22.9099, -47.0626),
    "santos": (-23.9608, -46.3336),
    "guarulhos": (-23.4543, -46.5337),
    "santo andre": (-23.6639, -46.5383),
    "sao bernardo do campo": (-23.6914, -46.5646),
    "osasco": (-23.5325, -46.7917),
    "sorocaba": (-23.5015, -47.4526),
    "ribeirao preto": (-21.1775, -47.8103),
    "sao jose dos campos": (-23.2237, -45.9009),
    "barueri": (-23.5112, -46.8761),
    "mogi das cruzes": (-23.5225, -46.1883),
    "sao caetano do sul": (-23.6229, -46.5548),
    "diadema": (-23.6861, -46.6228),
    "maua": (-23.6678, -46.4614),
    "carapicuiba": (-23.5227, -46.8358),
    "cotia": (-23.6039, -46.9189),
    "taboao da serra": (-23.6086, -46.7575),
    "suzano": (-23.5425, -46.3108),
    "itaquaquecetuba": (-23.4864, -46.3483),
    "jundiai": (-23.1857, -46.8978),
    "piracicaba": (-22.7253, -47.6492),
    "bauru": (-22.3145, -49.0606),
    "sao jose do rio preto": (-20.8197, -49.3794),
    "franca": (-20.5386, -47.4008),
    "americana": (-22.7392, -47.3314),
    "indaiatuba": (-23.0903, -47.2181),
    "taubate": (-23.0264, -45.5553),
    "jacarei": (-23.3053, -45.9658),
    "praia grande": (-24.0058, -46.4028),
    "sao vicente": (-23.9631, -46.3919),
    "guaruja": (-23.9931, -46.2564),
    "braganca paulista": (-22.9519, -46.5419),
    "atibaia": (-23.1169, -46.5503),
    "itu": (-23.2642, -47.2992),
    "sao joao da boa vista": (-21.9692, -46.7983),
    "mogi guacu": (-22.3719, -46.9428),
    "mogi mirim": (-22.4319, -46.9578),
    "rio de janeiro": (-22.9068, -43.1729),
    "niteroi": (-22.8833, -43.1036),
    "duque de caxias": (-22.7856, -43.3117),
    "nova iguacu": (-22.7556, -43.4603),
    "sao goncalo": (-22.8269, -43.0539),
    "petropolis": (-22.5050, -43.1786),
    "volta redonda": (-22.5231, -44.1042),
    "campos dos goytacazes": (-21.7545, -41.3244),
    "cabo frio": (-22.8794, -42.0186),
    "macae": (-22.3708, -41.7869),
    "belo horizonte": (-19.9167, -43.9345),
    "uberlandia": (-18.9113, -48.2622),
    "contagem": (-19.9317, -44.0536),
    "juiz de fora": (-21.7642, -43.3503),
    "pocos de caldas": (-21.7878, -46.5614),
    "pouso alegre": (-22.2300, -45.9364),
    "varginha": (-21.5514, -45.4303),
    "passos": (-20.7189, -46.6097),
    "muzambinho": (-21.3758, -46.5256),
    "machado": (-21.6747, -45.9197),
    "inconfidentes": (-22.3172, -46.3283),
    "itajuba": (-22.4256, -45.4528),
    "lavras": (-21.2453, -44.9997),
    "alfenas": (-21.4292, -45.9472),
    "guaxupe": (-21.3053, -46.7128),
    "uberaba": (-19.7472, -47.9319),
    "betim": (-19.9678, -44.1983),
    "sete lagoas": (-19.4658, -44.2467),
    "ipatinga": (-19.4683, -42.5367),
    "governador valadares": (-18.8511, -41.9494),
    "montes claros": (-16.7350, -43.8617),
    "curitiba": (-25.4284, -49.2733),
    "londrina": (-23.3045, -51.1696),
    "maringa": (-23.4205, -51.9331),
    "porto alegre": (-30.0346, -51.2177),
    "caxias do sul": (-29.1678, -51.1794),
    "florianopolis": (-27.5954, -48.5480),
    "joinville": (-26.3045, -48.8487),
    "blumenau": (-26.9194, -49.0661),
    "vitoria": (-20.3155, -40.3128),
    "vila velha": (-20.3297, -40.2925),
    "brasilia": (-15.7939, -47.8828),
    "goiania": (-16.6869, -49.2648),
    "salvador": (-12.9714, -38.5014),
    "recife": (-8.0476, -34.8770),
    "fortaleza": (-3.7172, -38.5433),
    "manaus": (-3.1190, -60.0217),
    "belem": (-1.4558, -48.4902),
    "aracaju": (-10.9472, -37.0731),
    "maceio": (-9.6658, -35.7353),
    "natal": (-5.7945, -35.2110),
    "joao pessoa": (-7.1195, -34.8450),
    "teresina": (-5.0892, -42.8019),
    "sao luis": (-2.5307, -44.3068),
    "cuiaba": (-15.6014, -56.0979),
    "campo grande": (-20.4697, -54.6201),
    "palmas": (-10.2491, -48.3243),
    "porto velho": (-8.7612, -63.9004),
    "rio branco": (-9.9747, -67.8243),
    "boa vista": (2.8235, -60.6758),
    "macapa": (0.0349, -51.0694),
}

# Centroides por UF para cidades fora do catálogo explícito.
_STATE_COORDS: Dict[str, Tuple[float, float]] = {
    "AC": (-9.97, -67.82),
    "AL": (-9.66, -35.73),
    "AM": (-3.12, -60.02),
    "AP": (0.03, -51.07),
    "BA": (-12.97, -38.50),
    "CE": (-3.72, -38.54),
    "DF": (-15.79, -47.88),
    "ES": (-20.32, -40.31),
    "GO": (-16.69, -49.26),
    "MA": (-2.53, -44.31),
    "MG": (-19.92, -43.93),
    "MS": (-20.47, -54.62),
    "MT": (-15.60, -56.10),
    "PA": (-1.46, -48.49),
    "PB": (-7.12, -34.85),
    "PE": (-8.05, -34.88),
    "PI": (-5.09, -42.80),
    "PR": (-25.43, -49.27),
    "RJ": (-22.91, -43.17),
    "RN": (-5.79, -35.21),
    "RO": (-8.76, -63.90),
    "RR": (2.82, -60.68),
    "RS": (-30.03, -51.22),
    "SC": (-27.60, -48.55),
    "SE": (-10.95, -37.07),
    "SP": (-23.55, -46.63),
    "TO": (-10.25, -48.32),
}

# Primeiro dígito do CEP brasileiro -> centro regional aproximado (quando cidade/UF ausentes).
_CEP_REGION_COORDS: Dict[str, Tuple[float, float]] = {
    "0": (-23.5505, -46.6333),  # Grande SP
    "1": (-22.9099, -47.0626),  # Interior SP
    "2": (-22.9068, -43.1729),  # RJ / ES
    "3": (-19.9167, -43.9345),  # MG
    "4": (-12.9714, -38.5014),  # BA / SE
    "5": (-8.0476, -34.8770),   # PE / AL / PB / RN
    "6": (-3.7172, -38.5433),   # CE / PI / MA / PA / AM / AP / AC / RR
    "7": (-15.7939, -47.8828),  # DF / GO / TO / MT / MS / RO
    "8": (-25.4284, -49.2733),  # PR / SC
    "9": (-30.0346, -51.2177),  # RS
}


def _norm(text: Optional[str]) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    return " ".join(cleaned.split())


def _clean_cep(cep: Optional[str]) -> str:
    if not cep:
        return ""
    digits = "".join(ch for ch in str(cep) if ch.isdigit())
    return digits if len(digits) == 8 else ""


def _hash_offset(seed: str, scale_deg: float) -> Tuple[float, float]:
    """Gera deslocamento determinístico [-scale_deg, +scale_deg] a partir de uma semente."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    raw_lat = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    raw_lon = int.from_bytes(digest[4:8], "big") / 0xFFFFFFFF
    return (raw_lat * 2.0 - 1.0) * scale_deg, (raw_lon * 2.0 - 1.0) * scale_deg


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância geodésica em quilômetros entre dois pontos (WGS-84)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return _EARTH_RADIUS_KM * c


def resolve_coordinates(
    *,
    cep: Optional[str] = None,
    logradouro: Optional[str] = None,
    numero: Optional[str] = None,
    bairro: Optional[str] = None,
    cidade: Optional[str] = None,
    estado: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Optional[Tuple[float, float]]:
    """Resolve coordenadas (lat, lon) a partir de lat/lon explícitos ou campos de endereço."""
    if latitude is not None and longitude is not None:
        return float(latitude), float(longitude)

    norm_city = _norm(cidade)
    norm_state = (estado or "").strip().upper()
    clean_cep = _clean_cep(cep)
    norm_bairro = _norm(bairro)
    norm_logradouro = _norm(logradouro)
    norm_numero = _norm(numero)

    base: Optional[Tuple[float, float]] = None
    if norm_city and norm_city in _CITY_COORDS:
        base = _CITY_COORDS[norm_city]
    elif norm_city:
        state_base = _STATE_COORDS.get(norm_state, (-15.7939, -47.8828))
        d_lat, d_lon = _hash_offset(f"city:{norm_state}:{norm_city}", 0.75)
        base = (state_base[0] + d_lat, state_base[1] + d_lon)
    elif clean_cep:
        base = _CEP_REGION_COORDS.get(clean_cep[0], (-23.5505, -46.6333))
    elif norm_state in _STATE_COORDS:
        base = _STATE_COORDS[norm_state]

    if base is None:
        return None

    lat, lon = base

    # Deslocamento intra-urbano determinístico por CEP / bairro / logradouro / número
    # (~0.045 deg ≈ 5 km de raio urbano para CEPs diferentes, ~0.005 deg ≈ 500 m por rua/número).
    if clean_cep:
        prefix5 = clean_cep[:5]
        suffix3 = clean_cep[5:]
        d_lat, d_lon = _hash_offset(f"cep5:{prefix5}", 0.045)
        s_lat, s_lon = _hash_offset(f"cep3:{clean_cep}", 0.008)
        lat += d_lat + s_lat
        lon += d_lon + s_lon
        if norm_logradouro or norm_numero:
            r_lat, r_lon = _hash_offset(f"street:{clean_cep}:{norm_logradouro}:{norm_numero}", 0.002)
            lat += r_lat
            lon += r_lon
    elif norm_bairro or norm_logradouro:
        b_lat, b_lon = _hash_offset(f"bairro:{norm_state}:{norm_city}:{norm_bairro}", 0.035)
        l_lat, l_lon = _hash_offset(
            f"log:{norm_state}:{norm_city}:{norm_bairro}:{norm_logradouro}:{norm_numero}",
            0.006,
        )
        lat += b_lat + l_lat
        lon += b_lon + l_lon

    return lat, lon


def _extract_addr(addr: Any) -> Dict[str, Any]:
    if addr is None:
        return {}
    if isinstance(addr, dict):
        return addr
    return {
        "cep": getattr(addr, "cep", None),
        "logradouro": getattr(addr, "logradouro", None),
        "numero": getattr(addr, "numero", None),
        "bairro": getattr(addr, "bairro", None),
        "cidade": getattr(addr, "cidade", None) or getattr(addr, "city", None),
        "estado": getattr(addr, "estado", None) or getattr(addr, "state", None),
        "latitude": getattr(addr, "latitude", None),
        "longitude": getattr(addr, "longitude", None),
    }


def calculate_address_distance_km(client_addr: Any, prof_addr: Any) -> Optional[float]:
    """Calcula a distância em km (1 casa decimal) entre endereço do cliente e do profissional."""
    c = _extract_addr(client_addr)
    p = _extract_addr(prof_addr)

    c_coords = resolve_coordinates(
        cep=c.get("cep"),
        logradouro=c.get("logradouro"),
        numero=c.get("numero"),
        bairro=c.get("bairro"),
        cidade=c.get("cidade") or c.get("city"),
        estado=c.get("estado") or c.get("state"),
        latitude=c.get("latitude"),
        longitude=c.get("longitude"),
    )
    p_coords = resolve_coordinates(
        cep=p.get("cep"),
        logradouro=p.get("logradouro"),
        numero=p.get("numero"),
        bairro=p.get("bairro"),
        cidade=p.get("cidade") or p.get("city"),
        estado=p.get("estado") or p.get("state"),
        latitude=p.get("latitude"),
        longitude=p.get("longitude"),
    )
    if c_coords is None or p_coords is None:
        return None

    return round(haversine_km(c_coords[0], c_coords[1], p_coords[0], p_coords[1]), 1)


def is_within_service_radius(
    client_addr: Any,
    prof_addr: Any,
    service_radius_km: Optional[float],
) -> Tuple[bool, Optional[float]]:
    """Verifica se o raio de trabalho do profissional cobre o endereço do cliente."""
    distance = calculate_address_distance_km(client_addr, prof_addr)
    if distance is None:
        return False, None
    radius = float(service_radius_km or 0.0)
    return distance <= radius, distance
