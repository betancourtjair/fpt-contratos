# registrar-club-santa-fe.ps1
#
# Marca el contrato de franquicia CT-2026-0005 (Centro Santa Fe, CDMX) como club registrado
# (estatus "activo") usando el nuevo endpoint POST /contratos/:id/registrar-club-franquicia.
# Este contrato se creo ANTES del cambio que hace que las franquicias nazcan ya "activo", por
# eso se quedo en "borrador" y hay que empujarlo manualmente esta unica vez.
#
# IMPORTANTE: corre esto DESPUES de que el script aplicar-cambios-franquicias-roles.ps1 ya haya
# hecho push y Render haya terminado de redesplegar el backend (si no, el endpoint nuevo no
# existe todavia y esto te va a dar un error 404).

$ErrorActionPreference = "Stop"

$apiBase = "https://fpt-contratos-backend.onrender.com/api"

$credenciales = Get-Credential -Message "Inicia sesion en Contratos FPT (usuario: tu correo)"
$email = $credenciales.UserName
$password = $credenciales.GetNetworkCredential().Password

Write-Host "Iniciando sesion..."
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
$headers = @{ Authorization = "Bearer $token" }

$folio = "CT-2026-0005"
Write-Host "Buscando el contrato $folio en Franquicias..."
$busqueda = Invoke-RestMethod -Uri "$apiBase/franquicias?texto=$folio" -Headers $headers -Method Get
$contrato = $busqueda.contratos | Where-Object { $_.folio -eq $folio }

if (-not $contrato) {
    Write-Host "No encontre un contrato de franquicia con folio $folio" -ForegroundColor Red
    exit 1
}

Write-Host "Encontrado: $($contrato.folio) - $($contrato.titulo) (estatus actual: $($contrato.estatus))"

if ($contrato.estatus -eq "activo") {
    Write-Host "Ya esta en estatus activo, no hay nada que hacer." -ForegroundColor Yellow
    exit 0
}

$resultado = Invoke-RestMethod -Uri "$apiBase/contratos/$($contrato.id)/registrar-club-franquicia" -Headers $headers -Method Post

Write-Host ""
Write-Host "Listo. Nuevo estatus: $($resultado.contrato.estatus)" -ForegroundColor Green