<#
  aplicar-fix.ps1

  Corrige un quinto bug de la integracion con doc2sign: el tipo de
  documento "_Documento General" configurado en la cuenta de doc2sign es
  de tipo "Firmas por Definir", lo cual OBLIGA a mandar
  "ubicacionFirmaPersonalizada": true junto con coordenadas reales
  (PosX/PosY/Pagina) para cada firmante -- no se puede dejar que doc2sign
  las calcule solo (-1/-1/-1). El codigo mandaba "false" con -1/-1/-1 y
  doc2sign lo rechazaba con:

      Error: doc2sign (test) respondio 400 en CargaDocumento2:
      {"error_code":"00","error":"server_error",
       "error_description":"...029:La configuracion para este tipo de
       documento es 'Firmas por Definir' debe de enviar la propiedad
       'ubicacionFirmaPersonalizada' en 'true'"}

  Como esta app todavia no tiene un editor visual para que el usuario
  marque el lugar exacto de la firma en el PDF, este arreglo usa una
  posicion por defecto (esquina inferior izquierda de la pagina 1), con
  cada firma adicional un poco mas arriba para que no se encimen. Se
  puede ajustar mas adelante si se agrega esa funcionalidad.

  USO (desde PowerShell, parado en la carpeta donde descomprimiste el zip):

      .\aplicar-fix.ps1 -RepoPath "C:\ruta\a\tu\fpt-contratos"

  Si no pasas -RepoPath, asume que la carpeta actual YA es la raiz del repo.
#>

param(
  [string]$RepoPath = "."
)

$ErrorActionPreference = "Stop"

$RepoPath = (Resolve-Path $RepoPath).Path
$ScriptDir = $PSScriptRoot

Write-Host "Repo destino: $RepoPath" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
  Write-Host "ERROR: '$RepoPath' no parece ser la raiz de tu repo git (no tiene carpeta .git)." -ForegroundColor Red
  exit 1
}

$rel = "backend/src/doc2signClient.js"
$origen = Join-Path $ScriptDir "doc2signClient.js"
$destino = Join-Path $RepoPath $rel

if (-not (Test-Path $origen)) {
  Write-Host "ERROR: no se encontro $origen en el paquete." -ForegroundColor Red
  exit 1
}

$origenResuelto = (Resolve-Path $origen).Path
$destinoResuelto = if (Test-Path $destino) { (Resolve-Path $destino).Path } else { $null }

if ($origenResuelto -eq $destinoResuelto) {
  Write-Host "(ya esta en su lugar) $rel" -ForegroundColor Yellow
} else {
  Copy-Item -Force $origen $destino
  Write-Host "OK  $rel" -ForegroundColor Green
}

Push-Location $RepoPath
try {
  Write-Host "`ngit add..." -ForegroundColor Cyan
  git add -- $rel

  $hayCambios = git diff --cached --name-only
  if (-not $hayCambios) {
    Write-Host "No hay cambios nuevos que commitear (el archivo ya estaba al dia)." -ForegroundColor Yellow
  } else {
    Write-Host "`ngit commit..." -ForegroundColor Cyan
    git commit -m "Corregir bug: el tipo de documento requiere ubicacionFirmaPersonalizada=true con coordenadas"

    Write-Host "`nCommit local listo." -ForegroundColor Green
    git show --stat HEAD

    $resp = Read-Host "`nHacer 'git push' ahora? (s/n)"
    if ($resp -eq "s" -or $resp -eq "S") {
      git push
      Write-Host "Listo, se subio a tu remoto." -ForegroundColor Green
      Write-Host "IMPORTANTE: este cambio es solo del BACKEND (Render). Render redeploya solo" -ForegroundColor Yellow
      Write-Host "en unos minutos al detectar el push (revisa la pestana de logs en Render)." -ForegroundColor Yellow
      Write-Host "No hace falta volver a correr 'npm run build' / 'gh-pages' (eso es del frontend)." -ForegroundColor Yellow
    } else {
      Write-Host "No se hizo push. Cuando quieras, corre 'git push' manualmente desde '$RepoPath'." -ForegroundColor Yellow
    }
  }
}
finally {
  Pop-Location
}
