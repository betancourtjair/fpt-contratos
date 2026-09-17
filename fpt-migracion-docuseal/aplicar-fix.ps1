<#
  aplicar-fix.ps1

  Reemplaza POR COMPLETO la integracion de firma electronica: se quita doc2sign (PSC World,
  de paga, NOM-151) y se pone en su lugar DocuSeal (open-source, auto-hospedado, sin costo de
  licencia). Esto es un cambio grande: toca 14 archivos (backend y frontend), borra 2 archivos
  que ya no se usan, y agrega una migracion nueva a la base de datos.

  IMPORTANTE - esto es SOLO el codigo. Para que funcione en Render todavia falta, por fuera de
  este script:
    1) Levantar tu propia instancia de DocuSeal (Docker, auto-hospedada) en algun lado
       (se puede en el mismo Render, un servicio nuevo tipo "Web Service" con Docker).
    2) Sacar de ahi tu DOCUSEAL_API_TOKEN (dentro de DocuSeal: Configuracion de la cuenta > API).
    3) Poner en el backend de Render (Environment) las variables DOCUSEAL_URL y
       DOCUSEAL_API_TOKEN (y opcionalmente DOCUSEAL_WEBHOOK_SECRET) - y PUEDES BORRAR las
       variables DOC2SIGN_* que ya no se usan.
    4) Correr la migracion nueva contra tu base de datos:
         psql "$DATABASE_URL" -f backend/prisma/migration.sql
       (es normal que salgan errores en las lineas viejas que ya existian; lo que importa es
       que las lineas NUEVAS de docuseal_* al final corran sin error).
    5) Como tambien cambiaron 2 archivos del FRONTEND, hay que volver a compilarlo y
       republicarlo (npm run build / el proceso de gh-pages que ya usas), no solo hacer push.
    6) Dentro de tu instancia de DocuSeal: Consola > Webhooks > dar de alta la URL
         https://<tu-backend-en-render>/api/webhooks/docuseal
       y, si quieres el nivel extra de seguridad, la pestana "HMAC" para sacar el secreto y
       ponerlo como DOCUSEAL_WEBHOOK_SECRET en Render.

  Este script SOLO hace el paso de codigo: copia los archivos, borra los que ya no se usan,
  y hace commit (con push opcional). Los pasos 1-3 y 6 (la instancia de DocuSeal en si) se
  hacen aparte, cuando quieras armar esa parte.

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

# Archivos NUEVOS o MODIFICADOS: ruta relativa dentro del repo -> ruta relativa dentro de este paquete.
$archivos = @(
  "backend/.env.example",
  "backend/prisma/migration.sql",
  "backend/prisma/schema.prisma",
  "backend/src/docusealClient.js",
  "backend/src/jobs/scheduler.js",
  "backend/src/routes/contratos.js",
  "backend/src/routes/docusealWebhook.js",
  "backend/src/routes/jobs.js",
  "backend/src/server.js",
  "backend/src/sharepointStorage.js",
  "backend/src/storage.js",
  "backend/src/storageContratos.js",
  "backend/src/utils/firmaElectronica.js",
  "frontend/src/components/DocumentosContrato.jsx",
  "frontend/src/components/EnviarAFirmarModal.jsx"
)

# Archivos que YA NO SE USAN (la integracion de doc2sign se quita por completo) y hay que borrar.
$archivosABorrar = @(
  "backend/src/doc2signClient.js",
  "backend/src/routes/doc2signWebhook.js"
)

Write-Host "`nCopiando archivos nuevos/modificados..." -ForegroundColor Cyan
foreach ($rel in $archivos) {
  $origen = Join-Path $ScriptDir $rel
  $destino = Join-Path $RepoPath $rel

  if (-not (Test-Path $origen)) {
    Write-Host "ERROR: no se encontro $origen en el paquete." -ForegroundColor Red
    exit 1
  }

  $destinoDir = Split-Path $destino -Parent
  if (-not (Test-Path $destinoDir)) {
    New-Item -ItemType Directory -Path $destinoDir -Force | Out-Null
  }

  Copy-Item -Force $origen $destino
  Write-Host "OK  $rel" -ForegroundColor Green
}

Write-Host "`nBorrando archivos que ya no se usan (doc2sign)..." -ForegroundColor Cyan
foreach ($rel in $archivosABorrar) {
  $destino = Join-Path $RepoPath $rel
  if (Test-Path $destino) {
    Remove-Item -Force $destino
    Write-Host "Borrado  $rel" -ForegroundColor Yellow
  } else {
    Write-Host "(ya no existia)  $rel" -ForegroundColor DarkGray
  }
}

Push-Location $RepoPath
try {
  Write-Host "`ngit add..." -ForegroundColor Cyan
  git add -- $archivos
  # git add -A solo para las rutas borradas (git add no detecta borrados con la sintaxis de arriba
  # en todas las versiones de git, asi que se marcan explicito con git rm si siguen rastreadas).
  foreach ($rel in $archivosABorrar) {
    git rm --cached --ignore-unmatch --quiet -- $rel 2>$null
  }

  $hayCambios = git diff --cached --name-only
  if (-not $hayCambios) {
    Write-Host "No hay cambios nuevos que commitear (los archivos ya estaban al dia)." -ForegroundColor Yellow
  } else {
    Write-Host "`nArchivos en este commit:" -ForegroundColor Cyan
    git diff --cached --name-status

    Write-Host "`ngit commit..." -ForegroundColor Cyan
    git commit -m "Reemplazar doc2sign por DocuSeal (self-hosted) para firma electronica"

    Write-Host "`nCommit local listo." -ForegroundColor Green
    git show --stat HEAD

    $resp = Read-Host "`nHacer 'git push' ahora? (s/n)"
    if ($resp -eq "s" -or $resp -eq "S") {
      git push
      Write-Host "Listo, se subio a tu remoto." -ForegroundColor Green
      Write-Host "`nIMPORTANTE - todavia faltan pasos FUERA de este script (ver el encabezado" -ForegroundColor Yellow
      Write-Host "de este mismo archivo aplicar-fix.ps1 para el detalle):" -ForegroundColor Yellow
      Write-Host "  1) Levantar la instancia de DocuSeal (self-hosted) si todavia no existe." -ForegroundColor Yellow
      Write-Host "  2) Variables de entorno DOCUSEAL_URL / DOCUSEAL_API_TOKEN en Render (backend)." -ForegroundColor Yellow
      Write-Host "  3) Correr backend/prisma/migration.sql contra tu base de datos (psql)." -ForegroundColor Yellow
      Write-Host "  4) Volver a compilar y publicar el FRONTEND (tambien cambio, no solo el backend)." -ForegroundColor Yellow
      Write-Host "  5) Configurar el webhook dentro de DocuSeal apuntando a /api/webhooks/docuseal." -ForegroundColor Yellow
    } else {
      Write-Host "No se hizo push. Cuando quieras, corre 'git push' manualmente desde '$RepoPath'." -ForegroundColor Yellow
    }
  }
}
finally {
  Pop-Location
}
