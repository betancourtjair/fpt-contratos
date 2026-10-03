# crear-franquicias-lote-2026.ps1
#
# Crea en Contratos FPT los 4 clubes de franquicia nuevos (Cuatro Caminos, Escobedo,
# Izazaga, Melt Polanco), igual que se hizo antes con Centro Santa Fe: crea el club si no
# existe, crea el contrato (que ya nace en estatus "activo" / club registrado, sin pasar por
# autorizacion), llena los datos de franquicia, y sube el PDF firmado (que se enruta solo a
# SharePoint).
#
# IMPORTANTE: antes de correrlo, descarga estos 4 PDFs de SharePoint (carpeta "FA firmados /
# Aperturas 2026") a la carpeta que se indica abajo en $carpetaPdfs, SIN cambiarles el nombre:
#   - Cuatro Caminos, EDO MEX FA [11.03.2025].pdf
#   - Escobedo (Av. Las Torres) NLE FA [08.05.2026](97783.3).pdf
#   - Izazaga CDMX FA [08.05.2026](97781.3).pdf
#   - Melt Polanco, CDMX FA [08.052026](97782.3).pdf
#
# Ninguno de estos 4 clubes tiene todavia su fecha real de apertura (Business Commencement
# Date) en el contrato firmado -- quedan con fecha de termino PROVISIONAL (10 anos desde la
# fecha de firma) y sin fecha de proximo pago de regalias, igual que Santa Fe antes de que
# abriera. En cuanto cada uno abra sus puertas, avisame la fecha real y ajusto cada uno
# (como hicimos con Santa Fe).
#
# ALERTA: Cuatro Caminos firmo el 3-nov-2025. Su fecha limite de apertura (Articulo 4.9, 330
# dias) es el 29-sep-2026, que YA PASO (hoy es la fecha en que corras este script). Si el club
# ya abrio, no hay problema -- solo falta capturar la fecha real. Si todavia no abre, esto es
# un incumplimiento de plazo contractual y vale la pena confirmarlo con Juridico cuanto antes.

$ErrorActionPreference = "Stop"

$apiBase = "https://fpt-contratos-backend.onrender.com/api"

# Ajusta esta ruta si guardaste los PDFs en otro lugar.
$carpetaPdfs = "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos\FA"

$credenciales = Get-Credential -Message "Inicia sesion en Contratos FPT (correo y password)"
$email = $credenciales.UserName
$password = $credenciales.GetNetworkCredential().Password

Write-Host "Iniciando sesion..."
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Buscando el tipo de contrato de franquicia..."
$tipos = Invoke-RestMethod -Uri "$apiBase/tipos-contrato" -Headers $headers -Method Get
$tipoFranquicia = $tipos.tiposContrato | Where-Object { $_.es_franquicia -eq $true } | Select-Object -First 1
if (-not $tipoFranquicia) {
    Write-Host "No hay ningun tipo de contrato activo marcado como franquicia." -ForegroundColor Red
    exit 1
}
Write-Host "Tipo de contrato: $($tipoFranquicia.nombre) ($($tipoFranquicia.id))"

Add-Type -AssemblyName System.Net.Http

$polizas = "Responsabilidad civil general, de propiedad (100% del valor de reposicion), interrupcion de negocio, abuso/agresion sexual, camas de bronceado, practicas laborales, auto, desempleo, ciber, y paraguas (umbrella) en exceso. Aseguradora con calificacion AM Best A- o superior, Financial Size Category VIII o mas."
$condicionesRenovacion = "Successor Franchise (Art. 14.1): derecho a 10 anos adicionales, con aviso de 6 a 12 meses de anticipacion, sin incumplimientos pendientes, remodelacion requerida, y pago de la cuota inicial entonces vigente. Extension (Art. 14.2): cuota actual de USD 2,000 al mes."
$territorio = "Franquicia 'solo el sitio' (site only), sin territorio protegido ni exclusividad (Articulo 3.1)."

$clubes = @(
    [PSCustomObject]@{
        NombreClub       = "Cuatro Caminos, EDO MEX"
        Direccion        = "Transmisiones Militares 30, Local AN-01A, Colonia Fraccionamiento Industrial Naucalpan, Naucalpan de Juarez, Estado de Mexico, C.P. 53489"
        Titulo           = "Contrato de Franquicia - Cuatro Caminos, EDO MEX (PF Club #5690)"
        FechaInicio      = "2025-11-03"
        FechaFinProv     = "2035-11-03"
        FechaLimiteApertura = "2026-09-29"
        ArchivoPdf       = "Cuatro Caminos, EDO MEX FA [11.03.2025].pdf"
    },
    [PSCustomObject]@{
        NombreClub       = "Escobedo (Av. Las Torres), NLE"
        Direccion        = "Av. Parque Industrial 201, Colonia Los Girasoles 2do Sector, Escobedo, Nuevo Leon, C.P. 66050"
        Titulo           = "Contrato de Franquicia - Escobedo (Av. Las Torres), NLE (PF Club #5679)"
        FechaInicio      = "2026-08-05"
        FechaFinProv     = "2036-08-05"
        FechaLimiteApertura = "2027-07-01"
        ArchivoPdf       = "Escobedo (Av. Las Torres) NLE FA [08.05.2026](97783.3).pdf"
    },
    [PSCustomObject]@{
        NombreClub       = "Izazaga, CDMX"
        Direccion        = "Jose Maria Izazaga 18, Colonia Centro, Alcaldia Cuauhtemoc, Ciudad de Mexico, C.P. 06080"
        Titulo           = "Contrato de Franquicia - Izazaga, CDMX (PF Club #5090)"
        FechaInicio      = "2026-08-05"
        FechaFinProv     = "2036-08-05"
        FechaLimiteApertura = "2027-07-01"
        ArchivoPdf       = "Izazaga CDMX FA [08.05.2026](97781.3).pdf"
    },
    [PSCustomObject]@{
        NombreClub       = "Melt Polanco, CDMX"
        Direccion        = "Laguna de Terminos 249, Colonia Anahuac I Seccion, Alcaldia Miguel Hidalgo, Ciudad de Mexico, C.P. 11320"
        Titulo           = "Contrato de Franquicia - Melt Polanco, CDMX (PF Club #5615)"
        FechaInicio      = "2026-08-05"
        FechaFinProv     = "2036-08-05"
        FechaLimiteApertura = "2027-07-01"
        ArchivoPdf       = "Melt Polanco, CDMX FA [08.052026](97782.3).pdf"
    }
)

foreach ($club in $clubes) {

    Write-Host ""
    Write-Host "=== $($club.NombreClub) ===" -ForegroundColor Cyan

    $rutaPdf = Join-Path $carpetaPdfs $club.ArchivoPdf
    if (-not (Test-Path $rutaPdf)) {
        Write-Host "No encuentro el PDF en: $rutaPdf" -ForegroundColor Red
        Write-Host "Saltando este club. Descarga el PDF de SharePoint y vuelve a correr el script." -ForegroundColor Red
        continue
    }

    # 1. Buscar o crear el club en el catalogo.
    $clubesResp = Invoke-RestMethod -Uri "$apiBase/clubes" -Headers $headers -Method Get
    $clubExistente = $clubesResp.clubes | Where-Object { $_.nombre -eq $club.NombreClub }

    if ($clubExistente) {
        $clubId = $clubExistente.id
        Write-Host "Club ya existia en el catalogo: $($club.NombreClub)"
    } else {
        $nuevoClubBody = @{ nombre = $club.NombreClub; direccion = $club.Direccion } | ConvertTo-Json
        $nuevoClub = Invoke-RestMethod -Uri "$apiBase/clubes" -Headers $headers -Method Post -Body $nuevoClubBody -ContentType "application/json"
        $clubId = $nuevoClub.club.id
        Write-Host "Club creado en el catalogo: $($club.NombreClub)"
    }

    # 2. Crear el contrato (draft -> nace directo en 'activo' por ser franquicia).
    $contratoBody = @{
        titulo             = $club.Titulo
        tipoContratoId      = $tipoFranquicia.id
        parte               = "Fitness para todos, S. de R.L. de C.V."
        contraparteNombre   = "Planet Fitness Mexico, S. de R.L. de C.V."
        contraparteContacto = "Darrell Chichester"
        monto               = 0
        moneda              = "USD"
        fechaInicio         = $club.FechaInicio
        fechaFin            = $club.FechaFinProv
        renovacionAutomatica = $false
        diasAvisoVencimiento = 90
        descripcion         = "Franchise Agreement de $($club.NombreClub). Fecha de termino PROVISIONAL (10 anos desde firma) -- pendiente de ajustar con la fecha real de apertura (Business Commencement Date)."
    } | ConvertTo-Json

    $contratoResp = Invoke-RestMethod -Uri "$apiBase/contratos" -Headers $headers -Method Post -Body $contratoBody -ContentType "application/json"
    $contratoId = $contratoResp.contrato.id
    $folio = $contratoResp.contrato.folio
    Write-Host "Contrato creado: $folio (estatus: $($contratoResp.contrato.estatus))"

    # 3. Llenar los datos de franquicia.
    $franquiciaBody = @{
        clubId                    = $clubId
        cuotaInicial              = 0
        regaliasPorcentaje        = 4.5
        fondoMercadeoPorcentaje   = 9
        periodicidadPagoRegalias  = "mensual"
        territorio                = $territorio
        direccionPunto            = $club.Direccion
        fechaLimiteApertura       = $club.FechaLimiteApertura
        numeroRenovacionesPermitidas = 1
        condicionesRenovacion     = $condicionesRenovacion
        polizasSeguroRequeridas   = $polizas
        garantiaPersonal          = $false
        garanteNombre             = "Fitness Para Todos Holdings, S. de R.L. de C.V."
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$apiBase/contratos/$contratoId/franquicia" -Headers $headers -Method Put -Body $franquiciaBody -ContentType "application/json" | Out-Null
    Write-Host "Datos de franquicia guardados."

    # 4. Subir el PDF firmado (se enruta solo a SharePoint).
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $fileStream = [System.IO.File]::OpenRead($rutaPdf)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $multipart.Add($fileContent, "archivo", [System.IO.Path]::GetFileName($rutaPdf))
    $multipart.Add((New-Object System.Net.Http.StringContent("version_firmada")), "categoria")

    $uploadResult = $httpClient.PostAsync("$apiBase/contratos/$contratoId/documentos", $multipart).Result
    $fileStream.Close()

    if ($uploadResult.IsSuccessStatusCode) {
        Write-Host "PDF subido correctamente (se enruta solo a SharePoint)." -ForegroundColor Green
    } else {
        $errorBody = $uploadResult.Content.ReadAsStringAsync().Result
        Write-Host "Error subiendo el PDF: $($uploadResult.StatusCode) $errorBody" -ForegroundColor Red
    }

    $httpClient.Dispose()
}

Write-Host ""
Write-Host "Listo. Revisa el dashboard de Franquicias para confirmar los 4 clubes." -ForegroundColor Green}