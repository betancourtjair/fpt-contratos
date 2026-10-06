# completar-tlatelolco.ps1
#
# Carga el expediente real de Tlatelolco (CT-2026-0056). Tlatelolco es el club que antes se
# llamaba "Portal Queretaro": el FA #4358 (19-sep-2022) fue reubicado a Calzada de la Ronda 88,
# CDMX mediante la Primera Enmienda (efectiva 4-may-2023, firmada por FPT el 2-may-2023).
#
# Hace: actualiza el contrato, llena los datos de franquicia (club abierto, fecha de apertura
# 9-feb-2023 segun el directorio) y sube 2 PDFs: el FA como "firmado_manual" y la Enmienda
# como "anexo". Los PDFs deben estar en la carpeta de Contratos (o subcarpetas).
#
# Correr desde cualquier carpeta de PowerShell. Solo usa la API.

$ErrorActionPreference = "Stop"
$apiBase = "https://fpt-contratos-backend.onrender.com/api"
$carpetaPdfs = "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos"

$folio = "CT-2026-0056"
$direccion = "Calzada de la Ronda 88, Colonia Ex-Hipodromo, Cuauhtemoc, Ciudad de Mexico, CDMX 06250"

$polizas = "Responsabilidad civil general, de propiedad (100% del valor de reposicion), interrupcion de negocio, abuso/agresion sexual, camas de bronceado, practicas laborales, auto, desempleo, ciber, y paraguas (umbrella) en exceso. Aseguradora con calificacion AM Best A- o superior, Financial Size Category VIII o mas."
$condicionesRenovacion = "Successor Franchise (Art. 14.1): derecho a 10 anos adicionales, con aviso de 6 a 12 meses de anticipacion, sin incumplimientos pendientes, remodelacion requerida, y pago de la cuota entonces vigente."
$territorio = "Franquicia 'solo el sitio' (site only), sin territorio protegido ni exclusividad (Articulo 3.1), salvo Area Development Agreement."
$garante = "Fitness Para Todos Holdings, S. de R.L. de C.V."

Add-Type -AssemblyName System.Net.Http

$cred = Get-Credential -Message "Inicia sesion en Contratos FPT (correo y password)"
$loginBody = @{ email = $cred.UserName; password = $cred.GetNetworkCredential().Password } | ConvertTo-Json
$token = (Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json").token
$headers = @{ Authorization = "Bearer $token" }

$lista = Invoke-RestMethod -Uri "$apiBase/franquicias" -Headers $headers -Method Get
$contrato = @($lista.contratos) | Where-Object { $_.folio -eq $folio } | Select-Object -First 1
if (-not $contrato) { Write-Host "No se encontro $folio." -ForegroundColor Red; exit 1 }
$id = $contrato.id

# 1. Contrato.
$patch = @{
    titulo               = "Contrato de Franquicia - Tlatelolco, CDMX (PF Club #4358)"
    parte                = "Fitness para todos, S. de R.L. de C.V."
    contraparteNombre    = "Planet Fitness Mexico, S. de R.L. de C.V."
    contraparteContacto  = "Darrell Chichester"
    monto                = 20000
    moneda               = "USD"
    fechaInicio          = "2022-09-19"
    fechaFin             = "2032-09-19"
    renovacionAutomatica = $false
    diasAvisoVencimiento = 90
    descripcion          = "FA #4358 firmado originalmente como Portal Queretaro (efectivo 19-sep-2022), reubicado a Tlatelolco por la Primera Enmienda (efectiva 4-may-2023, firmada por FPT 2-may-2023): nueva ubicacion $direccion; cuotas continuas reducidas a 3% (1.5% Business Services + 1.5% Trademark License); plazo de apertura de 330 dias desde la enmienda. Cuota inicial original US`$20,000."
} | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/contratos/$id" -Headers $headers -Method Patch -Body $patch -ContentType "application/json" | Out-Null
Write-Host "Contrato actualizado."

# 2. Datos de franquicia (apertura segun directorio: 9-feb-2023).
$fr = @{
    clubAbierto                  = $true
    fechaApertura                = "2023-02-09"
    cuotaInicial                 = 20000
    regaliasPorcentaje           = 3
    fondoMercadeoPorcentaje      = 9
    periodicidadPagoRegalias     = "mensual"
    territorio                   = $territorio
    direccionPunto               = $direccion
    fechaLimiteApertura          = "2024-03-29"
    numeroRenovacionesPermitidas = 1
    condicionesRenovacion        = $condicionesRenovacion
    polizasSeguroRequeridas      = $polizas
    garantiaPersonal             = $false
    garanteNombre                = $garante
} | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/contratos/$id/franquicia" -Headers $headers -Method Put -Body $fr -ContentType "application/json" | Out-Null
Write-Host "Datos de franquicia guardados."

# 3. PDFs.
$pdfs = Get-ChildItem -Path $carpetaPdfs -Recurse -Filter *.pdf -ErrorAction SilentlyContinue
$docs = @(
    @{ Patron = "*4358_*FA*19 Sept 2022*";        Categoria = "firmado_manual"; Excluir = "*Amendment*" },
    @{ Patron = "*4358_*Amendment*04 May 2023*";  Categoria = "anexo";          Excluir = "" }
)
foreach ($d in $docs) {
    $cand = @($pdfs | Where-Object { $_.Name -like $d.Patron -and ($d.Excluir -eq "" -or $_.Name -notlike $d.Excluir) })
    $unicos = @($cand | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 })
    if ($unicos.Count -ne 1) {
        Write-Host "No identifique un unico PDF para $($d.Patron) (encontre $($unicos.Count)). Sube ese a mano." -ForegroundColor Yellow
        continue
    }
    $ruta = $unicos[0].FullName
    Write-Host "PDF ($($d.Categoria)): $ruta"
    $http = New-Object System.Net.Http.HttpClient
    $http.Timeout = [TimeSpan]::FromMinutes(5)
    $http.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $stream = [System.IO.File]::OpenRead($ruta)
    $content = New-Object System.Net.Http.StreamContent($stream)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $multipart.Add($content, "archivo", [System.IO.Path]::GetFileName($ruta))
    $multipart.Add((New-Object System.Net.Http.StringContent($d.Categoria)), "categoria")
    $resp = $http.PostAsync("$apiBase/contratos/$id/documentos", $multipart).Result
    $stream.Close()
    if ($resp.IsSuccessStatusCode) { Write-Host "Subido." -ForegroundColor Green }
    else { Write-Host "Error: $($resp.StatusCode) $($resp.Content.ReadAsStringAsync().Result)" -ForegroundColor Red }
    $http.Dispose()
}
Write-Host ""
Write-Host "Listo. Siguiente paso: node prisma/eliminar_portal_queretaro.js (desde backend/)." -ForegroundColor Green