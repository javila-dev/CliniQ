# Build local de la imagen del frontend y push a Docker Hub.
# Uso:
#   .\build-and-push.ps1            -> tag :latest
#   .\build-and-push.ps1 v3         -> tag :v3 y :latest
#
# Requiere: docker login (una sola vez)

param(
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$Image = "jorgeavilag/cliniq"

# Asegura que corremos en la carpeta del script (frontend/)
Set-Location -Path $PSScriptRoot

Write-Host "Building $Image`:$Tag ..." -ForegroundColor Cyan

docker build -f Dockerfile.prod `
    --build-arg NEXT_PUBLIC_API_URL=/proxy/v1 `
    --build-arg BACKEND_URL=http://backend:8000 `
    --build-arg NEXT_PUBLIC_BACKEND_ORIGIN=http://backend:8000 `
    --build-arg NEXT_PUBLIC_DOCUMENSO_URL=https://documenso.2asoft.tech `
    -t "$Image`:$Tag" .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

# Si el tag no es 'latest', tambien actualiza 'latest'
if ($Tag -ne "latest") {
    docker tag "$Image`:$Tag" "$Image`:latest"
}

Write-Host "Pushing $Image`:$Tag ..." -ForegroundColor Cyan
docker push "$Image`:$Tag"
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

if ($Tag -ne "latest") {
    docker push "$Image`:latest"
    if ($LASTEXITCODE -ne 0) { throw "docker push latest failed" }
}

Write-Host "`nListo. Imagen subida: $Image`:$Tag" -ForegroundColor Green
Write-Host "En Dokploy haz Redeploy (o force pull) para traer la imagen nueva." -ForegroundColor Yellow
