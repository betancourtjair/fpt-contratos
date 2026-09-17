<#
  crear-columnas-sharepoint.ps1  (v2 - corrige el nombre de "Titulo del contrato")

  Crea (o corrige, si ya existen con un nombre mal codificado) 4 columnas en la biblioteca
  de documentos del sitio "GestorContratoslegal":

    - Folio
    - TituloContrato   -> se muestra como "Titulo del contrato"
    - Contraparte
    - EstatusContrato  -> se muestra como "Estatus"

  Si una columna ya existe con el nombre visible correcto, se omite. Si ya existe pero con
  el nombre visible incorrecto (por ejemplo "TÃ­tulo del contrato"), se corrige con un PATCH
  sin tocar nada más de la columna.

  Requiere el módulo de PowerShell "Microsoft.Graph" (se instala solo si no lo tienes). Te
  va a pedir iniciar sesion con TU cuenta de administrador en una ventana normal del
  navegador de tu computadora.

  USO: abre PowerShell y corre:
      .\crear-columnas-sharepoint.ps1
#>

$ErrorActionPreference = "Stop"

$Hostname = "fitnessparatodoss.sharepoint.com"
$SitePath = "/sites/GestorContratoslegal"

# Nombres visibles sin acentos a proposito, para no depender de la codificacion de consola.
$Columnas = @(
  @{ name = "Folio";           displayName = "Folio" },
  @{ name = "TituloContrato";  displayName = "Titulo del contrato" },
  @{ name = "Contraparte";     displayName = "Contraparte" },
  @{ name = "EstatusContrato"; displayName = "Estatus" }
)

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Sites)) {
  Write-Host "Instalando el modulo Microsoft.Graph (una sola vez)..." -ForegroundColor Cyan
  Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

Write-Host "`nSe va a abrir tu navegador para iniciar sesion. Usa tu cuenta de administrador de SharePoint." -ForegroundColor Cyan
Connect-MgGraph -Scopes "Sites.Manage.All" -NoWelcome

Write-Host "`nBuscando el sitio $Hostname$SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${Hostname}:${SitePath}"
$siteId = $site.id
Write-Host "Sitio encontrado: $($site.displayName)  (id: $siteId)" -ForegroundColor Green

Write-Host "`nBuscando la biblioteca de documentos del sitio..." -ForegroundColor Cyan
$drive = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/drive`?`$expand=list"
$listId = $drive.list.id
Write-Host "Biblioteca encontrada: $($drive.name)  (list id: $listId)" -ForegroundColor Green

Write-Host "`nRevisando columnas existentes..." -ForegroundColor Cyan
$existentes = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/columns"

foreach ($col in $Columnas) {
  $existente = $existentes.value | Where-Object { $_.name -eq $col.name } | Select-Object -First 1

  if ($existente) {
    if ($existente.displayName -ne $col.displayName) {
      Write-Host "  Corrigiendo nombre visible de $($col.name): '$($existente.displayName)' -> '$($col.displayName)'..." -ForegroundColor Cyan
      $bodyFix = @{ displayName = $col.displayName } | ConvertTo-Json
      Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/columns/$($existente.id)" -Body $bodyFix -ContentType "application/json" | Out-Null
      Write-Host "  OK, corregido." -ForegroundColor Green
    } else {
      Write-Host "  Ya existe y esta bien: $($col.displayName) ($($col.name)) - se omite." -ForegroundColor Yellow
    }
    continue
  }

  $body = @{
    name        = $col.name
    displayName = $col.displayName
    text        = @{}
  } | ConvertTo-Json

  Write-Host "  Creando columna: $($col.displayName) ($($col.name))..." -ForegroundColor Cyan
  Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/columns" -Body $body -ContentType "application/json" | Out-Null
  Write-Host "  OK." -ForegroundColor Green
}

Write-Host "`nListo. La biblioteca 'GestorContratoslegal' ya tiene las columnas Folio / Titulo del contrato / Contraparte / Estatus." -ForegroundColor Green
Write-Host "Cada archivo NUEVO que suba la app (o cambie de estatus) va a llenarlas solo." -ForegroundColor Cyan
Write-Host "Los archivos que ya estaban subidos antes de este cambio se quedan con esas columnas vacias (no se puede llenar retroactivamente sin volver a subirlos)." -ForegroundColor Yellow