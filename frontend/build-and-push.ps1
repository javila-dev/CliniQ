# Build local de la imagen del frontend y push a Docker Hub.
# Siempre sube DOS tags: uno versionado (para rollback) y 'latest' (el que usa Dokploy).
# Uso:
#   .\build-and-push.ps1            -> tag :YYYYMMDD-HHmm  +  :latest
#   .\build-and-push.ps1 v3         -> tag :v3             +  :latest
#
# Requiere: docker login (una sola vez)

param(
    [string]$Tag = (Get-Date -Format "yyyyMMdd-HHmm"),
    # Por defecto se buildea SIN cache (+ --pull del base): evita imagenes
    # viejas por capas cacheadas o contexto stale. Pasa -Cache para reusar
    # capas en iteraciones rapidas.
    [switch]$Cache
)

$ErrorActionPreference = "Stop"
$Image = "jorgeavilag/cliniq"

# Asegura que corremos en la carpeta del script (frontend/)
Set-Location -Path $PSScriptRoot

Write-Host "Building $Image con tags :$Tag y :latest ..." -ForegroundColor Cyan

# Las NEXT_PUBLIC_* salen de frontend/.env.production (gitignoreado, en esta
# maquina). Aqui solo va lo server-side que Dokploy sobrescribe en runtime.
$CacheFlags = if ($Cache) { @() } else { @('--no-cache', '--pull') }
docker build -f Dockerfile.prod `
    @CacheFlags `
    --build-arg BACKEND_URL=http://backend:8000 `
    -t "$Image`:$Tag" -t "$Image`:latest" .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Pushing $Image`:$Tag ..." -ForegroundColor Cyan
docker push "$Image`:$Tag"
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "Pushing $Image`:latest ..." -ForegroundColor Cyan
docker push "$Image`:latest"
if ($LASTEXITCODE -ne 0) { throw "docker push latest failed" }

Write-Host "`nListo. Imagenes subidas:" -ForegroundColor Green
Write-Host "  $Image`:$Tag   (respaldo / rollback)" -ForegroundColor Green
Write-Host "  $Image`:latest (el que usa Dokploy)" -ForegroundColor Green

# Deploy opcional: dispara el webhook de Dokploy para traer la imagen nueva.
$DeployHook = "https://dokploy.2asoft.tech/api/deploy/compose/viH0zT3ehn_xXnZWUFMM3"
$answer = Read-Host "`nDesplegar ahora en Dokploy? (s/N)"
if ($answer -match '^(s|si|sí|y|yes)$') {
    Write-Host "Disparando deploy en Dokploy ..." -ForegroundColor Cyan
    try {
        Invoke-RestMethod -Uri $DeployHook -Method Get -TimeoutSec 30 | Out-Null
        Write-Host "Deploy disparado. Revisa el progreso en Dokploy." -ForegroundColor Green
    } catch {
        Write-Host "No se pudo disparar el deploy: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`nDeploy omitido. En Dokploy haz Redeploy cuando quieras traer la imagen nueva." -ForegroundColor Yellow
}
