"""Testes do motor de busca inteligente do backend (search.py).

Cobrem normalização de acentos, similaridade, catálogo de sinônimos, prevenção de
falsos positivos em termos curtos e a integração com GET /api/professionals.
"""

from fastapi.testclient import TestClient

import models
import search

SAMPLE = {
    "name": "Carlos Silva",
    "email": "carlos.search@exemplo.com",
    "phone": "(11) 98765-4321",
    "bio": "Instalações elétricas residenciais e troca de disjuntor.",
    "service_radius_km": 15.0,
    "specialties": ["Elétrica"],
    "city": "São Paulo",
    "state": "SP",
}


def _approve(db_session):
    db_session.query(models.Professional).update(
        {models.Professional.approval_status: models.ProfessionalApprovalStatus.APPROVED.value}
    )
    db_session.commit()


class TestSearchModule:
    """Testes unitários das funções puras do motor de busca."""

    def test_normalize_remove_acentos_e_colapsa_espacos(self):
        assert search.normalize_text("São  Paulo") == "sao paulo"
        assert search.normalize_text("Elétrica") == "eletrica"
        assert search.normalize_text("Niterói") == "niteroi"
        assert search.normalize_text(None) == ""

    def test_clean_text_mantem_apenas_alfanumericos(self):
        assert search.clean_text("Ar-condicionado!") == "ar condicionado"
        assert search.clean_text("  São   José  ") == "sao jose"
        assert search.clean_text("%_") == ""

    def test_damerau_levenshtein_e_similaridade(self):
        assert search.damerau_levenshtein("encanadro", "encanador") == 1
        assert search.damerau_levenshtein("eletria", "eletrica") == 1
        assert search.calculate_similarity("eletrica", "eletrica") == 1.0

    def test_nao_casa_termos_curtos_com_substrings(self):
        for termo in ("reparo", "armario", "largar"):
            is_match, _, _ = search.match_synonym_or_term("ar", termo, [termo])
            assert is_match is False, f"'{termo}' não deve casar com 'ar'"

        assert search.match_synonym_or_term("ar", "conserto de ar", ["conserto", "de", "ar"])[0] is True
        assert search.match_synonym_or_term("pia", "terapia", ["terapia"])[0] is False

    def test_sugere_categoria_por_sinonimo(self):
        assert search.find_best_category_suggestion("eletricista") == ("Elétrica", True)
        assert search.find_best_category_suggestion("encanador")[0] == "Hidráulica"
        assert search.find_best_category_suggestion("reparo")[0] == "Reparos Gerais"

    def test_filtra_ranqueia_e_tolera_erros(self):
        profissionais = [
            {"id": 1, "name": "Carlos Silva", "bio": "Instalações elétricas", "specialties": ["Elétrica"], "city": "São Paulo"},
            {"id": 2, "name": "Roberto Ar-condicionado", "bio": "Limpeza de split", "specialties": ["Ar-condicionado"], "city": "Campinas"},
            {"id": 3, "name": "Maria Encanadora", "bio": "Conserto de pia com vazamento", "specialties": ["Hidráulica"], "city": "Niterói"},
        ]

        reparo, _ = search.filter_professionals_intelligent(profissionais, q="reparo")
        assert 3 not in [p["id"] for p in reparo]

        eletria, _ = search.filter_professionals_intelligent(profissionais, q="eletria")
        assert [p["id"] for p in eletria] == [1]

        torneira, _ = search.filter_professionals_intelligent(profissionais, q="torneira")
        assert [p["id"] for p in torneira] == [3]

        niteroi, _ = search.filter_professionals_intelligent(profissionais, city="Niterói")
        assert [p["id"] for p in niteroi] == [3]


class TestIntelligentSearchAPI:
    """Testes de integração da busca inteligente no endpoint de listagem."""

    def _criar_profissionais(self, client, db_session):
        p1 = dict(SAMPLE)
        p1["email"] = "eletrica@search.com"
        p1["name"] = "José Eletricista"
        p1["bio"] = "Especialista em iluminação residencial e quadros elétricos."
        p1["specialties"] = ["Elétrica"]
        p1["city"] = "Campinas"
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE)
        p2["email"] = "hidraulica@search.com"
        p2["name"] = "Marcos Encanador"
        p2["bio"] = "Conserto de vazamentos em canos de cobre e pvc."
        p2["specialties"] = ["Hidráulica"]
        p2["city"] = "Niterói"
        client.post("/api/professionals", json=p2)

        _approve(db_session)

    def test_busca_tolera_erro_de_digitacao(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"q": "eletria"})
        assert resp.status_code == 200
        assert [p["email"] for p in resp.json()] == ["eletrica@search.com"]

    def test_busca_por_sinonimo_de_especialidade(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"q": "encanador"})
        assert resp.status_code == 200
        assert [p["email"] for p in resp.json()] == ["hidraulica@search.com"]

    def test_busca_insensivel_a_acentos_na_cidade(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"q": "vazamento", "city": "niteroi"})
        assert resp.status_code == 200
        assert [p["email"] for p in resp.json()] == ["hidraulica@search.com"]

    def test_busca_apenas_simbolos_retorna_vazio(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        for termo in ("%", "_"):
            resp = client.get("/api/professionals", params={"q": termo})
            assert resp.status_code == 200
            assert resp.json() == []
