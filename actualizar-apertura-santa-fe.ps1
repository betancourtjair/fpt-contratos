# Ajusta el contrato de franquicia de Centro Santa Fe, CDMX (PF Club #4912) ahora que ya
# se sabe la fecha real de apertura al publico: 11-sep-2026.
#
# Ajusta:
#   - fechaFin del contrato: 10 anos despues de la Fecha de Inicio de Operaciones (Articulo 3.1
#     de la Franchise Agreement dice que el Termino vence en el 10o aniversario de la Business
#     Commencement Date, no de la fecha de firma) -> 11-sep-2036.
#   - fechaProximoPagoRegalias: primer corte mensual de regalias, un mes despues de abrir ->
#     11-oct-2026 (periodicidadPagoRegalias ya quedo en "mensual").
#   - fechaLimiteApertura: se limpia (null), porque ya se cumplio - el club abrio antes del
#     limite del Articulo 4.9 y ese aviso ya no aplica.
#
# Este script NO crea el contrato: debe existir ya (corrido primero
# crear-franquicia-santa-fe.ps1). Si no lo encuentra, te avisa y no hace nada.
#
# Solo texto ASCII en todo el script, por la misma razon que el script anterior.

$ErrorActionPreference = "Stop"

$ApiUrl = "https://fpt-contratos-backend.onrender.com/api"

$Email = Read-Host "Correo (Enter para usar jair@fpt.com.mx)"
if ([string]::IsNullOrWhiteSpace($Email)) { $Email = "jair@fpt.com.mx" }
$SecurePassword = Read-Host "Password" -AsSecureString
$Bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
$Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($Bstr)

Write-Host "Iniciando sesion..."
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$loginBytes = [System.Text.Encoding]::UTF8.GetBytes($loginBody)
$loginResp = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method Post -Body $loginBytes -ContentType "application/json; charset=utf-8"
$Token = $loginResp.token
$Headers = @{ Authorization = "Bearer $Token" }
Write-Host ("Sesion iniciada como " + $loginResp.usuario.email)

Write-Host "Buscando el club Centro Santa Fe..."
$clubesResp = Invoke-RestMethod -Uri "$ApiUrl/clubes?activo=true" -Headers $Headers -Method Get
$club = $clubesResp.clubes | Where-Object { $_.nombre -match "Santa Fe" } | Select-Object -First 1
if (-not $club) {
  Write-Error "No encontre un club con 'Santa Fe' en el nombre."
  exit 1
}

Write-Host "Buscando el contrato de franquicia de ese club..."
$franquiciasResp = Invoke-RestMethod -Uri ("$ApiUrl/franquicias?clubId=" + $club.id) -Headers $Headers -Method Get
$contrato = $franquiciasResp.contratos | Select-Object -First 1
if (-not $contrato) {
  Write-Error "No encontre todavia un contrato de franquicia para Centro Santa Fe. Corre primero crear-franquicia-santa-fe.ps1."
  exit 1
}
$contratoId = $contrato.id
Write-Host ("Contrato encontrado: folio " + $contrato.folio + " (id " + $contratoId + ")")

Write-Host "Actualizando fechaFin (vigencia del contrato)..."
$metaBody = @{ fechaFin = "2036-09-11" } | ConvertTo-Json
$metaBytes = [System.Text.Encoding]::UTF8.GetBytes($metaBody)
Invoke-RestMethod -Uri "$ApiUrl/contratos/$contratoId" -Method Patch -Headers $Headers -Body $metaBytes -ContentType "application/json; charset=utf-8" | Out-Null
Write-Host "fechaFin actualizada a 2036-09-11."

Write-Host "Actualizando datos de franquicia (proximo pago de regalias, limite de apertura)..."
$franquiciaBody = @{
  fechaProximoPagoRegalias = "2026-10-11"
  fechaLimiteApertura      = $null
} | ConvertTo-Json
$franquiciaBytes = [System.Text.Encoding]::UTF8.GetBytes($franquiciaBody)
Invoke-RestMethod -Uri "$ApiUrl/contratos/$contratoId/franquicia" -Method Put -Headers $Headers -Body $franquiciaBytes -ContentType "application/json; charset=utf-8" | Out-Null
Write-Host "Datos de franquicia actualizados."

Write-Host ""
Write-Host "Listo. Resumen:"
Write-Host "  Fecha de inicio de operaciones (segun lo que me confirmaste): 2026-09-11"
Write-Host "  Fecha de fin del contrato (10 anos despues): 2036-09-11"
Write-Host "  Proximo pago de regalias (primer corte mensual): 2026-10-11"
Write-Host "Revisa el contrato en https://contratos.fpt.com.mx/contratos/$contratoId"