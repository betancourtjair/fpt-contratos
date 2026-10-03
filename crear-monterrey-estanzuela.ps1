# crear-franquicias-lote2-historico.ps1
#
# Carga el portafolio HISTORICO de Franchise Agreements (2021-2026) encontrado en la carpeta
# de SharePoint "FA firmados", distinto del lote de 4 clubes nuevos de 2026 (ese ya se cargo
# con crear-franquicias-lote-2026.ps1). Mismo patron: crea el club si no existe, crea el
# contrato (nace directo en 'activo' por ser franquicia), llena los datos de franquicia, y
# sube el PDF firmado (se enruta solo a SharePoint).
#
# IMPORTANTE - antes de correrlo:
# 1. Descarga TODOS los PDFs de la carpeta "FA firmados" de SharePoint a la carpeta indicada
#    abajo en $carpetaPdfs, SIN cambiarles el nombre (son los nombres originales de SharePoint,
#    incluidos acentos).
# 2. Este script NO incluye: Via Santa Fe, Cuatro Caminos, Escobedo, Izazaga, Melt Polanco
#    (esos ya se cargaron por separado), ni los clubes con problemas de datos pendientes de
#    resolver (ver la tabla de pendientes que te mande aparte): Glorieta (SLP), Andamar (Boca
#    del Rio), El Refugio (QRO) y Tlatelolco -- de esos 4, el PDF real no se pudo localizar o
#    leer con confianza, pedimos que IT/Legal corrija el nombre/contenido en SharePoint antes
#    de cargarlos.
# 3. Varios de los 49 clubes de este lote tienen su PDF guardado en SharePoint con un nombre
#    que NO corresponde al club (desfase de nombres descubierto durante el analisis) -- el
#    script busca el archivo correcto usando palabras clave (Key1/Key2) en vez del nombre
#    completo, precisamente por esto. Cada club con este problema trae una nota de advertencia
#    en su campo "Nota" (se guarda tambien en la descripcion del contrato).
# 4. La mayoria de estos clubes YA ESTAN OPERANDO (son contratos viejos), asi que sus fechas de
#    "Business Commencement Deadline" calculadas ya pasaron -- esto es normal aqui, a diferencia
#    del lote de clubes nuevos. No se interpreten como incumplimientos salvo que Legal lo pida.
# 5. Apodaca (El Molino) es una ADQUISICION, no un FA nuevo: su plazo es fijo (no son 10 anos
#    desde la firma) y no tiene fecha limite de apertura (el club ya operaba). El script lo
#    maneja como caso especial (FechaFinFija / SinBCD).
# 6. Saltillo (Santa Isabel) y Santa Catarina estan franquiciados bajo "Jeg-Mexico Bueno, S. de
#    R.L. de C.V." en vez de Fitness Para Todos directamente -- es normal, asi se confirmo con
#    el equipo. El garante solidario sigue siendo Fitness Para Todos Holdings en ambos casos.

$ErrorActionPreference = "Stop"

$apiBase = "https://fpt-contratos-backend.onrender.com/api"

# Ajusta esta ruta si guardaste los PDFs en otro lugar (debe ser la carpeta que contiene TODOS
# los PDFs de "FA firmados", no solo la subcarpeta "Aperturas 2026").
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
$condicionesRenovacion = "Successor Franchise (Art. 14.1): derecho a 10 anos adicionales, con aviso de 6 a 12 meses de anticipacion, sin incumplimientos pendientes, remodelacion requerida, y pago de la cuota entonces vigente."
$territorio = "Franquicia 'solo el sitio' (site only), sin territorio protegido ni exclusividad (Articulo 3.1), salvo Area Development Agreement."
$garante = "Fitness Para Todos Holdings, S. de R.L. de C.V."
$contraparteNombre = "Planet Fitness Mexico, S. de R.L. de C.V."
$contraparteContacto = "Darrell Chichester"

$clubesLote2 = @(
    [PSCustomObject]@{
        NombreClub = 'Monterrey (La Estanzuela), NL'
        PfClubId = '2528'
        Direccion = 'Centro Comercial Soriana Estanzuela-Sucursal 6066, Carretera Nacional y Calle La Estanzuela #7877, Colonia La Estanzuela, Monterrey, Nuevo Leon, C.P. 64988'
        FechaFirma = '2023-12-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 5.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Monterrey'
        Key2 = 'NL FA'
        FechaFinFija = '2029-08-12'
        SinBCD = $true
        Nota = 'ES UNA ADQUISICION (Acquisition Amendment), no un FA nuevo. El Business Commencement Date original es del 12-ago-2019 bajo el franquiciante anterior (Planet Fitness International Franchise, LLC); el plazo vence en fecha fija 2029-08-12 (no 10 anos desde esta firma). Regalias en la banda vigente por continuidad: 2.75%+2.75%=5.5% (tramo anios 4-6 desde el commencement date original de 2019, no la banda inicial). Cuota inicial no aplica ($0, club ya operaba). Tras la adquisicion de 2023 la propiedad se transfirio/aporto a Planet Fitmex, LLC (afiliada de FPT); estructura de propiedad distinta a los clubes nuevos. Existe un documento separado Monterrey (La Estanzuela) NL AA que es el Acquisition Amendment formal (no leido a fondo, solo se confirmo su existencia y que modifica este FA en los puntos arriba descritos). Pagina de firma del FA base no fue legible por el conector; fecha tomada del nombre de archivo/Excel.'
    }
)

$creados = 0
$saltados = @()

foreach ($club in $clubesLote2) {

    Write-Host ""
    Write-Host "=== $($club.NombreClub) (PF Club #$($club.PfClubId)) ===" -ForegroundColor Cyan

    # Buscar el PDF por palabras clave (varios archivos de este lote tienen el nombre
    # desfasado respecto al club real -- ver notas en el encabezado del script).
    $candidatos = Get-ChildItem -Path $carpetaPdfs -File -Filter "*.pdf" | Where-Object {
        $_.Name -like "*$($club.Key1)*" -and ($club.Key2 -eq "" -or $_.Name -like "*$($club.Key2)*")
    }

    if ($candidatos.Count -eq 0) {
        Write-Host "No encontre ningun PDF que coincida con Key1='$($club.Key1)' Key2='$($club.Key2)'." -ForegroundColor Red
        Write-Host "Saltando este club. Revisa el nombre del archivo en la carpeta." -ForegroundColor Red
        $saltados += $club.NombreClub
        continue
    }
    if ($candidatos.Count -gt 1) {
        Write-Host "Encontre mas de un PDF que coincide (${($candidatos.Count)}), uso el primero: $($candidatos[0].Name)" -ForegroundColor Yellow
    }
    $rutaPdf = $candidatos[0].FullName
    Write-Host "PDF encontrado: $($candidatos[0].Name)"

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

    # 2. Calcular fecha de fin y fecha limite de apertura.
    $fechaInicioDt = [datetime]::ParseExact($club.FechaFirma, "yyyy-MM-dd", $null)
    if ($club.FechaFinFija) {
        $fechaFin = $club.FechaFinFija
    } else {
        $fechaFin = $fechaInicioDt.AddYears(10).ToString("yyyy-MM-dd")
    }
    if (-not $club.SinBCD) {
        $fechaLimiteApertura = $fechaInicioDt.AddDays(330).ToString("yyyy-MM-dd")
    } else {
        $fechaLimiteApertura = $null
    }

    $descripcion = "Franchise Agreement historico de $($club.NombreClub) (PF Club #$($club.PfClubId)), firmado $($club.FechaFirma)."
    if ($club.Nota -ne "") {
        $descripcion = "$descripcion NOTA: $($club.Nota)"
    }

    # 3. Crear el contrato (draft -> nace directo en 'activo' por ser franquicia).
    $contratoBody = @{
        titulo               = "Contrato de Franquicia - $($club.NombreClub) (PF Club #$($club.PfClubId))"
        tipoContratoId       = $tipoFranquicia.id
        parte                = $club.Parte
        contraparteNombre    = $contraparteNombre
        contraparteContacto  = $contraparteContacto
        monto                = 0
        moneda               = "USD"
        fechaInicio          = $club.FechaFirma
        fechaFin             = $fechaFin
        renovacionAutomatica = $false
        diasAvisoVencimiento = 90
        descripcion          = $descripcion
    } | ConvertTo-Json

    $contratoResp = Invoke-RestMethod -Uri "$apiBase/contratos" -Headers $headers -Method Post -Body $contratoBody -ContentType "application/json"
    $contratoId = $contratoResp.contrato.id
    $folio = $contratoResp.contrato.folio
    Write-Host "Contrato creado: $folio (estatus: $($contratoResp.contrato.estatus))"

    # 4. Llenar los datos de franquicia.
    $franquiciaBody = @{
        clubId                       = $clubId
        cuotaInicial                 = $club.CuotaInicial
        regaliasPorcentaje           = $club.RegaliasPorcentaje
        fondoMercadeoPorcentaje      = 9
        periodicidadPagoRegalias     = "mensual"
        territorio                  = $territorio
        direccionPunto               = $club.Direccion
        numeroRenovacionesPermitidas = 1
        condicionesRenovacion        = $condicionesRenovacion
        polizasSeguroRequeridas      = $polizas
        garantiaPersonal             = $false
        garanteNombre                = $garante
    }
    if ($fechaLimiteApertura) {
        $franquiciaBody["fechaLimiteApertura"] = $fechaLimiteApertura
    }
    $franquiciaBodyJson = $franquiciaBody | ConvertTo-Json

    Invoke-RestMethod -Uri "$apiBase/contratos/$contratoId/franquicia" -Headers $headers -Method Put -Body $franquiciaBodyJson -ContentType "application/json" | Out-Null
    Write-Host "Datos de franquicia guardados."

    # 5. Subir el PDF firmado (se enruta solo a SharePoint).
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
        $creados++
    } else {
        $errorBody = $uploadResult.Content.ReadAsStringAsync().Result
        Write-Host "Error subiendo el PDF: $($uploadResult.StatusCode) $errorBody" -ForegroundColor Red
    }

    $httpClient.Dispose()
}

Write-Host ""
Write-Host "Listo. $creados de $($clubesLote2.Count) clubes procesados correctamente." -ForegroundColor Green
if ($saltados.Count -gt 0) {
    Write-Host "No se encontraron PDFs para estos clubes (revisa el nombre del archivo):" -ForegroundColor Yellow
    $saltados | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
}