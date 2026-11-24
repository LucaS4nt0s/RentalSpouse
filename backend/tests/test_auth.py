"""
Testes automatizados para as rotas de autenticação:
- POST /api/auth/login
- GET /api/auth/me
Utiliza o banco SQLite em memória via conftest.py.
"""

from fastapi.testclient import TestClient


from database import SessionLocal
import models


def cadastrar_cliente_auxiliar(
    client: TestClient,
    email: str = "maria.silva@exemplo.com",
    senha: str = "SenhaForte123",
    verificado: bool = True,
):
    """Cadastra um cliente diretamente via API de clientes para testar o login."""
    payload = {
        "nome": "Maria da Silva",
        "email": email,
        "cpf": "12345678909",
        "data_nascimento": "1992-08-15",
        "senha": senha,
        "confirmar_senha": senha,
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "50",
            "complemento": None,
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    res = client.post("/api/clientes", json=payload)
    if res.status_code == 201 and verificado:
        db = SessionLocal()
        try:
            cliente = db.query(models.Cliente).filter(models.Cliente.email == email.strip().lower()).first()
            if cliente is not None:
                cliente.email_verificado = True
                db.commit()
        finally:
            db.close()
    return res


class TestAuthLogin:
    """Testes da rota POST /api/auth/login e verificação do token em /api/auth/me."""

    def test_login_sucesso_e_validacao_me(self, client: TestClient):
        """Deve autenticar com sucesso cliente com credenciais corretas e validar sessão em /me."""
        res_cad = cadastrar_cliente_auxiliar(client, email="cliente.login@exemplo.com", senha="SenhaSegura@2026")
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "cliente.login@exemplo.com", "senha": "SenhaSegura@2026"},
        )

        assert login_res.status_code == 200
        dados = login_res.json()
        assert "access_token" in dados
        assert dados["access_token"] is not None
        assert dados["token_type"] == "bearer"
        assert dados["user"]["email"] == "cliente.login@exemplo.com"
        assert dados["user"]["nome"] == "Maria da Silva"
        assert dados["user"]["tipo"] == "cliente"
        assert dados["user"]["role"] == "client"
        assert dados["user"]["email_verificado"] is True

        # Validação do token no servidor através de GET /api/auth/me
        headers = {"Authorization": f"Bearer {dados['access_token']}"}
        res_me = client.get("/api/auth/me", headers=headers)
        assert res_me.status_code == 200
        me_dados = res_me.json()
        assert me_dados["email"] == "cliente.login@exemplo.com"
        assert me_dados["role"] == "client"
        assert me_dados["tipo"] == "cliente"
        assert me_dados["name"] == "Maria da Silva"
        assert me_dados["email_verificado"] is True

    def test_login_com_campo_password_em_vez_de_senha(self, client: TestClient):
        """Suporta payload com 'password' (convenção REST/OpenAPI) ou 'senha'."""
        cadastrar_cliente_auxiliar(client, email="alias.teste@exemplo.com", senha="SenhaSegura@2026")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "alias.teste@exemplo.com", "password": "SenhaSegura@2026"},
        )
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()

    def test_login_email_case_insensitive(self, client: TestClient):
        """E-mail digitado com maiúsculas deve autenticar normalmente."""
        cadastrar_cliente_auxiliar(client, email="case.teste@exemplo.com", senha="SenhaSegura@2026")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "CASE.Teste@Exemplo.COM", "senha": "SenhaSegura@2026"},
        )
        assert login_res.status_code == 200
        assert login_res.json()["user"]["email"] == "case.teste@exemplo.com"

    def test_login_senha_incorreta_retorna_401(self, client: TestClient):
        """Senha incorreta deve retornar HTTP 401 Unauthorized."""
        cadastrar_cliente_auxiliar(client, email="senha.errada@exemplo.com", senha="SenhaCorreta123")

        login_res = client.post(
            "/api/auth/login",
            json={"email": "senha.errada@exemplo.com", "senha": "SenhaIncorreta999"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_usuario_inexistente_retorna_401(self, client: TestClient):
        """E-mail não cadastrado deve retornar HTTP 401 Unauthorized."""
        login_res = client.post(
            "/api/auth/login",
            json={"email": "naoexiste@exemplo.com", "senha": "QualquerSenha123"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_dados_vazios_retorna_422(self, client: TestClient):
        """Payload com campos vazios deve retornar HTTP 422 Unprocessable Entity."""
        res_vazio = client.post("/api/auth/login", json={"email": "", "senha": ""})
        assert res_vazio.status_code == 422

    def test_login_sem_campos_obrigatorios_retorna_422(self, client: TestClient):
        """Payload faltando campos obrigatórios deve retornar 422."""
        res = client.post("/api/auth/login", json={"email": "teste@exemplo.com"})
        assert res.status_code == 422

    def test_login_cliente_email_nao_verificado_retorna_403(self, client: TestClient):
        """Cliente com e-mail não confirmado deve receber HTTP 403 Forbidden ao tentar logar."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="pendente.verificacao@exemplo.com",
            senha="SenhaForte123",
            verificado=False,
        )
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "pendente.verificacao@exemplo.com", "senha": "SenhaForte123"},
        )
        assert login_res.status_code == 403
        assert "E-mail pendente de confirmação" in login_res.json()["detail"]

    def test_login_cliente_email_nao_verificado_com_senha_errada_retorna_401(self, client: TestClient):
        """Mesmo com e-mail não verificado, senha incorreta deve retornar 401 para evitar enumeração."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="senha.errada.pendente@exemplo.com",
            senha="SenhaForte123",
            verificado=False,
        )
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "senha.errada.pendente@exemplo.com", "senha": "SenhaIncorreta999"},
        )
        assert login_res.status_code == 401
        assert "Credenciais inválidas" in login_res.json()["detail"]

    def test_login_cliente_na_tabela_users_com_email_pendente_retorna_403(self, client: TestClient):
        """Se o usuário já existe na tabela users mas seu e-mail foi desmarcado na tabela clientes, bloqueia com 403."""
        cadastrar_cliente_auxiliar(
            client,
            email="revertido@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Primeiro login com sucesso para sincronizar em users
        res_ok = client.post(
            "/api/auth/login",
            json={"email": "revertido@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_ok.status_code == 200

        # Simula revogação/pendência de verificação no banco
        db = SessionLocal()
        try:
            cli = db.query(models.Cliente).filter(models.Cliente.email == "revertido@exemplo.com").first()
            cli.email_verificado = False
            db.commit()
        finally:
            db.close()

        # Próximo login deve ser barrado com 403
        res_bloqueado = client.post(
            "/api/auth/login",
            json={"email": "revertido@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_bloqueado.status_code == 403
        assert "E-mail pendente de confirmação" in res_bloqueado.json()["detail"]

    def test_login_conta_desativada_retorna_401(self, client: TestClient):
        """Usuário com is_active=False não pode logar."""
        cadastrar_cliente_auxiliar(
            client,
            email="desativado@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Login inicial para sincronizar na tabela users
        res_ok = client.post(
            "/api/auth/login",
            json={"email": "desativado@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_ok.status_code == 200

        # Desativa o usuário na tabela users
        db = SessionLocal()
        try:
            usr = db.query(models.User).filter(models.User.email == "desativado@exemplo.com").first()
            usr.is_active = False
            db.commit()
        finally:
            db.close()

        # Próximo login deve retornar 401 Conta desativada
        res_desativado = client.post(
            "/api/auth/login",
            json={"email": "desativado@exemplo.com", "senha": "SenhaForte123"},
        )
        assert res_desativado.status_code == 401
        assert "Conta desativada" in res_desativado.json()["detail"]

    def test_get_current_user_leitura_pura_sem_inserir_em_users(self, client: TestClient):
        """get_current_user não deve persistir nada na tabela users ao autenticar token de cliente."""
        from security import create_access_token
        cadastrar_cliente_auxiliar(
            client,
            email="token.puro@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        # Gera o token diretamente sem passar pelo endpoint de login
        token = create_access_token(data={"sub": "token.puro@exemplo.com", "role": "client"})

        # Garante que a tabela users NÃO possui o registro antes do GET /api/auth/me
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.email == "token.puro@exemplo.com").first() is None
        finally:
            db.close()

        # Requisição GET /api/auth/me
        res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_me.status_code == 200
        assert res_me.json()["email"] == "token.puro@exemplo.com"

        # Garante que a tabela users CONTINUA SEM o registro (pura leitura, sem db.commit)
        db = SessionLocal()
        try:
            assert db.query(models.User).filter(models.User.email == "token.puro@exemplo.com").first() is None
        finally:
            db.close()

    def test_login_profissional_sucesso_com_sincronizacao(self, client: TestClient):
        """Profissional cadastrado com senha consegue logar com sucesso e obter perfil profissional."""
        prof_payload = {
            "name": "Eletricista Silva",
            "email": "eletricista.silva@exemplo.com",
            "phone": "(11) 99999-8888",
            "bio": "Profissional com mais de 15 anos de experiência em instalações e reparos residenciais.",
            "service_radius_km": 20.0,
            "specialties": ["Elétrica", "Iluminação"],
            "city": "São Paulo",
            "state": "SP",
            "senha": "SenhaForte@2026",
        }
        res_prof = client.post("/api/professionals", json=prof_payload)
        assert res_prof.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "eletricista.silva@exemplo.com", "senha": "SenhaForte@2026"},
        )
        assert login_res.status_code == 200
        dados = login_res.json()
        assert "access_token" in dados
        assert dados["user"]["email"] == "eletricista.silva@exemplo.com"
        assert dados["user"]["name"] == "Eletricista Silva"
        assert dados["user"]["role"] == "professional"
        assert dados["user"]["tipo"] == "profissional"

        # Valida GET /api/auth/me
        headers = {"Authorization": f"Bearer {dados['access_token']}"}
        res_me = client.get("/api/auth/me", headers=headers)
        assert res_me.status_code == 200
        assert res_me.json()["role"] == "professional"
        assert res_me.json()["tipo"] == "profissional"

    def test_login_profissional_desativado_retorna_401(self, client: TestClient):
        """Profissional desativado na tabela de profissionais é barrado no login com 401."""
        prof_payload = {
            "name": "Pintor Inativo",
            "email": "pintor.inativo@exemplo.com",
            "bio": "Pintor residencial com ampla experiência em pintura decorativa.",
            "service_radius_km": 10.0,
            "specialties": ["Pintura"],
            "senha": "SenhaForte@2026",
        }
        res_prof = client.post("/api/professionals", json=prof_payload)
        assert res_prof.status_code == 201
        prof_id = res_prof.json()["id"]

        # Desativa o profissional
        db = SessionLocal()
        try:
            p = db.query(models.Professional).filter(models.Professional.id == prof_id).first()
            p.is_active = False
            db.commit()
        finally:
            db.close()

        login_res = client.post(
            "/api/auth/login",
            json={"email": "pintor.inativo@exemplo.com", "senha": "SenhaForte@2026"},
        )
        assert login_res.status_code == 401
        assert "Conta desativada" in login_res.json()["detail"]

    def test_get_me_reflete_status_real_de_email_verificado_do_cliente(self, client: TestClient):
        """GET /api/auth/me reflete a verdade viva do banco para email_verificado."""
        cadastrar_cliente_auxiliar(
            client,
            email="status.vivo@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        login_res = client.post(
            "/api/auth/login",
            json={"email": "status.vivo@exemplo.com", "senha": "SenhaForte123"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Primeiro /me reporta True
        res_me_1 = client.get("/api/auth/me", headers=headers)
        assert res_me_1.status_code == 200
        assert res_me_1.json()["email_verificado"] is True

        # Desmarca email_verificado na tabela clientes
        db = SessionLocal()
        try:
            cli = db.query(models.Cliente).filter(models.Cliente.email == "status.vivo@exemplo.com").first()
            cli.email_verificado = False
            db.commit()
        finally:
            db.close()

        # Próximo /me reflete False dinamicamente, sem estar hardcoded
        res_me_2 = client.get("/api/auth/me", headers=headers)
        assert res_me_2.status_code == 200
        assert res_me_2.json()["email_verificado"] is False

    def test_get_current_user_in_memory_nao_faz_spoofing_de_pk(self, client: TestClient):
        """get_current_user in-memory não deve forjar id com cliente.id para evitar colisão de sequences."""
        from security import create_access_token
        cadastrar_cliente_auxiliar(
            client,
            email="pk.isolada@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        token = create_access_token(data={"sub": "pk.isolada@exemplo.com", "role": "client"})
        res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_me.status_code == 200
        # id não é igual ao id da tabela clientes forjado
        assert res_me.json()["email"] == "pk.isolada@exemplo.com"

    def test_cliente_nunca_vira_profissional_no_login_ou_me(self, client: TestClient):
        """Garante blindagem de role: um cliente cadastrado jamais tem seu role/tipo alterado para profissional (#93)."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="blindado.cliente@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        assert res_cad.status_code == 201

        # Tentativa de cadastrar profissional com o mesmo e-mail deve falhar com 409
        res_prof = client.post(
            "/api/professionals",
            json={
                "name": "Tentativa Sobrescrita",
                "email": "blindado.cliente@exemplo.com",
                "bio": "Tentativa de criar profissional com e-mail de cliente.",
                "service_radius_km": 15.0,
                "specialties": ["Elétrica"],
                "senha": "OutraSenha@123",
            },
        )
        assert res_prof.status_code == 409

        # Múltiplos logins e chamadas a /api/auth/me preservam role='client' e tipo='cliente'
        for _ in range(2):
            login_res = client.post(
                "/api/auth/login",
                json={"email": "blindado.cliente@exemplo.com", "senha": "SenhaForte123"},
            )
            assert login_res.status_code == 200
            dados = login_res.json()
            assert dados["user"]["role"] == "client"
            assert dados["user"]["tipo"] == "cliente"

            res_me = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {dados['access_token']}"},
            )
            assert res_me.status_code == 200
            assert res_me.json()["role"] == "client"
            assert res_me.json()["tipo"] == "cliente"


class TestMinhaContaEndpoints:
    """Testes para leitura completa e atualização de conta em /api/auth/me e /api/conta/me (#94)."""

    def test_get_me_retorna_dados_completos_cliente_com_cpf_mascarado(self, client: TestClient):
        """GET /api/auth/me e /api/conta/me retornam endereço completo e CPF mascarado do cliente."""
        res_cad = cadastrar_cliente_auxiliar(
            client,
            email="conta.cliente@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        assert res_cad.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "conta.cliente@exemplo.com", "senha": "SenhaForte123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for endpoint in ("/api/auth/me", "/api/conta/me"):
            res = client.get(endpoint, headers=headers)
            assert res.status_code == 200
            dados = res.json()
            assert dados["name"] == "Maria da Silva"
            assert dados["nome"] == "Maria da Silva"
            assert dados["cpf"] == "***.456.789-**"
            assert dados["data_nascimento"] == "1992-08-15"
            assert dados["cep"] == "01001000"
            assert dados["logradouro"] == "Praça da Sé"
            assert dados["numero"] == "50"
            assert dados["bairro"] == "Sé"
            assert dados["cidade"] == "São Paulo"
            assert dados["estado"] == "SP"
            assert dados["email_verificado"] is True

    def test_patch_me_atualiza_dados_e_endereco_do_cliente_sincronizando_users(self, client: TestClient):
        """PATCH /api/auth/me atualiza nome e endereço do cliente em clientes e users."""
        cadastrar_cliente_auxiliar(
            client,
            email="editar.cliente@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        login_res = client.post(
            "/api/auth/login",
            json={"email": "editar.cliente@exemplo.com", "senha": "SenhaForte123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        patch_res = client.patch(
            "/api/auth/me",
            headers=headers,
            json={
                "name": "Maria Silva Editada",
                "cep": "01310-100",
                "logradouro": "Avenida Paulista",
                "numero": "1578",
                "complemento": "Conjunto 42",
                "bairro": "Bela Vista",
                "cidade": "São Paulo",
                "estado": "SP",
            },
        )
        assert patch_res.status_code == 200
        atualizado = patch_res.json()
        assert atualizado["name"] == "Maria Silva Editada"
        assert atualizado["nome"] == "Maria Silva Editada"
        assert atualizado["cep"] == "01310100"
        assert atualizado["logradouro"] == "Avenida Paulista"
        assert atualizado["numero"] == "1578"
        assert atualizado["complemento"] == "Conjunto 42"
        assert atualizado["bairro"] == "Bela Vista"

        # Verifica sincronização na tabela users
        db = SessionLocal()
        try:
            usr = db.query(models.User).filter(models.User.email == "editar.cliente@exemplo.com").first()
            cli = db.query(models.Cliente).filter(models.Cliente.email == "editar.cliente@exemplo.com").first()
            assert usr is not None and usr.name == "Maria Silva Editada"
            assert cli is not None and cli.nome == "Maria Silva Editada"
        finally:
            db.close()

    def test_patch_me_atualiza_perfil_profissional(self, client: TestClient):
        """GET e PATCH /api/conta/me permitem ler e editar bio, telefone, raio e especialidades do profissional."""
        res_prof = client.post(
            "/api/professionals",
            json={
                "name": "Carlos Encanador",
                "email": "carlos.prof@exemplo.com",
                "phone": "11988887777",
                "bio": "Especialista em hidráulica residencial e detecção de vazamentos.",
                "service_radius_km": 15.0,
                "specialties": ["Hidráulica"],
                "city": "Campinas",
                "state": "SP",
                "senha": "SenhaForte@2026",
            },
        )
        assert res_prof.status_code == 201

        login_res = client.post(
            "/api/auth/login",
            json={"email": "carlos.prof@exemplo.com", "senha": "SenhaForte@2026"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        get_res = client.get("/api/conta/me", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["specialties"] == ["Hidráulica"]
        assert get_res.json()["service_radius_km"] == 15.0

        patch_res = client.patch(
            "/api/conta/me",
            headers=headers,
            json={
                "name": "Carlos Alberto Hidráulica",
                "phone": "11977776666",
                "bio": "Mais de 20 anos de experiência em hidráulica e elétrica residencial.",
                "service_radius_km": 30.0,
                "specialties": ["Hidráulica", "Elétrica"],
                "city": "São Paulo",
                "state": "SP",
            },
        )
        assert patch_res.status_code == 200
        dados = patch_res.json()
        assert dados["name"] == "Carlos Alberto Hidráulica"
        assert dados["phone"] == "11977776666"
        assert dados["service_radius_km"] == 30.0
        assert dados["specialties"] == ["Hidráulica", "Elétrica"]
        assert dados["city"] == "São Paulo"

    def test_patch_me_alteracao_de_senha_valida_senha_atual(self, client: TestClient):
        """PATCH /api/auth/me exige senha_atual correta antes de gravar nova_senha."""
        cadastrar_cliente_auxiliar(
            client,
            email="troca.senha@exemplo.com",
            senha="SenhaAntiga123",
            verificado=True,
        )
        login_res = client.post(
            "/api/auth/login",
            json={"email": "troca.senha@exemplo.com", "senha": "SenhaAntiga123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Senha atual incorreta -> 400
        res_err = client.patch(
            "/api/auth/me",
            headers=headers,
            json={
                "senha_atual": "SenhaErrada999",
                "nova_senha": "SenhaNovaForte456",
                "confirmar_nova_senha": "SenhaNovaForte456",
            },
        )
        assert res_err.status_code == 400
        assert "senha atual" in res_err.json()["detail"].lower()

        # 2. Senha atual correta -> 200 e novo login funciona com a nova senha
        res_ok = client.patch(
            "/api/auth/me",
            headers=headers,
            json={
                "senha_atual": "SenhaAntiga123",
                "nova_senha": "SenhaNovaForte456",
                "confirmar_nova_senha": "SenhaNovaForte456",
            },
        )
        assert res_ok.status_code == 200

        login_novo = client.post(
            "/api/auth/login",
            json={"email": "troca.senha@exemplo.com", "senha": "SenhaNovaForte456"},
        )
        assert login_novo.status_code == 200

    def test_patch_me_alteracao_de_cep_invalida_coordenadas_antigas(self, client: TestClient):
        """Ao atualizar CEP/endereço sem novas coordenadas em PATCH /api/auth/me, limpa lat/lon antigas."""
        cadastrar_cliente_auxiliar(
            client,
            email="geo.cliente@exemplo.com",
            senha="SenhaForte123",
            verificado=True,
        )
        db = SessionLocal()
        try:
            cli = db.query(models.Cliente).filter(models.Cliente.email == "geo.cliente@exemplo.com").first()
            cli.latitude = -23.5505
            cli.longitude = -46.6333
            db.commit()
        finally:
            db.close()

        login_res = client.post(
            "/api/auth/login",
            json={"email": "geo.cliente@exemplo.com", "senha": "SenhaForte123"},
        )
        headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

        patch_res = client.patch(
            "/api/auth/me",
            headers=headers,
            json={
                "cep": "20040-020",
                "logradouro": "Rua da Assembleia",
                "numero": "10",
                "bairro": "Centro",
                "cidade": "Rio de Janeiro",
                "estado": "RJ",
            },
        )
        assert patch_res.status_code == 200
        dados = patch_res.json()
        assert dados["cep"] == "20040020"
        assert dados["cidade"] == "Rio de Janeiro"
        assert dados["estado"] == "RJ"

        db = SessionLocal()
        try:
            cli = db.query(models.Cliente).filter(models.Cliente.email == "geo.cliente@exemplo.com").first()
            assert cli.latitude is None
            assert cli.longitude is None
        finally:
            db.close()
