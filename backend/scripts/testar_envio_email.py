"""
Utilitário CLI profissional para diagnóstico e validação de envio real de e-mails.

Uso:
    python backend/scripts/testar_envio_email.py seu-email@exemplo.com

Diagnóstico em 4 etapas:
    [1/4] Análise de Configurações e Resolução de Parâmetros
    [2/4] Conectividade de Socket TCP puro (Teste de Firewall / Porta)
    [3/4] Handshake TLS/SSL e Autenticação SMTP
    [4/4] Disparo Transacional e Medição de Latência
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

    # 1. Configurações
    backend = email_service.backend_configurado()
    nome_remetente, endereco_remetente = email_service.remetente()
    cfg = email_service.ConfiguracaoSmtp.do_ambiente()
    base_url = email_service.app_base_url()
    reply_to = os.getenv("EMAIL_REPLY_TO", "(mesmo do remetente)")

    print("\n[1/4] Análise de Configurações Ativas:")
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
            print("\n  💡 Dicas:")
            print("     - Se estiver usando Gmail: confirme se a porta 465 ou 587 não está bloqueada pelo seu antivírus/provedor.")
            print("     - Se estiver usando Docker local com Mailpit: verifique se o container está rodando e use SMTP_HOST=localhost.")
            return False
    else:
        print(f"\n[2/4] Transporte '{backend}' não requer verificação de socket TCP de rede.")

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
        print(f"  ✅ [SUCESSO] Mensagem despachada com sucesso em {duracao_total:.1f}ms!")

        print("\n" + "═" * 70)
        print(" 🎯 GUIA DE VERIFICAÇÃO EM AMBIENTE REAL:")
        print("═" * 70)
        print(f"  1. Acesse a caixa de entrada de '{destinatario}'.")
        print("  2. Verifique a Caixa de Entrada Principal.")
        print("  3. Caso não localize, verifique a pasta de 'Spam' ou 'Lixo Eletrônico'.")
        print("  4. Clique no botão azul ou no link de contingência para testar a confirmação.")
        print("  5. Observe o comportamento no navegador (deve retornar confirmação com sucesso).")
        print("═" * 70 + "\n")
        return True

    except email_service.ErroEnvioEmail as erro:
        duracao_total = (time.perf_counter() - inicio_disparo) * 1000
        print(f"  ❌ [ERRO DE TRANSPORTE] (tempo: {duracao_total:.1f}ms): {erro}")
        print("\n  🔍 Diagnóstico rápido de falha:")
        print("     • Erro 535 / BadCredentials: No Gmail, é obrigatório gerar uma 'Senha de App' de 16 letras.")
        print("     • Erro 550 / SenderReject: O SMTP_USER precisa coincidir com o remetente da conta autenticada.")
        print("     • Timeout: Tente alternar entre porta 465 (SMTP_USE_SSL=true) e 587 (SMTP_USE_TLS=true).")
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
