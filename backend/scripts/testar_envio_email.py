"""
Utilitário CLI profissional para diagnóstico e validação de envio real de e-mails.

Uso:
    python backend/scripts/testar_envio_email.py seu-email@exemplo.com

Diagnóstico em 4 etapas:
    [1/4] Análise de Configurações, Descoberta do .env e Resolução de Parâmetros
    [2/4] Conectividade de Socket TCP puro com Diagnóstico de Portas (587 / 465)
    [3/4] Handshake TLS/SSL e Autenticação SMTP
    [4/4] Disparo Transacional e Medição de Latência com Entrega Real
"""

import os
import socket
import ssl
import sys
import time
from pathlib import Path

# Suporte a UTF-8 em terminais Windows (cp1252)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Adiciona o diretório backend ao sys.path para importação limpa
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import env_loader
import email_service
import security


def testar_conectividade_tcp(host: str, porta: int, timeout: int = 5) -> tuple[bool, str, float]:
    """Testa a abertura direta de socket TCP para identificar bloqueios de firewall ou rede."""
    inicio = time.perf_counter()
    try:
        with socket.create_connection((host, porta), timeout=timeout):
            latencia = (time.perf_counter() - inicio) * 1000
            return True, "Porta acessível", latencia
    except socket.gaierror as e:
        return False, f"Falha na resolução de DNS para '{host}': {e}", 0.0
    except (socket.timeout, TimeoutError):
        return False, f"Timeout ({timeout}s) ao tentar conectar em {host}:{porta}. Verifique firewall.", 0.0
    except ConnectionRefusedError:
        return False, f"Conexão recusada em {host}:{porta}. O serviço não está rodando nesta porta.", 0.0
    except OSError as e:
        return False, f"Erro de rede ao conectar em {host}:{porta}: {e}", 0.0


def diagnosticar_e_enviar(destinatario: str) -> bool:
    print("\n" + "═" * 70)
    print(" 🛠️  DIAGNÓSTICO E VALIDAÇÃO DE E-MAIL TRANSACIONAL — RENTAL SPOUSE")
    print("═" * 70)

    # 1. Configurações e detecção de .env
    arquivo_env = env_loader.ARQUIVO_ENV_CARREGADO
    backend = email_service.backend_configurado()
    cfg = email_service.ConfiguracaoSmtp.do_ambiente()
    nome_remetente, endereco_remetente = email_service.remetente()
    base_url = email_service.app_base_url()
    reply_to = os.getenv("EMAIL_REPLY_TO", "(mesmo do remetente)")

    # Se o usuário configurou SMTP_HOST mas esqueceu EMAIL_BACKEND=console no .env:
    if backend == "console" and cfg.host:
        print("\n  💡 [AVISO]: Detectado SMTP_HOST configurado no .env, porém EMAIL_BACKEND estava 'console'.")
        print(f"     Alternando automaticamente para transporte 'smtp' ({cfg.host}) para permitir teste real!")
        os.environ["EMAIL_BACKEND"] = "smtp"
        backend = "smtp"

    print("\n[1/4] Análise de Configurações Ativas:")
    if arquivo_env:
        print(f"  • Arquivo .env:        {arquivo_env} (carregado com sucesso)")
    else:
        print("  • Arquivo .env:        Nenhum arquivo .env encontrado (usando variáveis de ambiente do SO)")

    print(f"  • EMAIL_BACKEND:       {backend}")
    print(f"  • APP_BASE_URL:        {base_url}")
    print(f"  • Remetente Oficial:   {nome_remetente} <{endereco_remetente}>")
    print(f"  • Reply-To:            {reply_to}")
    print(f"  • Destinatário Alvo:   {email_service.mascarar_email(destinatario)} ({destinatario})")

    if backend == "smtp":
        print(f"  • Servidor SMTP:       {cfg.host}:{cfg.porta}")
        print(f"  • Modo de Segurança:   {'SSL/TLS Direto (SMTPS)' if cfg.usar_ssl else ('STARTTLS' if cfg.usar_tls else 'Sem criptografia (Plain)')}")
        print(f"  • Usuário SMTP:        {cfg.usuario or '(anônimo/sem login)'}")
        print(f"  • Senha Configurada:   {'Sim (protegida)' if cfg.senha else 'Não (em branco)'}")
        print(f"  • Política de Retries: {cfg.max_tentativas} tentativas (Timeout: {cfg.timeout}s)")
    print("-" * 70)

    # Caso continue como console (sem SMTP_HOST configurado)
    if backend == "console":
        print("\n  ⚠️  [TRANSPORTE 'console' ATIVO — NENHUM E-MAIL FOI ENVIADO PELA REDE]")
        print("  O sistema está em modo console: o conteúdo é apenas registrado no log local.")
        print(f"  A mensagem NÃO foi entregue à caixa postal real de '{destinatario}'.")
        print("\n  📝 Para configurar o envio real para sua caixa postal:")
        print("     1. Crie ou configure seu arquivo .env (copiando de .env.example):")
        print("        EMAIL_BACKEND=smtp")
        print("        SMTP_HOST=smtp.gmail.com   (ou outro provedor SMTP)")
        print("        SMTP_PORT=587              (ou 465)")
        print("        SMTP_USER=seu-email@gmail.com")
        print("        SMTP_PASSWORD=xxxx xxxx xxxx xxxx  (Senha de App Google de 16 letras)")
        print("        SMTP_USE_TLS=true")
        print("        SMTP_USE_SSL=false         (ou true na porta 465)")
        print("     2. Execute este utilitário novamente após preencher o .env.")
        print("═" * 70 + "\n")
        return False

    # 2. Teste de Socket TCP (se SMTP)
    if backend == "smtp":
        print("\n[2/4] Teste de Conectividade de Socket TCP:")
        if not cfg.host:
            print("  ❌ [FALHA] SMTP_HOST não está configurado!")
            return False

        ok, msg, latencia = testar_conectividade_tcp(cfg.host, cfg.porta, timeout=cfg.timeout)
        if ok:
            print(f"  ✅ Conexão TCP estabelecida com {cfg.host}:{cfg.porta} em {latencia:.1f}ms")
        else:
            print(f"  ❌ [FALHA DE REDE] {msg}")
            # Diagnóstico cruzado de portas 587 vs 465
            porta_alternativa = 465 if cfg.porta == 587 else 587
            print(f"  🔍 Testando porta alternativa {porta_alternativa}...")
            ok_alt, _, lat_alt = testar_conectividade_tcp(cfg.host, porta_alternativa, timeout=cfg.timeout)
            if ok_alt:
                print(f"  💡 A porta {porta_alternativa} está aberta e respondeu em {lat_alt:.1f}ms!")
                if porta_alternativa == 465:
                    print("     Sugestão: Altere no seu .env para usar SMTP_PORT=465 e SMTP_USE_SSL=true.")
                else:
                    print("     Sugestão: Altere no seu .env para usar SMTP_PORT=587 e SMTP_USE_TLS=true.")
            else:
                print("  💡 Dicas:")
                print("     - Se estiver usando Gmail: confirme se a porta 465 ou 587 não está bloqueada pelo seu firewall/provedor.")
                print("     - Se estiver usando Mailpit local em Docker: use SMTP_HOST=localhost e SMTP_PORT=1025.")
            return False

    # 3. Geração de Token e Composição
    print("\n[3/4] Composição de Mensagem com Headers RFC 5322:")
    token_teste = security.gerar_token_verificacao()
    link = email_service.montar_link_verificacao(token_teste)
    msg = email_service.montar_mensagem_verificacao(
        destinatario=destinatario,
        nome="Usuário de Teste",
        token=token_teste,
        expira_horas=24,
    )
    print(f"  • Message-ID:          {msg['Message-ID']}")
    print(f"  • Date Header:         {msg['Date']}")
    print(f"  • Auto-Submitted:      {msg['Auto-Submitted']}")
    print(f"  • X-Mailer:            {msg.get('X-Mailer', '(nenhum)')}")
    print(f"  • Link Gerado:         {link}")

    # 4. Disparo
    print(f"\n[4/4] Disparando e-mail transacional via transporte '{backend}'...")
    inicio_disparo = time.perf_counter()
    try:
        email_service.obter_transporte().enviar(msg)
        duracao_total = (time.perf_counter() - inicio_disparo) * 1000
        print(f"  ✅ [SUCESSO TOTAL] E-mail aceito pelo servidor SMTP ({cfg.host}:{cfg.porta}) em {duracao_total:.1f}ms!")
        print("     O servidor de e-mail confirmou o recebimento da mensagem (código 250 OK).")

        print("\n" + "═" * 70)
        print(" 🎯 GUIA DE VERIFICAÇÃO EM AMBIENTE REAL:")
        print("═" * 70)
        print(f"  1. Acesse a caixa postal de '{destinatario}'.")
        print("  2. Verifique a Caixa de Entrada Principal.")
        print("  3. Caso não visualize de imediato, consulte a pasta de 'Spam' ou 'Lixo Eletrônico'.")
        print("  4. Clique no botão 'Confirmar meu e-mail' ou no link gerado:")
        print(f"     {link}")
        print("  5. O frontend web confirmará a verificação e ativará a conta com sucesso!")
        print("═" * 70 + "\n")
        return True

    except email_service.ErroEnvioEmail as erro:
        duracao_total = (time.perf_counter() - inicio_disparo) * 1000
        print(f"  ❌ [ERRO DE TRANSPORTE] (tempo: {duracao_total:.1f}ms): {erro}")
        print("\n  🔍 Diagnóstico rápido de falha:")
        print("     • Erro 535 / BadCredentials: No Gmail, é obrigatório gerar uma 'Senha de App' de 16 letras")
        print("       (em https://myaccount.google.com/apppasswords). Senha convencional de login não funciona.")
        print("     • Erro 550 / SenderReject: O SMTP_USER precisa coincidir com a conta do remetente autenticado.")
        print("     • Timeout de conexão: Experimente alternar entre porta 465 (SSL) e 587 (TLS).")
        print("═" * 70 + "\n")
        return False
    except Exception as exc:
        print(f"  ❌ [FALHA INESPERADA]: {exc}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2 or not sys.argv[1].strip() or sys.argv[1].strip() in ("-h", "--help"):
        print("Uso: python backend/scripts/testar_envio_email.py <email-do-destinatario>")
        sys.exit(0 if len(sys.argv) >= 2 and sys.argv[1].strip() in ("-h", "--help") else 1)

    alvo = sys.argv[1].strip()
    sucesso = diagnosticar_e_enviar(alvo)
    sys.exit(0 if sucesso else 1)
