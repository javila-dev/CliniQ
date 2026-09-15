# Build local de la imagen del frontend y push a Docker Hub.
# Siempre sube DOS tags: uno versionado (para rollback) y 'latest' (el que usa Dokploy).
# Uso:
#   .\build-and-push.ps1                  -> tag :YYYYMMDD-HHmm + :latest, buildea tu frontend/ actual
#                                             (exige que este limpio y ya pusheado)
#   .\build-and-push.ps1 v3               -> mismo modo, tag :v3
#   .\build-and-push.ps1 -Commit ed225ed  -> buildea ESE commit puntual (ya pusheado a origin),
#                                             en un worktree temporal aparte. No toca tu working
#                                             dir actual aunque tengas cambios sin commitear sueltos.
#
# Requiere: docker login (una sola vez)

param(
    [string]$Tag = (Get-Date -Format "yyyyMMdd-HHmm"),
    # Por defecto se buildea SIN cache (+ --pull del base): evita imagenes
    # viejas por capas cacheadas o contexto stale. Pasa -Cache para reusar
    # capas en iteraciones rapidas.
    [switch]$Cache,
    # Commit/tag/branch ya pusheado a buildear de forma aislada (ver uso arriba).
    [string]$Commit
)

$ErrorActionPreference = "Stop"
$Image = "jorgeavilag/cliniq"
$CacheFlags = if ($Cache) { @() } else { @('--no-cache', '--pull') }
$DeployHook = "https://dokploy.2asoft.tech/api/deploy/compose/viH0zT3ehn_xXnZWUFMM3"

# Compila y sube la imagen desde $BuildContext/$DockerfileName. $ExtraTags se
# suman a :$Tag y :latest (p.ej. el SHA corto cuando se buildea -Commit).
function Invoke-BuildAndPush {
    param(
        [Parameter(Mandatory)][string]$BuildContext,
        [Parameter(Mandatory)][string]$DockerfileName,
        [string[]]$ExtraTags = @()
    )

    $allTags = @($Tag, 'latest') + $ExtraTags
    $tagArgs = @()
    foreach ($t in $allTags) { $tagArgs += @('-t', "$Image`:$t") }

    docker build -f $DockerfileName @CacheFlags `
        --build-arg BACKEND_URL=http://backend:8000 `
        @tagArgs $BuildContext
    if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

    foreach ($t in $allTags) {
        Write-Host "Pushing $Image`:$t ..." -ForegroundColor Cyan
        docker push "$Image`:$t"
        if ($LASTEXITCODE -ne 0) { throw "docker push $t failed" }
    }

    Write-Host "`nListo. Imagenes subidas:" -ForegroundColor Green
    foreach ($t in $allTags) { Write-Host "  $Image`:$t" -ForegroundColor Green }
}

Set-Location -Path $PSScriptRoot

if ($Commit) {
    # ── Modo worktree: buildea un commit puntual ya pusheado, sin tocar el
    # working dir actual. Seguro aunque tengas cambios sueltos sin commitear.
    # Nota: no redirigir stderr de git (2>$null / 2>&1) -- con
    # $ErrorActionPreference=Stop, PowerShell 5.1 convierte cada linea
    # redirigida en un error terminante aunque el comando haya salido 0.
    # Se chequea $LASTEXITCODE en su lugar y se deja que git imprima su
    # propio mensaje si falla.
    $sha = git rev-parse $Commit
    if ($LASTEXITCODE -ne 0 -or -not $sha) {
        throw "No se pudo resolver '$Commit' como commit valido."
    }
    $shaCorto = $sha.Substring(0, 7)

    # Debe existir en alguna rama remota (no basta con que exista localmente).
    $remoteRefs = git branch -r --contains $sha
    if ($LASTEXITCODE -ne 0 -or -not $remoteRefs) {
        throw "El commit $shaCorto no aparece en ninguna rama remota (push antes de buildearlo)."
    }

    $envProdSource = Join-Path $PSScriptRoot ".env.production"
    if (-not (Test-Path $envProdSource)) {
        throw "No existe $envProdSource -- se necesita para las vars NEXT_PUBLIC_* del build."
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "cliniq-build-$shaCorto"
    git worktree prune
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }

    Write-Host "Creando worktree temporal en $tempDir para el commit $shaCorto (tu frontend/ actual no se toca) ..." -ForegroundColor Cyan
    git worktree add --detach $tempDir $sha
    if ($LASTEXITCODE -ne 0) { throw "git worktree add fallo." }

    try {
        $worktreeFrontend = Join-Path $tempDir "frontend"
        if (-not (Test-Path $worktreeFrontend)) {
            throw "El commit $shaCorto no tiene carpeta frontend/ -- nada que buildear."
        }
        Copy-Item -Path $envProdSource -Destination (Join-Path $worktreeFrontend ".env.production") -Force

        Write-Host "Building $Image con tags :$Tag, :latest y :$shaCorto (commit $shaCorto, worktree aislado) ..." -ForegroundColor Cyan
        Invoke-BuildAndPush -BuildContext $worktreeFrontend -DockerfileName (Join-Path $worktreeFrontend "Dockerfile.prod") -ExtraTags @($shaCorto)
    } finally {
        # Limpieza best-effort: no debe abortar el script si algo aqui falla.
        Write-Host "Limpiando worktree temporal ..." -ForegroundColor DarkGray
        Set-Location -Path $PSScriptRoot
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        git worktree remove --force $tempDir
        $ErrorActionPreference = $prevEap
        if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
    }
} else {
    # ── Modo default: buildea tu frontend/ tal cual esta en disco, solo si
    # esta limpio y HEAD ya esta pusheado (Dockerfile.prod hace `COPY . .`,
    # o sea el contexto es el working dir crudo).
    $dirty = git status --porcelain .
    if ($dirty) {
        Write-Host "Hay cambios sin commitear en frontend/. Commitea/descarta antes de buildear, o usa -Commit <sha> para buildear un commit puntual sin tocar tu working dir:" -ForegroundColor Red
        Write-Host $dirty
        exit 1
    }

    $branch = git rev-parse --abbrev-ref HEAD
    $localHead = git rev-parse HEAD
    $upstream = git rev-parse '@{u}' 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $upstream) {
        Write-Host "La rama '$branch' no tiene upstream configurado; no se puede verificar que este pusheada." -ForegroundColor Red
        exit 1
    }
    if ($localHead -ne $upstream) {
        Write-Host "HEAD local ($($localHead.Substring(0,7))) no coincide con '$branch' en el remoto ($($upstream.Substring(0,7))). Haz push antes de buildear." -ForegroundColor Red
        exit 1
    }

    Write-Host "Building $Image con tags :$Tag y :latest (commit $($localHead.Substring(0,7)) de '$branch') ..." -ForegroundColor Cyan
    Invoke-BuildAndPush -BuildContext $PSScriptRoot -DockerfileName "Dockerfile.prod"
}

# Deploy opcional: dispara el webhook de Dokploy para traer la imagen nueva.
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
