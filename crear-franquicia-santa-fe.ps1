# Crea el borrador del contrato de franquicia para Centro Santa Fe, CDMX con los datos
# extraidos y validados del PDF firmado (PF Club #4912), y sube ese mismo PDF como el
# documento del expediente. Como el backend ya tiene CONTRATOS_STORAGE_DRIVER=sharepoint
# configurado en produccion, el PDF queda guardado automaticamente en SharePoint, en la
# carpeta <Tipo de contrato>/<Folio>/ - no hace falta subirlo tambien a mano.
#
# Si el club "Centro Santa Fe, CDMX" todavia no existe en el catalogo de Clubes, este
# script lo da de alta automaticamente antes de crear el contrato.
#
# Uso:
#   .\crear-franquicia-santa-fe.ps1 -PdfPath "C:\ruta\a\Centros Santa Fe CDMX FA FPT-06092026 Fx.pdf"
#
# Pide tu correo y password de FPT Contratos de forma interactiva (nunca quedan guardados
# en este archivo). Solo texto ASCII en todo el script a proposito, para evitar el problema
# de codificacion que ya vimos antes con acentos en PowerShell 5.1.
#
# Nota: el API habla en snake_case (es_franquicia, club_id, etc.) - la conversion a
# camelCase (esFranquicia) solo la hace el frontend del lado del navegador, no el API. Este
# script le habla directo al API, asi que usa los nombres de columna tal cual.

param(
  [Parameter(Mandatory = $true)]
  [string]$PdfPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PdfPath)) {
  Write-Error "No se encontro el archivo: $PdfPath"
  exit 1
}

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
Write-Host ("Sesion iniciada como " + $loginResp.usuario.email + " (rol " + $loginResp.usuario.rol + ")")

Write-Host "Buscando el tipo de contrato de franquicia..."
$tiposResp = Invoke-RestMethod -Uri "$ApiUrl/tipos-contrato" -Headers $Headers -Method Get
$tipos = $tiposResp.tiposContrato | Where-Object { $_.es_franquicia -eq $true -and $_.activo -ne $false }
if (-not $tipos) {
  Write-Error "No hay ningun tipo de contrato activo marcado como franquicia. Pide a un administrador que lo revise en Tipos de contrato."
  exit 1
}
if ($tipos.Count -gt 1) {
  Write-Host "Hay mas de un tipo de contrato de franquicia activo:"
  $tipos | ForEach-Object { Write-Host ("  - " + $_.nombre + " (id " + $_.id + ")") }
  Write-Error "Edita este script para fijar manualmente cual tipoContratoId usar."
  exit 1
}
$tipoContratoId = $tipos[0].id
Write-Host ("Tipo de contrato: " + $tipos[0].nombre)

Write-Host "Buscando el club Centro Santa Fe..."
$clubesResp = Invoke-RestMethod -Uri "$ApiUrl/clubes?activo=true" -Headers $Headers -Method Get
$club = $clubesResp.clubes | Where-Object { $_.nombre -match "Santa Fe" } | Select-Object -First 1

if (-not $club) {
  Write-Host "No existe todavia ese club en el catalogo de Clubes. Lo doy de alta..."
  $clubPayload = @{
    nombre    = "Centro Santa Fe, CDMX"
    direccion = "Av. Vasco de Quiroga 3800, Col Santa Fe, Cuajimalpa, Ciudad de Mexico, C.P. 05348"
  } | ConvertTo-Json
  $clubBytes = [System.Text.Encoding]::UTF8.GetBytes($clubPayload)
  $clubResp = Invoke-RestMethod -Uri "$ApiUrl/clubes" -Method Post -Headers $Headers -Body $clubBytes -ContentType "application/json; charset=utf-8"
  $club = $clubResp.club
  Write-Host ("Club creado: " + $club.nombre)
} else {
  Write-Host ("Club encontrado: " + $club.nombre)
}
$clubId = $club.id

# ---------------------------------------------------------------------------
# Datos extraidos y validados del contrato (PF Club #4912, Centro Santa Fe, CDMX)
# ---------------------------------------------------------------------------

$descripcion = "Franquicia Planet Fitness Mexico para el club Centro Santa Fe, CDMX (PF Club ID #4912). " +
  "Fecha efectiva: 09-jun-2026. Termino de 10 anos contado a partir de la Fecha de Inicio de Operaciones " +
  "(aun no determinada); fecha limite para abrir: 05-may-2027 si es remodelacion de local existente, o " +
  "principios de agosto 2027 si es obra nueva desde cero (330/450 dias desde la firma, Articulo 4.9). " +
  "Cuota inicial de franquicia: USD 0. Regalias escalonadas (Business Services Fee + Trademark License Fee, " +
  "Articulo 5.2): 4.5% anos 1-3, 5.5% anos 4-6, 6.5% anos 7-10 del Revenue. Fondo de mercadeo: hasta 9% del " +
  "Revenue (Ad Fee nacional/regional con tope de 2% + LAF local, Articulo 10.1-10.2). Franquicia 'site only', " +
  "sin territorio protegido (Articulo 3.1). Garantia: obligado solidario corporativo Fitness Para Todos " +
  "Holdings, S. de R.L. de C.V. (Apendice C, firmado 22-may-2026). " +
  "Datos extraidos y validados del PDF firmado; fecha de fin y fecha de proximo pago de regalias quedan " +
  "pendientes de la fecha real de apertura."

$contratoPayload = @{
  titulo                    = "Contrato de Franquicia - Centro Santa Fe, CDMX (PF Club #4912)"
  descripcion                = $descripcion
  tipoContratoId             = $tipoContratoId
  parte                      = "Fitness para todos, S. de R.L. de C.V."
  contraparteNombre          = "Planet Fitness Mexico, S. de R.L. de C.V."
  contraparteContacto        = "General Counsel"
  monto                      = 0
  moneda                     = "USD"
  fechaInicio                = "2026-06-09"
  renovacionAutomatica       = $false
  diasAvisoVencimiento       = 180
}

Write-Host "Creando el borrador del contrato..."
$contratoBody = $contratoPayload | ConvertTo-Json
$contratoBytes = [System.Text.Encoding]::UTF8.GetBytes($contratoBody)
$contratoResp = Invoke-RestMethod -Uri "$ApiUrl/contratos" -Method Post -Headers $Headers -Body $contratoBytes -ContentType "application/json; charset=utf-8"
$contratoId = $contratoResp.contrato.id
$contratoFolio = $contratoResp.contrato.folio
Write-Host ("Contrato creado: folio " + $contratoFolio + " (id " + $contratoId + ")")

$condicionesRenovacion = "Derecho a franquicia sucesora por 10 anos adicionales (Articulo 14.1), sujeto a: " +
  "aviso 6-12 meses antes del vencimiento, estar al corriente y sin incumplimientos, remodelar segun " +
  "estandares vigentes, firmar el formato de contrato sucesor entonces vigente, liberacion mutua de " +
  "reclamos, cumplir requisitos de calificacion/entrenamiento, y pagar la cuota de franquicia sucesora " +
  "(igual a la cuota inicial vigente para nuevas franquicias en EUA). Si no se cumplen las condiciones a " +
  "tiempo, se puede pedir extension (cuota actual USD 2,000 por mes, Articulo 14.2)."

$polizasSeguroRequeridas = "Responsabilidad civil general, danos a la propiedad (100% valor de reposicion), " +
  "interrupcion de negocio, abuso y acoso, bronceado, responsabilidad de practicas laborales, automoviles, " +
  "desempleo, ciberseguridad, paraguas (excess umbrella). Aseguradora con calificacion A- o mejor, AM Best " +
  "Financial Rating VIII o mejor (Articulo 9.8)."

$garanteNombre = "Fitness Para Todos Holdings, S. de R.L. de C.V. (obligado solidario corporativo, no es " +
  "garantia personal individual - Convenio de Asuncion de Obligacion Solidaria, Apendice C, firmado 22-may-2026)."

$franquiciaPayload = @{
  clubId                      = $clubId
  cuotaInicial                 = 0
  regaliasPorcentaje            = 4.5
  fondoMercadeoPorcentaje        = 9
  periodicidadPagoRegalias       = "mensual"
  diasAvisoPagoRegalias          = 7
  territorio                    = "Ninguno - franquicia site only, sin territorio protegido (Articulo 3.1 y Acknowledgement Addendum, pregunta 6)"
  radioExclusividadKm            = 0
  direccionPunto                = "Av. Vasco de Quiroga 3800, Col Santa Fe, Cuajimalpa, Ciudad de Mexico, C.P. 05348"
  fechaLimiteApertura            = "2027-05-05"
  diasAvisoApertura              = 30
  condicionesRenovacion          = $condicionesRenovacion
  diasAvisoRenovacion            = 180
  diasAvisoAuditoria             = 15
  polizasSeguroRequeridas        = $polizasSeguroRequeridas
  garantiaPersonal               = $true
  garanteNombre                  = $garanteNombre
}

Write-Host "Guardando los datos de franquicia..."
$franquiciaBody = $franquiciaPayload | ConvertTo-Json
$franquiciaBytes = [System.Text.Encoding]::UTF8.GetBytes($franquiciaBody)
Invoke-RestMethod -Uri "$ApiUrl/contratos/$contratoId/franquicia" -Method Put -Headers $Headers -Body $franquiciaBytes -ContentType "application/json; charset=utf-8" | Out-Null
Write-Host "Datos de franquicia guardados."

Write-Host "Subiendo el PDF del contrato firmado (quedara en SharePoint automaticamente)..."
Add-Type -AssemblyName System.Net.Http
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $Token)

$multipartContent = New-Object System.Net.Http.MultipartFormDataContent
$fileStream = [System.IO.File]::OpenRead($PdfPath)
$fileContent = New-Object System.Net.Http.StreamContent($fileStream)
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
$fileName = [System.IO.Path]::GetFileName($PdfPath)
$multipartContent.Add($fileContent, "archivo", $fileName)
$multipartContent.Add((New-Object System.Net.Http.StringContent("version_firmada")), "categoria")

$uploadUrl = "$ApiUrl/contratos/$contratoId/documentos"
$uploadResult = $httpClient.PostAsync($uploadUrl, $multipartContent).GetAwaiter().GetResult()
$fileStream.Close()
$responseText = $uploadResult.Content.ReadAsStringAsync().GetAwaiter().GetResult()

if (-not $uploadResult.IsSuccessStatusCode) {
  Write-Error ("Fallo la subida del PDF (" + [int]$uploadResult.StatusCode + "): " + $responseText)
  exit 1
}
Write-Host "PDF subido correctamente."

Write-Host ""
Write-Host "Listo. Folio:" $contratoFolio
Write-Host "Revisa el borrador en https://contratos.fpt.com.mx/contratos/$contratoId"
Write-Host "Recuerda: fechaFin y fechaProximoPagoRegalias quedaron vacios porque dependen de la fecha real de apertura del club."