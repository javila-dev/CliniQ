# Build local de la imagen del frontend y push a Docker Hub.
# Siempre sube DOS tags: uno versionado (para rollback) y 'latest' (el que usa Dokploy).
# Uso:
#   .\build-and-push.ps1            -> tag :YYYYMMDD-HHmm  +  :latest
#   .\build-and-push.ps1 v3         -> tag :v3             +  :latest
#
# Requiere: docker login (una sola vez)

param(
    [string]$Tag = (Get-Date -Format "yyyyMMdd-HHmm")
)

$ErrorActionPreference = "Stop"
$Image = "jorgeavilag/cliniq"

# Asegura que corremos en la carpeta del script (frontend/)
Set-Location -Path $PSScriptRoot

Write-Host "Building $Image con tags :$Tag y :latest ..." -ForegroundColor Cyan

docker build -f Dockerfile.prod `
    --build-arg NEXT_PUBLIC_API_URL=/proxy/v1 `
    --build-arg BACKEND_URL=http://backend:8000 `
    --build-arg NEXT_PUBLIC_BACKEND_ORIGIN=http://backend:8000 `
    --build-arg NEXT_PUBLIC_DOCUMENSO_URL=https://documenso.2asoft.tech `
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
Write-Host "`nEn Dokploy haz Redeploy para traer la imagen nueva." -ForegroundColor Yellow
