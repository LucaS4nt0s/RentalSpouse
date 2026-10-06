"""
Testes da notificação por e-mail aos administradores (issue #55 · Tarefa 1 · Fase A).

Cobrem:
- 2 administradores ativos -> 2 e-mails (com assunto fixo, corpo em texto puro
  contendo nome/e-mail do profissional e remetente configurado)
- administrador inativo é ignorado
- sem administradores -> 0 e nenhum e-mail
- `EMAIL_BACKEND=smtp` sem `SMTP_HOST` -> não levanta exceção
- falha pontual de um destinatário não interrompe os demais
"""

from email.utils import formataddr

import email_service
import models
import notificacoes


def criar_admin(db_session, email: str, ativo: bool = True) -> models.User:
    """Cria um usuário administrador diretamente no banco de testes."""
    admin = models.User(
        name=f"Admin {email}",
        email=email,
        hashed_password="hash-nao-usado-nos-testes",
        role=models.UserRole.ADMIN.value,
        is_active=ativo,
    )
    db_session.add(admin)
    db_session.commit()
    return admin


def criar_profissional(
    db_session, email: str = "prof.notificado@exemplo.com"
) -> models.Professional:
    """Cria um profissional diretamente no banco de testes."""
    profissional = models.Professional(
        name="Profissional Notificado",
        email=email,
        bio="Profissional usado apenas nos testes de notificação por e-mail.",
        service_radius_km=10.0,
        specialties=["Elétrica"],
        city="São Paulo",
        state="SP",
    )
    db_session.add(profissional)
    db_session.commit()
    db_session.refresh(profissional)
    return profissional


class TestNotificarAdminsDocumentosEnviados:
    """Testes de `notificacoes.notificar_admins_documentos_enviados`."""

    def test_notifica_cada_admin_ativo(self, db_session, caixa_de_entrada):
        criar_admin(db_session, "admin1@rentalspouse.com")
        criar_admin(db_session, "admin2@rentalspouse.com")
        profissional = criar_profissional(db_session)

        enviados = notificacoes.notificar_admins_documentos_enviados(
            db_session, profissional
        )

        assert enviados == 2
        assert len(caixa_de_entrada) == 2
        assert {mensagem["To"] for mensagem in caixa_de_entrada} == {
            "admin1@rentalspouse.com",
            "admin2@rentalspouse.com",
        }

        mensagem = caixa_de_entrada[0]
        assert mensagem["Subject"] == notificacoes.ASSUNTO_DOCUMENTOS_ENVIADOS
        assert mensagem["From"] == formataddr(email_service.remetente())

        corpo = mensagem.get_body(preferencelist=("plain",)).get_content()
        assert profissional.name in corpo
        assert profissional.email in corpo

    def test_admin_inativo_e_ignorado(self, db_session, caixa_de_entrada):
        criar_admin(db_session, "admin.ativo@rentalspouse.com", ativo=True)
        criar_admin(db_session, "admin.inativo@rentalspouse.com", ativo=False)
        profissional = criar_profissional(db_session)

        enviados = notificacoes.notificar_admins_documentos_enviados(
            db_session, profissional
        )

        assert enviados == 1
        assert len(caixa_de_entrada) == 1
        assert caixa_de_entrada[0]["To"] == "admin.ativo@rentalspouse.com"

    def test_sem_admins_retorna_zero_e_nao_envia(self, db_session, caixa_de_entrada):
        profissional = criar_profissional(db_session)

        enviados = notificacoes.notificar_admins_documentos_enviados(
            db_session, profissional
        )

        assert enviados == 0
        assert caixa_de_entrada == []

    def test_smtp_sem_host_nao_levanta_excecao(
        self, db_session, caixa_de_entrada, monkeypatch
    ):
        criar_admin(db_session, "admin.smtp@rentalspouse.com")
        profissional = criar_profissional(db_session)

        monkeypatch.setenv("EMAIL_BACKEND", "smtp")
        monkeypatch.delenv("SMTP_HOST", raising=False)

        enviados = notificacoes.notificar_admins_documentos_enviados(
            db_session, profissional
        )

        assert enviados == 0
        assert caixa_de_entrada == []

    def test_falha_de_um_destinatario_nao_interrompe_os_demais(
        self, db_session, caixa_de_entrada, monkeypatch
    ):
        criar_admin(db_session, "admin.falha@rentalspouse.com")
        criar_admin(db_session, "admin.ok@rentalspouse.com")
        profissional = criar_profissional(db_session)

        class TransporteComFalhaParcial:
            """Falha apenas para o primeiro destinatário; entrega os demais."""

            def __init__(self):
                self.entregues = []

            def enviar(self, mensagem):
                if mensagem["To"] == "admin.falha@rentalspouse.com":
                    raise email_service.ErroEnvioEmail("falha simulada de SMTP")
                self.entregues.append(mensagem)
                caixa_de_entrada.append(mensagem)

        monkeypatch.setattr(
            email_service, "obter_transporte", lambda: TransporteComFalhaParcial()
        )

        enviados = notificacoes.notificar_admins_documentos_enviados(
            db_session, profissional
        )

        assert enviados == 1
        assert [mensagem["To"] for mensagem in caixa_de_entrada] == [
            "admin.ok@rentalspouse.com"
        ]
