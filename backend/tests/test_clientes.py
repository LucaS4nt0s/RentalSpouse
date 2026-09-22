import sys
import os

# Permitir importação dos módulos do backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import date
import pytest
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app
from tests.test_main import test_engine, TestingSessionLocal, override_get_db
from security import hash_senha, verificar_senha


@pytest.fixture(autouse=True)
def setup_clientes_db():
    """Garante tabelas criadas e limpas para cada teste."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """Retorna um TestClient para a aplicação."""
    return TestClient(app, raise_server_exceptions=True)


def payload_cliente_valido(**kwargs):
    """Auxiliar para gerar payloads válidos de cliente com overrides opcionais."""
    dados = {
        "nome": "João Guilherme",
        "email": "joao.guilherme@example.com",
        "cpf": "12345678909",  # CPF válido (d1=0, d2=9)
        "data_nascimento": "1995-05-20",
        "senha": "SenhaForte123",
        "confirmar_senha": "SenhaForte123",
        "endereco": {
            "cep": "01001000",
            "logradouro": "Praça da Sé",
            "numero": "100",
            "complemento": "Apto 42",
            "bairro": "Sé",
            "cidade": "São Paulo",
            "estado": "SP",
        },
    }
    dados.update(kwargs)
    return dados


# ===========================================================================
# Testes do Módulo de Segurança (security.py)
# ===========================================================================


class TestSeguranca:
    """Testes unitários das funções criptográficas de senha."""

    def test_hash_e_verificacao_sucesso(self):
        senha = "MinhaSenhaSecreta99"
        hash_gerado = hash_senha(senha)

        assert hash_gerado != senha
        assert "$" in hash_gerado
        assert verificar_senha(senha, hash_gerado) is True

    def test_verificacao_senha_incorreta(self):
        senha = "SenhaCorreta123"
        hash_gerado = hash_senha(senha)

        assert verificar_senha("SenhaErrada123", hash_gerado) is False

    def test_verificacao_com_hash_invalido(self):
        assert verificar_senha("qualquer_coisa", "hash_invalido_sem_cifrao") is False


# ===========================================================================
# Testes de Cadastro (POST /api/clientes) - Cenários de Sucesso
# ===========================================================================


class TestCadastrarClienteSucesso:
    """Testes de fluxos com sucesso na criação de clientes."""

    def test_cadastrar_cliente_completo_retorna_201(self, client: TestClient):
        payload = payload_cliente_valido()
        response = client.post("/api/clientes", json=payload)

        assert response.status_code == 201
        data = response.json()

        assert data["id"] > 0
        assert data["nome"] == payload["nome"]
        assert data["email"] == payload["email"]
        assert data["cpf"] == "12345678909"
        assert data["data_nascimento"] == payload["data_nascimento"]
        assert "criado_em" in data

        # Endereço estruturado
        assert data["endereco"]["cep"] == "01001000"
        assert data["endereco"]["logradouro"] == "Praça da Sé"
        assert data["endereco"]["numero"] == "100"
        assert data["endereco"]["complemento"] == "Apto 42"
        assert data["endereco"]["bairro"] == "Sé"
        assert data["endereco"]["cidade"] == "São Paulo"
        assert data["endereco"]["estado"] == "SP"

        # Garantir que credenciais NÃO são expostas
        assert "senha" not in data
        assert "confirmar_senha" not in data
        assert "senha_hash" not in data

    def test_cadastrar_cliente_sem_complemento_sucesso(self, client: TestClient):
        payload = payload_cliente_valido(
            email="sem.complemento@example.com",
            cpf="98765432100",  # CPF válido (d1=0, d2=0)
            endereco={
                "cep": "01001-000",  # Com hífen para testar sanitização
                "logradouro": "Rua Principal",
                "numero": "50",
                "complemento": None,
                "bairro": "Centro",
                "cidade": "Campinas",
                "estado": "SP",
            },
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["endereco"]["complemento"] is None
        assert data["endereco"]["cep"] == "01001000"

    def test_cadastrar_cliente_com_cpf_pontuado(self, client: TestClient):
        payload = payload_cliente_valido(
            cpf="111.444.777-35",  # CPF formatado válido
            email="pontuado@example.com",
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 201
        assert response.json()["cpf"] == "11144477735"


# ===========================================================================
# Testes de Validações de Senha
# ===========================================================================


class TestValidacoesSenha:
    """Testes de validação da senha e confirmação."""

    def test_rejeita_senhas_divergentes(self, client: TestClient):
        payload = payload_cliente_valido(
            senha="SenhaValida1",
            confirmar_senha="OutraSenhaDiferente2",
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "não confere" in response.text

    def test_rejeita_senha_curta(self, client: TestClient):
        payload = payload_cliente_valido(
            senha="Curta1",
            confirmar_senha="Curta1",
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "no mínimo 8 caracteres" in response.text

    def test_rejeita_senha_sem_numeros(self, client: TestClient):
        payload = payload_cliente_valido(
            senha="ApenasLetrasAqui",
            confirmar_senha="ApenasLetrasAqui",
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "pelo menos um número" in response.text

    def test_rejeita_senha_sem_letras(self, client: TestClient):
        payload = payload_cliente_valido(
            senha="1234567890",
            confirmar_senha="1234567890",
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "pelo menos uma letra" in response.text


# ===========================================================================
# Testes de Validações de CPF
# ===========================================================================


class TestValidacoesCPF:
    """Testes de validação estrita do CPF brasileiro."""

    def test_rejeita_cpf_digito_verificador_invalido(self, client: TestClient):
        # 12345678910 falha no primeiro dígito (d1 esperado é 0, recebido 1)
        payload1 = payload_cliente_valido(cpf="12345678910")
        resp1 = client.post("/api/clientes", json=payload1)
        assert resp1.status_code == 422
        assert "Dígito verificador do CPF inválido" in resp1.text

        # 12345678900 passa no primeiro dígito (d1=0), mas falha no segundo dígito (d2 esperado é 9, recebido 0)
        payload2 = payload_cliente_valido(cpf="12345678900")
        resp2 = client.post("/api/clientes", json=payload2)
        assert resp2.status_code == 422
        assert "Dígito verificador do CPF inválido" in resp2.text

    def test_rejeita_cpf_digitos_iguais(self, client: TestClient):
        for digito in ["11111111111", "00000000000", "99999999999"]:
            payload = payload_cliente_valido(cpf=digito)
            response = client.post("/api/clientes", json=payload)
            assert response.status_code == 422
            assert "CPF inválido" in response.text

    def test_rejeita_cpf_tamanho_invalido(self, client: TestClient):
        payload = payload_cliente_valido(cpf="123456")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "exatamente 11 dígitos" in response.text


# ===========================================================================
# Testes de Validações de E-mail
# ===========================================================================


class TestValidacoesEmail:
    """Testes de validação de formato e normalização de e-mail."""

    @pytest.mark.parametrize(
        "email_invalido",
        [
            "usuario_sem_arroba.com",
            "@semusuario.com",
            "usuario@.com",
            "usuario@dominio",
            "usuario@@duplo.com",
        ],
    )
    def test_rejeita_formatos_email_invalidos(self, client: TestClient, email_invalido: str):
        payload = payload_cliente_valido(email=email_invalido)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "E-mail com formato inválido" in response.text

    def test_normaliza_email_para_minusculo(self, client: TestClient):
        payload = payload_cliente_valido(email="CLIENTE.TESTE@EXAMPLE.COM")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 201
        assert response.json()["email"] == "cliente.teste@example.com"


# ===========================================================================
# Testes de Validações de Data de Nascimento (Idade Mínima 18 anos)
# ===========================================================================


class TestValidacoesDataNascimento:
    """Testes de validação da data de nascimento e maioridade."""

    def test_rejeita_data_nascimento_futura(self, client: TestClient):
        hoje = date.today()
        futuro = f"{hoje.year + 1}-01-01"
        payload = payload_cliente_valido(data_nascimento=futuro)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "futuro" in response.text

    def test_rejeita_cliente_menor_de_18_anos(self, client: TestClient):
        hoje = date.today()
        menor = f"{hoje.year - 15}-01-01"
        payload = payload_cliente_valido(data_nascimento=menor)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "mínimo 18 anos" in response.text

    def test_rejeita_idade_invalida_centenaria(self, client: TestClient):
        payload = payload_cliente_valido(data_nascimento="1890-01-01")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "Data de nascimento inválida" in response.text


# ===========================================================================
# Testes de Validações de Nome e Endereço
# ===========================================================================


class TestValidacoesNomeEndereco:
    """Testes de validação de nome, CEP e campos do endereço."""

    def test_rejeita_nome_curto(self, client: TestClient):
        payload = payload_cliente_valido(nome="Ab")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "no mínimo 3 caracteres" in response.text

    def test_rejeita_nome_sem_letras(self, client: TestClient):
        payload = payload_cliente_valido(nome="12345")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "deve conter letras" in response.text

    def test_rejeita_cep_invalido(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["cep"] = "123"
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "8 dígitos" in response.text

    def test_rejeita_estado_invalido(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["estado"] = "XX"  # Sigla não existente
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "Estado 'XX' inválido" in response.text

    @pytest.mark.parametrize("campo", ["logradouro", "numero", "bairro", "cidade"])
    def test_rejeita_campo_endereco_vazio(self, client: TestClient, campo: str):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco[campo] = "   "
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert f"'{campo}' não pode ser vazio" in response.text


# ===========================================================================
# Testes de Unicidade e Conflitos (HTTP 409 Conflict)
# ===========================================================================


class TestUnicidadeCliente:
    """Testes de garantia contra duplicação de e-mail e CPF."""

    def test_rejeita_email_duplicado(self, client: TestClient):
        payload1 = payload_cliente_valido(
            email="duplicado@example.com",
            cpf="12345678909",
        )
        resp1 = client.post("/api/clientes", json=payload1)
        assert resp1.status_code == 201

        # Segundo cliente com mesmo e-mail, mas CPF diferente
        payload2 = payload_cliente_valido(
            email="duplicado@example.com",
            cpf="98765432100",
        )
        resp2 = client.post("/api/clientes", json=payload2)
        assert resp2.status_code == 409
        assert "E-mail já cadastrado" in resp2.json()["detail"]

    def test_rejeita_cpf_duplicado(self, client: TestClient):
        payload1 = payload_cliente_valido(
            email="cliente1@example.com",
            cpf="12345678909",
        )
        resp1 = client.post("/api/clientes", json=payload1)
        assert resp1.status_code == 201

        # Segundo cliente com CPF igual, mas e-mail diferente
        payload2 = payload_cliente_valido(
            email="cliente2@example.com",
            cpf="12345678909",
        )
        resp2 = client.post("/api/clientes", json=payload2)
        assert resp2.status_code == 409
        assert "CPF já cadastrado" in resp2.json()["detail"]


# ===========================================================================
# Testes de Busca e Listagem (GET /api/clientes)
# ===========================================================================


class TestConsultasCliente:
    """Testes dos endpoints de leitura e busca."""

    def test_obter_cliente_por_id_existente(self, client: TestClient):
        payload = payload_cliente_valido()
        criado = client.post("/api/clientes", json=payload).json()
        cliente_id = criado["id"]

        response = client.get(f"/api/clientes/{cliente_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == cliente_id
        assert data["nome"] == payload["nome"]
        assert data["email"] == payload["email"]

    def test_obter_cliente_por_id_inexistente(self, client: TestClient):
        response = client.get("/api/clientes/99999")
        assert response.status_code == 404
        assert "Cliente não encontrado" in response.json()["detail"]

    def test_listar_clientes(self, client: TestClient):
        # Banco inicialmente vazio para clientes
        resp_vazio = client.get("/api/clientes")
        assert resp_vazio.status_code == 200
        assert resp_vazio.json() == []

        # Cadastra 2 clientes
        client.post("/api/clientes", json=payload_cliente_valido(email="c1@example.com", cpf="12345678909"))
        client.post("/api/clientes", json=payload_cliente_valido(email="c2@example.com", cpf="98765432100"))

        response = client.get("/api/clientes")
        assert response.status_code == 200
        lista = response.json()
        assert len(lista) == 2
        assert lista[0]["email"] == "c1@example.com"
        assert lista[1]["email"] == "c2@example.com"
