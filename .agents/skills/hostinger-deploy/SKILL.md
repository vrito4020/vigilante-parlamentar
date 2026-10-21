---
name: hostinger-deploy
description: >-
  Automatiza a conexão SSH, provisionamento do Docker, configuração de firewall,
  deploy e atualização contínua de aplicações em VPS Hostinger (KVM) ou servidores Linux remotos.
---

# Skill: Deploy e Gestão de VPS Hostinger (KVM)

Esta skill permite ao agente e ao desenvolvedor conectar, configurar e realizar o deploy de projetos containerizados diretamente em uma VPS Hostinger (ou qualquer servidor Linux Debian/Ubuntu com SSH).

---

## 🎯 Capacidades e Ações

1. **Provisionamento Inicial do Servidor:**
   - Instalação de Docker, Docker Compose, Git e utilitários de rede.
   - Configuração de firewall UFW (portas 22, 80, 443).
2. **Deploy de Aplicações:**
   - Clonagem do repositório Git na VPS (`/opt/<projeto>`).
   - Construção e inicialização de containers (`docker compose up -d --build`).
3. **Atualização Contínua (Rolling Updates):**
   - Execução remota de `git pull` e recriação dos containers sem perder dados persistidos em volumes.
4. **Inspeção de Saúde e Diagnóstico:**
   - Leitura de logs (`docker compose logs --tail=100`).
   - Monitoramento de uso de CPU, memória RAM e disco na VPS (`docker stats`, `df -h`).

---

## 🛠️ Procedimento de Execução Automatizada

### 1. Parâmetros Necessários
Para executar comandos no servidor remoto, o agente precisa de:
- **IP da VPS:** (ex: `195.35.x.x`)
- **Porta SSH:** Padrão `22`
- **Usuário:** Normalmente `root`
- **Autenticação:** Chave SSH privada (`~/.ssh/id_rsa` ou `id_ed25519`) ou senha.

> [!TIP]
> A melhor prática de segurança é utilizar chave SSH pública cadastrada no painel da Hostinger ou executar via script PowerShell com SSH direto do terminal do usuário.

---

### 2. Script de Provisionamento e Deploy Remoto

Quando os dados de acesso forem informados, o comando padrão de provisionamento em uma linha pode ser executado:

```bash
ssh -o StrictHostKeyChecking=no root@<IP_DO_SERVIDOR> "bash -s" << 'EOF'
set -e
echo "==> Atualizando pacotes..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq git curl ufw

echo "==> Configurando Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

echo "==> Configurando Firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Clonando ou atualizando repositório..."
mkdir -p /opt
if [ -d "/opt/vigilante-parlamentar" ]; then
    cd /opt/vigilante-parlamentar
    git pull origin main
else
    cd /opt
    git clone https://github.com/vrito4020/vigilante-parlamentar.git
    cd vigilante-parlamentar
fi

echo "==> Subindo containers com Docker Compose..."
docker compose up -d --build

echo "==> Deploy concluído com sucesso!"
docker compose ps
EOF
```

---

### 3. Rotina de Verificação Pós-Deploy

Após o comando de deploy, executar a validação de saúde do serviço:
```bash
curl -I http://<IP_DO_SERVIDOR>/
curl -I http://<IP_DO_SERVIDOR>/api/deputados
```
Retornando status HTTP 200, a aplicação está 100% operacional.
