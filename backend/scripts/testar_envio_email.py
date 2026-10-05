"""
Utilitário CLI para teste e validação de envio real de e-mails transacionais.

Uso:
    python backend/scripts/testar_envio_email.py seu-email@exemplo.com

Permite validar ponta a ponta a conectividade com provedores SMTP reais
(Gmail com Senha de App, Brevo, SendGrid, Mailpit, etc.) e verificar o
recebimento da mensagem na Caixa de Entrada ou na pasta de Spam.
"""

import os
import sys
from pathlib import Path

# Configura encoding utf-8 para terminais Windows (cp1252)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Adiciona o diretório backend ao sys.path para importação dos módulos
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import email_service
import security


def diagnosticar_e_enviar(destinatario: str) -> bool:
    print("\n" + "=" * 65)
    print(" [EMAIL] DIAGNOSTICO E TESTE DE ENVIO DE E-MAIL - RENTAL SPOUSE")
    print("=" * 65)

    backend = email_service.backend_configurado()
    nome_remetente, endereco_remetente = email_service.remetente()
    host = os.getenv("SMTP_HOST", "(não definido)")
    porta = os.getenv("SMTP_PORT", "587")
    usuario = os.getenv("SMTP_USER", "(não definido)")
    senha = os.getenv("SMTP_PASSWORD", "")
    tem_senha = "Sim (definida)" if senha else "Não (vazio)"
    usar_tls = os.getenv("SMTP_USE_TLS", "true")
    usar_ssl = os.getenv("SMTP_USE_SSL", "false")
    base_url = email_service.app_base_url()

    print(f" - EMAIL_BACKEND:       {backend}")
    print(f" - APP_BASE_URL:        {base_url}")
    print(f" - Remetente:           {nome_remetente} <{endereco_remetente}>")
    print(f" - Destinatario Teste:  {destinatario}")
    print(" --- Configuracoes SMTP ---")
    print(f" - Host:                {host}")
    print(f" - Porta:               {porta}")
    print(f" - Usuario:             {usuario}")
    print(f" - Senha informada:     {tem_senha}")
    print(f" - STARTTLS ativo:      {usar_tls}")
    print(f" - SSL direto ativo:    {usar_ssl}")
    print("=" * 65 + "\n")

    token_teste = security.gerar_token_verificacao()
    print("[*] Gerando mensagem de verificacao com token de teste...")
    link = email_service.montar_link_verificacao(token_teste)
    print(f"[>] Link de teste gerado: {link}\n")

    print(f"[*] Disparando e-mail para '{destinatario}'...")
    try:
        email_service.enviar_email_verificacao(
            destinatario=destinatario,
            nome="Usuario de Teste",
            token=token_teste,
            expira_horas=24,
        )
        print("[SUCESSO] E-mail enviado com SUCESSO pelo transporte configurado!")
        print(
            "\n[PROXIMOS PASSOS PARA VALIDACAO REAL]:"
            f"\n 1. Acesse a caixa postal de '{destinatario}'."
            "\n 2. Verifique a Caixa de Entrada (e tambem a pasta de Spam/Lixo Eletronico)."
            "\n 3. Clique no link de confirmacao recebido ou no botao 'Confirmar meu e-mail'."
            "\n 4. A pagina web devera abrir e confirmar a validacao da conta com sucesso.\n"
        )
        return True
    except email_service.ErroEnvioEmail as erro:
        print(f"[ERRO] Falha ao enviar e-mail: {erro}")
        print("\n[DICAS PARA RESOLUCAO]:")
        print(" - Se estiver usando Gmail: utilize uma 'Senha de App' de 16 caracteres em SMTP_PASSWORD.")
        print(" - Verifique se a porta (587 para STARTTLS ou 465 para SSL) condiz com seu provedor.")
        print(" - Se estiver usando Mailpit local em Docker: EMAIL_BACKEND=smtp, SMTP_HOST=localhost, SMTP_PORT=1025.")
        return False
    except Exception as exc:
        print(f"[ERRO] Falha inesperada: {exc}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("Uso: python testar_envio_email.py <email-do-destinatario>")
        sys.exit(1)

    alvo = sys.argv[1].strip()
    sucesso = diagnosticar_e_enviar(alvo)
    sys.exit(0 if sucesso else 1)
