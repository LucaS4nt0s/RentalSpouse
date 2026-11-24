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

    def test_sugere_categoria_com_typo_no_nome(self):
        sugestao = search.find_best_category_suggestion("marcenara")
        assert sugestao is not None
        assert sugestao[0] == "Marcenaria"

    def test_termo_curto_nao_casa_substring_em_nome_bio_ou_cidade(self):
        profissionais = [
            {"id": 1, "name": "Carlos Silva", "bio": "Reparos gerais e armarios", "specialties": ["Reparos Gerais"], "city": "Aracaju"},
            {"id": 2, "name": "Tecnico Ar", "bio": "Limpeza de split", "specialties": ["Ar-condicionado"], "city": "Campinas"},
        ]
        results, _ = search.filter_professionals_intelligent(profissionais, q="ar")
        ids = [p["id"] for p in results]
        assert 1 not in ids
        assert 2 in ids

    def test_sinonimos_por_especialidade_sem_acento_ou_caixa(self):
        assert "torneira" in search.synonyms_for("Hidraulica")
        assert "torneira" in search.synonyms_for("HIDRÁULICA")
        assert "disjuntor" in search.synonyms_for("eletrica")
        assert search.synonyms_for("Inexistente") == []

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
        assert [p["email"] for p in resp.json()] == ["el***a@search.com"]
        assert resp.headers.get("X-Search-Suggestion") == "Eletrica"

    def test_busca_por_sinonimo_de_especialidade(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"q": "encanador"})
        assert resp.status_code == 200
        assert [p["email"] for p in resp.json()] == ["hi***a@search.com"]

    def test_busca_insensivel_a_acentos_na_cidade(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"q": "vazamento", "city": "niteroi"})
        assert resp.status_code == 200
        assert [p["email"] for p in resp.json()] == ["hi***a@search.com"]

    def test_busca_apenas_simbolos_retorna_vazio(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        for termo in ("%", "_"):
            resp = client.get("/api/professionals", params={"q": termo})
            assert resp.status_code == 200
            assert resp.json() == []

    def test_sinonimo_funciona_com_especialidade_sem_acento(self, client: TestClient, db_session):
        p = dict(SAMPLE)
        p["email"] = "semacento@search.com"
        p["name"] = "Paulo Reformas"
        p["bio"] = "Atendimento residencial."
        p["specialties"] = ["Hidraulica"]
        p["city"] = "Santos"
        client.post("/api/professionals", json=p)
        _approve(db_session)

        resp = client.get("/api/professionals", params={"q": "torneira"})
        assert resp.status_code == 200
        assert [x["email"] for x in resp.json()] == ["se***o@search.com"]

    def test_cidade_com_q_exclui_profissional_sem_cidade(self, client: TestClient, db_session):
        p1 = dict(SAMPLE)
        p1["email"] = "comcidade@search.com"
        p1["name"] = "Ana Hidráulica"
        p1["bio"] = "Conserto de vazamentos."
        p1["specialties"] = ["Hidráulica"]
        p1["city"] = "Niterói"
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE)
        p2["email"] = "semcidade@search.com"
        p2["name"] = "Beto Hidráulica"
        p2["bio"] = "Conserto de vazamentos."
        p2["specialties"] = ["Hidráulica"]
        p2["city"] = None
        client.post("/api/professionals", json=p2)
        _approve(db_session)

        resp = client.get("/api/professionals", params={"q": "vazamentos", "city": "niteroi"})
        assert resp.status_code == 200
        assert [x["email"] for x in resp.json()] == ["co***e@search.com"]

    def test_specialty_todas_nao_filtra(self, client: TestClient, db_session):
        self._criar_profissionais(client, db_session)
        resp = client.get("/api/professionals", params={"specialty": "Todas"})
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_q_acima_do_limite_retorna_422(self, client: TestClient):
        resp = client.get("/api/professionals", params={"q": "a" * 200})
        assert resp.status_code == 422

    def test_busca_curta_nao_casa_substring_no_nome_bio_ou_cidade(self, client: TestClient, db_session):
        p1 = dict(SAMPLE)
        p1["email"] = "carlos.ar@search.com"
        p1["name"] = "Carlos Silva"
        p1["bio"] = "Serviços gerais e reparos."
        p1["specialties"] = ["Elétrica"]
        p1["city"] = "Aracaju"
        client.post("/api/professionals", json=p1)

        p2 = dict(SAMPLE)
        p2["email"] = "ar.cond@search.com"
        p2["name"] = "Tecnico de Climatizacao"
        p2["bio"] = "Limpeza de split."
        p2["specialties"] = ["Ar-condicionado"]
        p2["city"] = "Campinas"
        client.post("/api/professionals", json=p2)
        _approve(db_session)

        resp = client.get("/api/professionals", params={"q": "ar"})
        assert resp.status_code == 200
        assert [x["email"] for x in resp.json()] == ["ar***d@search.com"]

    def test_busca_por_eletrica_encontra_profissional_mesmo_com_muitos_outros_e_sem_normalized_fields(
        self, client: TestClient, db_session
    ):
        for i in range(30):
            db_session.add(
                models.Professional(
                    name=f"Pintor {i}",
                    email=f"pintor{i}@search.com",
                    bio="Pintura residencial e textura.",
                    service_radius_km=20.0,
                    specialties=["Pintura"],
                    city="São Paulo",
                    state="SP",
                    is_active=True,
                    approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
                )
            )
        p_eletrica = models.Professional(
            name="João Souza",
            email="joao.eletrica@search.com",
            bio="Serviços gerais residenciais.",
            service_radius_km=20.0,
            specialties=["Elétrica"],
            city="São Paulo",
            state="SP",
            is_active=True,
            approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
        )
        db_session.add(p_eletrica)
        db_session.commit()
        # Simula registro legado com campos normalizados nulos/desatualizados
        db_session.query(models.Professional).filter_by(id=p_eletrica.id).update(
            {
                models.Professional.normalized_search: "",
                models.Professional.normalized_specialties: "",
            }
        )
        db_session.commit()

        resp = client.get("/api/professionals/search", params={"q": "eletrica"})
        assert resp.status_code == 200
        data = resp.json()
        emails = [p["email"] for p in data["items"]]
        assert "jo***a@search.com" in emails

    def test_distancia_calculada_entre_cliente_e_profissional_e_cobertura_de_raio(
        self, client: TestClient, db_session
    ):
        from datetime import date
        from security import create_access_token, hash_senha

        cliente = models.Cliente(
            nome="Cliente Campinas",
            email="cli.campinas@search.com",
            cpf="12345678909",
            data_nascimento=date(1992, 1, 1),
            senha_hash=hash_senha("SenhaForte123"),
            cep="13010001",
            logradouro="Av Francisco Glicério",
            numero="100",
            bairro="Centro",
            cidade="Campinas",
            estado="SP",
            email_verificado=True,
        )
        db_session.add(cliente)

        # 1. Profissional em Campinas (mesmo bairro/cidade) com raio de 15 km -> deve aparecer com distance_km <= 15
        p_perto = models.Professional(
            name="Eletricista Perto",
            email="perto@search.com",
            bio="Instalações elétricas residenciais.",
            service_radius_km=15.0,
            specialties=["Elétrica"],
            cep="13010002",
            logradouro="Rua Barão de Jaguara",
            numero="200",
            bairro="Centro",
            city="Campinas",
            state="SP",
            is_active=True,
            approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
        )
        # 2. Profissional em São Paulo (~88 km de Campinas) com raio de 20 km -> NÃO cobre Campinas, deve ser filtrado!
        p_fora_raio = models.Professional(
            name="Eletricista Longe Demais",
            email="longe.demais@search.com",
            bio="Instalações elétricas residenciais.",
            service_radius_km=20.0,
            specialties=["Elétrica"],
            cep="01001000",
            logradouro="Praça da Sé",
            numero="10",
            bairro="Sé",
            city="São Paulo",
            state="SP",
            is_active=True,
            approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
        )
        # 3. Profissional em São Paulo (~88 km de Campinas) com raio de 100 km -> cobre Campinas, deve aparecer com distance_km ~ 88
        p_cobre = models.Professional(
            name="Eletricista Raio Amplo",
            email="raio.amplo@search.com",
            bio="Instalações elétricas em todo o estado.",
            service_radius_km=100.0,
            specialties=["Elétrica"],
            cep="01001000",
            logradouro="Praça da Sé",
            numero="10",
            bairro="Sé",
            city="São Paulo",
            state="SP",
            is_active=True,
            approval_status=models.ProfessionalApprovalStatus.APPROVED.value,
        )
        db_session.add_all([p_perto, p_fora_raio, p_cobre])
        db_session.commit()

        token = create_access_token(data={"sub": cliente.email, "role": "client"})
        resp = client.get(
            "/api/professionals/search",
            params={"q": "eletrica"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        names = [item["name"] for item in items]

        assert "Eletricista Perto" in names
        assert "Eletricista Raio Amplo" in names
        assert "Eletricista Longe Demais" not in names

        perto_item = next(item for item in items if item["name"] == "Eletricista Perto")
        amplo_item = next(item for item in items if item["name"] == "Eletricista Raio Amplo")
        assert perto_item["distance_km"] is not None
        assert perto_item["distance_km"] < 15.0
        assert amplo_item["distance_km"] is not None
        assert 70.0 <= amplo_item["distance_km"] <= 100.0
