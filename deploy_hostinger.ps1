<#
.SYNOPSIS
    Script automatizado de Deploy e Provisionamento na Hostinger KVM via PowerShell
.DESCRIPTION
    Conecta via SSH à VPS Hostinger, instala Docker, clona o repositório e inicia a aplicação.
.PARAMETER ServerIP
    O endereço de IP da sua VPS Hostinger.
.PARAMETER User
    Usuário SSH (padrão: root).
.EXAMPLE
    .\deploy_hostinger.ps1 -ServerIP "195.35.xx.xx"
#>

param (
    [Parameter(Mandatory=$true, HelpMessage="Digite o IP da VPS Hostinger")]
    [string]$ServerIP,
    [string]$User = "root"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Iniciando Deploy do Vigilante Parlamentar na Hostinger  " -ForegroundColor Cyan
Write-Host "  Servidor: $User@$ServerIP" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$remoteScript = @'
set -e
echo "==> 1. Atualizando repositórios e instalando utilitários..."
apt-get update -qq
apt-get install -y -qq git curl ufw

echo "==> 2. Verificando e instalando Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

echo "==> 3. Configurando Firewall (UFW)..."
ufw allow OpenSSH > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null

echo "==> 4. Baixando/Atualizando o Vigilante Parlamentar..."
mkdir -p /opt
if [ -d "/opt/vigilante-parlamentar" ]; then
    cd /opt/vigilante-parlamentar
    git pull origin main
else
    cd /opt
    git clone https://github.com/vrito4020/vigilante-parlamentar.git
    cd vigilante-parlamentar
fi

echo "==> 5. Construindo imagens e subindo containers..."
docker compose up -d --build

echo "==> 6. Status dos Containers:"
docker compose ps
'@

# Executa o comando via OpenSSH
ssh -o StrictHostKeyChecking=no "$User@$ServerIP" $remoteScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "  Deploy realizado com sucesso na sua VPS Hostinger!     " -ForegroundColor Green
    Write-Host "  Acesse no navegador: http://$ServerIP/                  " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "`nOcorreu um erro ao executar os comandos na VPS." -ForegroundColor Red
}
