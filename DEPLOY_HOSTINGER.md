# 🚀 Guia de Deploy na Hostinger (VPS KVM 1) - Vigilante Parlamentar

O plano **KVM 1** da Hostinger possui **1 vCPU e 4 GB de RAM**, o que é **mais que suficiente** e excelente para rodar o Vigilante Parlamentar com Docker + Nginx + FastAPI.

---

## ⚡ Passo 1: Acessar a VPS via SSH

No terminal do seu computador (PowerShell, CMD ou terminal Linux/Mac):

```bash
ssh root@SEU_IP_DA_HOSTINGER
```
*(Substitua `SEU_IP_DA_HOSTINGER` pelo IP fornecido no painel da Hostinger e insira a senha definida para o `root`)*.

---

## 📦 Passo 2: Atualizar o Sistema e Instalar o Docker

Execute os comandos abaixo na VPS para atualizar os pacotes e instalar o Docker oficial:

```bash
# 1. Atualizar repositórios
apt update && apt upgrade -y

# 2. Instalar utilitários e Git
apt install -y git curl ufw

# 3. Instalar Docker e Docker Compose plugin automaticamente
curl -fsSL https://get.docker.com | sh

# 4. Habilitar o Docker para iniciar junto com o sistema
systemctl enable docker
systemctl start docker
```

---

## 📥 Passo 3: Clonar o Repositório do GitHub

```bash
# Navegue até o diretório /var/www ou /opt
cd /opt

# Clone o repositório público
git clone https://github.com/vrito4020/vigilante-parlamentar.git

# Acesse a pasta do projeto
cd vigilante-parlamentar
```

---

## 🛡️ Passo 4: Configurar o Firewall (UFW)

Garanta que as portas necessárias estejam liberadas:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## 🚀 Passo 5: Subir a Aplicação com Docker Compose

Dentro da pasta `/opt/vigilante-parlamentar`, execute:

```bash
docker compose up -d --build
```

O Docker irá:
1. Construir o container do **Backend FastAPI** com Python 3.12.
2. Fazer o build do **Frontend React/Vite** e servi-lo via **Nginx** de alta performance.
3. Configurar automaticamente o roteamento:
   - `http://SEU_IP_DA_HOSTINGER/` ➔ Frontend React (Home, Dossiê, Mapa, Comparador)
   - `http://SEU_IP_DA_HOSTINGER/api/` ➔ Backend FastAPI

---

## 🔍 Passo 6: Verificar se os Containers Estão Rodando

```bash
docker compose ps
```

Você deverá ver dois containers com status **Up**:
- `vigilante_backend` (porta 8000)
- `vigilante_frontend` (porta 80)

Para ver os logs do backend em tempo real:
```bash
docker compose logs -f backend
```

---

## 🔄 Como Atualizar a Aplicação no Futuro?

Sempre que fizer alterações no código e der `git push` no seu computador:

1. Acesse a VPS:
   ```bash
   ssh root@SEU_IP_DA_HOSTINGER
   ```
2. Puxe as atualizações e reconstrua os containers:
   ```bash
   cd /opt/vigilante-parlamentar
   git pull origin main
   docker compose up -d --build
   ```

---

## 🔒 (Opcional) Adicionar Domínio e Certificado SSL (HTTPS Gratuito)

Se você apontar um domínio (ex: `vigilante.seusite.com`) para o IP da sua VPS:

1. Instale o Certbot:
   ```bash
   apt install -y certbot
   ```
2. Pare temporariamente a porta 80 para gerar o certificado:
   ```bash
   docker compose down
   certbot certonly --standalone -d seu_dominio.com
   ```
3. Aponte o certificado no `nginx.conf` ou utilize um reverse proxy com Caddy/Traefik.
