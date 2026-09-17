<#
  otorgar-acceso-sitio.ps1

  Da de alta el acceso de la app "FPT Contratos - Correo" (permiso
  Sites.Selected que ya le agregaste en Azure AD) al sitio de SharePoint
  "GestorContratoslegal" — y SOLO a ese sitio, con rol de escritura.

  Requiere el modulo de PowerShell "Microsoft.Graph" (se instala solo si no
  lo tienes). Te va a pedir iniciar sesion con TU cuenta de administrador
  en una ventana normal del navegador de tu computadora.

  USO: abre PowerShell y corre:
      .\otorgar-acceso-sitio.ps1
#>

$ErrorActionPreference = "Stop"

$AppId       = "e7f02c9e-d640-46b3-99d2-3efc68448373"   # FPT Contratos - Correo
$AppNombre   = "FPT Contratos - Correo"
$Hostname    = "fitnessparatodoss.sharepoint.com"
$SitePath    = "/sites/GestorContratoslegal"

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Sites)) {
  Write-Host "Instalando el modulo Microsoft.Graph (una sola vez)..." -ForegroundColor Cyan
  Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

Write-Host "`nSe va a abrir tu navegador para iniciar sesion. Usa tu cuenta de administrador de SharePoint." -ForegroundColor Cyan
Connect-MgGraph -Scopes "Sites.FullControl.All" -NoWelcome

Write-Host "`nBuscando el sitio $Hostname$SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${Hostname}:${SitePath}"
$siteId = $site.id
Write-Host "Sitio encontrado: $($site.displayName)  (id: $siteId)" -ForegroundColor Green

$body = @{
  roles = @("write")
  grantedToIdentities = @(
    @{
      application = @{
        id          = $AppId
        displayName = $AppNombre
      }
    }
  )
} | ConvertTo-Json -Depth 5

Write-Host "`nOtorgando acceso de escritura a '$AppNombre' sobre este sitio unicamente..." -ForegroundColor Cyan
$resultado = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions" -Body $body -ContentType "application/json"

Write-Host "`nListo. Permiso creado:" -ForegroundColor Green
$resultado | ConvertTo-Json -Depth 5

Write-Host "`nCon esto la app ya puede leer/escribir SOLO en el sitio GestorContratoslegal." -ForegroundColor Cyan
Write-Host "Siguiente paso: configurar en Render las 3 variables de entorno (SHAREPOINT_SITE_HOSTNAME, SHAREPOINT_SITE_PATH, CONTRATOS_STORAGE_DRIVER)." -ForegroundColor Cyan