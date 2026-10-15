# 🛡️ Vigilante Parlamentar

> Plataforma de auditoria cívica automatizada e detecção forense de inconformidades nos gastos da Cota para o Exercício da Atividade Parlamentar (CEAP) dos 513 deputados federais.

O sistema cruza dados oficiais em tempo real de 3 fontes públicas:
1. **Câmara dos Deputados (API Oficial):** Extração sob demanda das notas fiscais e comprovantes em PDF.
2. **Receita Federal do Brasil (via BrasilAPI):** Situação cadastral do CNPJ, data de abertura, CNAEs, Capital Social, opção por MEI e Quadro de Sócios e Administradores (QSA).
3. **Tribunal Superior Eleitoral (TSE / DivulgaCandContas 2022):** Consulta do patrimônio oficial declarado na última eleição.

---

## 🚀 Como Executar Localmente

### 1. Backend (FastAPI + SQLite)
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
A API estará rodando em: `http://127.0.0.1:8000` (Documentação Swagger: `http://127.0.0.1:8000/docs`).

### 2. Frontend (React + Vite + Tailwind CSS + Recharts)
```bash
cd frontend
npm install
npm run dev
```
A aplicação estará disponível em: `http://localhost:5173/`.

---

## 🐳 Como Subir no GitHub

Execute no terminal dentro da pasta raiz do projeto:

```bash
# 1. Inicializar o repositório git
git init

# 2. Adicionar todos os arquivos (o .gitignore já exclui venv e node_modules)
git add .

# 3. Fazer o primeiro commit
git commit -m "feat: Vigilante Parlamentar com motor forense de 21 heurísticas e gráficos analíticos"

# 4. Criar o repositório no seu GitHub (via navegador em github.com/new)
# 5. Conectar o repositório remoto e subir:
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/vigilante-parlamentar.git
git push -u origin main
```

---

## 🌐 Como Fazer o Deploy no Servidor Privado da Hostinger (VPS)

No seu servidor VPS da Hostinger (Ubuntu / Debian), a forma mais rápida, segura e profissional é utilizar o **Docker Compose**.

### Opção A: Deploy com Docker Compose (Recomendado - 1 comando)

1. **Acesse seu servidor Hostinger via SSH:**
   ```bash
   ssh root@SEU_IP_HOSTINGER
   ```

2. **Instale o Docker e Docker Compose (se ainda não tiver):**
   ```bash
   curl -fsSL https://get.docker.com | sh
   apt update && apt install -y docker-compose-plugin
   ```

3. **Clone o repositório do seu GitHub:**
   ```bash
   git clone https://github.com/SEU_USUARIO/vigilante-parlamentar.git
   cd vigilante-parlamentar
   ```

4. **Inicie os contêineres:**
   ```bash
   docker compose up -d --build
   ```

Pronto! O Nginx interno servirá o Frontend na porta `80` e direcionará automaticamente todas as chamadas de `/api/` para o Backend FastAPI na porta `8000`.

---

### Opção B: Deploy Nativo (Systemd + Nginx)

Caso prefira rodar sem Docker:

1. **Backend (Python Systemd):**
   ```bash
   cd /var/www/vigilante-parlamentar/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
   Crie o serviço `/etc/systemd/system/vigilante-backend.service`:
   ```ini
   [Unit]
   Description=Vigilante Parlamentar API
   After=network.target

   [Service]
   User=root
   WorkingDirectory=/var/www/vigilante-parlamentar/backend
   ExecStart=/var/www/vigilante-parlamentar/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   Ative o serviço:
   ```bash
   systemctl daemon-reload
   systemctl enable --now vigilante-backend
   ```

2. **Frontend (Build estático):**
   ```bash
   cd /var/www/vigilante-parlamentar/frontend
   npm install
   VITE_API_URL="" npm run build
   cp -r dist/* /var/www/html/
   ```

3. **Configuração do Nginx (`/etc/nginx/sites-available/default`):**
   ```nginx
   server {
       listen 80;
       server_name seu-dominio.com.br;

       location / {
           root /var/www/html;
           try_files $uri $uri/ /index.html;
       }

       location /api/ {
           proxy_pass http://127.0.0.1:8000/api/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
   Reinicie o Nginx: `systemctl restart nginx`.

---

## 🔒 Certificado SSL Gratuito (HTTPS com Let's Encrypt)

Para deixar seu site seguro com cadeado verde (`https://`):
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d seu-dominio.com.br
```

---

## ⚖️ Aviso Legal
Os alertas e pontuações do **Vigilante Parlamentar** representam inconformidades estatísticas e inconsistências em bases de dados públicas oficiais, não constituindo juízo de valor ou condenação judicial. As evidências e notas fiscais da Câmara dos Deputados são disponibilizadas para livre auditoria popular.
