from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from security import hash_senha, verificar_senha


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

    def test_verificacao_com_tipo_invalido(self):
        # Dispara AttributeError quando split não puder ser chamado
        assert verificar_senha("senha", None) is False  # type: ignore


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

    def test_rejeita_senha_longa(self, client: TestClient):
        senha_longa = "A1" + "a" * 127
        payload = payload_cliente_valido(
            senha=senha_longa,
            confirmar_senha=senha_longa,
        )
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422

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

    def test_rejeita_cpf_com_mais_de_14_caracteres(self, client: TestClient):
        payload = payload_cliente_valido(cpf="123.456.789-0123")
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422


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
            "a@b.com.",
            "a@b..com",
            "a..b@example.com",
            ".user@example.com",
            "user.@example.com",
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

    def test_rejeita_email_estouro_max_length(self, client: TestClient):
        long_email = ("a" * 250) + "@ex.com"  # > 255 chars
        payload = payload_cliente_valido(email=long_email)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422


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
# Testes de Validações de Nome, Endereço e Limites de Tamanho (max_length)
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

    def test_rejeita_nome_estouro_max_length(self, client: TestClient):
        payload = payload_cliente_valido(nome="A" * 256)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422

    def test_rejeita_cep_invalido(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["cep"] = "123"
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "8 dígitos" in response.text

    def test_rejeita_cep_estouro_max_length(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["cep"] = "01001-00000"
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422

    def test_rejeita_estado_invalido(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["estado"] = "XX"  # Sigla não existente
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert "Estado 'XX' inválido" in response.text

    def test_rejeita_estado_tamanho_invalido(self, client: TestClient):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco["estado"] = "SÃO"
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422

    @pytest.mark.parametrize("campo", ["logradouro", "numero", "bairro", "cidade"])
    def test_rejeita_campo_endereco_vazio(self, client: TestClient, campo: str):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco[campo] = "   "
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422
        assert f"'{campo}' não pode ser vazio" in response.text

    @pytest.mark.parametrize(
        ("campo", "tamanho_maximo"),
        [
            ("logradouro", 255),
            ("numero", 50),
            ("complemento", 255),
            ("bairro", 100),
            ("cidade", 100),
        ],
    )
    def test_rejeita_campos_endereco_estouro_max_length(
        self, client: TestClient, campo: str, tamanho_maximo: int
    ):
        endereco = payload_cliente_valido()["endereco"].copy()
        endereco[campo] = "X" * (tamanho_maximo + 1)
        payload = payload_cliente_valido(endereco=endereco)
        response = client.post("/api/clientes", json=payload)
        assert response.status_code == 422


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

    def test_rejeita_conflito_por_integrity_error_no_commit(self, client: TestClient):
        """Simula condição de corrida onde db.commit() estoura IntegrityError."""
        payload = payload_cliente_valido(
            email="corrida@example.com",
            cpf="12345678909",
        )
        with patch("sqlalchemy.orm.Session.commit", side_effect=IntegrityError("statement", "params", "orig")):
            response = client.post("/api/clientes", json=payload)
            assert response.status_code == 409
            assert "E-mail ou CPF já cadastrado" in response.json()["detail"]
