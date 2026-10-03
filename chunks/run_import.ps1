param(
    [string]$StartFrom = "part01_chunk02.sql"
)

if (-not $env:DATABASE_URL) {
    Write-Host "ERROR: define la variable DATABASE_URL antes de correr este script."
    Write-Host '  $env:DATABASE_URL = "postgresql://...tu connection string de Neon..."'
    exit 1
}

$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCmd) {
    Write-Host "ERROR: no encontre 'psql' en el PATH de esta sesion."
    exit 1
}

$allChunks = Get-ChildItem -Filter "part*_chunk*.sql" | Sort-Object Name

if ($allChunks.Count -eq 0) {
    Write-Host "ERROR: no encontre archivos part*_chunk*.sql en este directorio."
    Write-Host "Corre este script desde la carpeta donde estan los chunks."
    exit 1
}

Write-Host "Encontre $($allChunks.Count) archivos de chunk."
Write-Host "Empezando desde: $StartFrom"
Write-Host ""

$started = $false
$countOk = 0

foreach ($f in $allChunks) {
    if ($f.Name -eq $StartFrom) { $started = $true }
    if (-not $started) { continue }

    Write-Host "-> Ejecutando $($f.Name) ..."
    & psql -v ON_ERROR_STOP=1 -q -f $f.FullName $env:DATABASE_URL
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   OK ($($f.Name))"
        $countOk++
    } else {
        Write-Host ""
        Write-Host "============================================================"
        Write-Host "FALLO: $($f.Name)"
        Write-Host "Cada chunk corre en su propia transaccion BEGIN/COMMIT, asi que"
        Write-Host "nada de este archivo quedo guardado a medias. No lo reintentes"
        Write-Host "solo -- avisame cual archivo fue y seguimos desde ahi."
        Write-Host "============================================================"
        exit 1
    }
}

Write-Host ""
Write-Host "Listo. $countOk chunks importados sin error en esta corrida."