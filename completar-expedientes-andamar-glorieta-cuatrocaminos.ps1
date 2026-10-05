# completar-expedientes-andamar-glorieta-cuatrocaminos.ps1
#
# Completa los expedientes placeholder de 3 clubes con los Franchise Agreements REALES:
#   CT-2026-0057  Andamar (Boca del Rio, VER)      PF Club #4950
#   CT-2026-0058  Glorieta (San Luis Potosi, SLP)  PF Club #4914
#   CT-2026-0059  Cuatro Caminos (EDO MEX)         PF Club #5690
#
# Hace, por cada club: actualiza contraparte/fechas/titulo, llena los datos de franquicia
# (incluye club abierto y fecha de apertura del directorio: Andamar 21-12-24, Glorieta 31-12-24, Cuatro Caminos 28-05-26) y sube el PDF firmado
# con categoria "firmado_manual" (requiere que tu usuario sea super_admin o cabeza_juridico).
#
# Correr desde cualquier carpeta en PowerShell. Solo usa la API, no modifica el repo.
# Seguro de correr mas de una vez (vuelve a poner los mismos datos; el PDF se sube como nueva
# version si ya existia uno).

$ErrorActionPreference = "Stop"
$apiBase = "https://fpt-contratos-backend.onrender.com/api"

# Carpeta donde estan los PDFs de los FA (se busca recursivamente).
$carpetaPdfs = "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos"

# Fechas efectivas (Effective Date de la hoja de firmas). Confirmar con Juridico:
#  - Andamar: 26-jul-2024 (FPT firmo 16-jul-2024).
#  - Glorieta: manuscrito 09/03/2024, formato EEUU = 3-sep-2024 (FPT firmo 16-ago-2024).
#  - Cuatro Caminos: 11/3/2025, formato EEUU = 3-nov-2025 (FPT firmo 23-sep-2025).
$clubes = @(
    @{
        Folio = "CT-2026-0057"; Nombre = "Andamar, Boca del Rio, VER"; PfId = "4950"
        FechaEfectiva = "2024-07-26"; Apertura = "2024-12-21"; Claves = @("Andamar")
        Direccion = "Avenida Adolfo Ruiz Cortinez 3500, Playa del Oro Mocambo, Boca del Rio, Veracruz 03730"
    },
    @{
        Folio = "CT-2026-0058"; Nombre = "Glorieta, San Luis Potosi, SLP"; PfId = "4914"
        FechaEfectiva = "2024-09-03"; Apertura = "2024-12-31"; Claves = @("Glorieta")
        Direccion = "Plaza Huasteca 101, Fraccionamiento San Antonio, San Luis Potosi, San Luis Potosi 78435"
    },
    @{
        Folio = "CT-2026-0059"; Nombre = "Cuatro Caminos, EDO MEX"; PfId = "5690"
        FechaEfectiva = "2025-11-03"; Apertura = "2026-05-28"; Claves = @("Cuatro", "Caminos")
        Direccion = "Transmisiones Militares 30 Local AN-01A, Fraccionamiento Industrial Naucalpan, Naucalpan de Juarez, Estado de Mexico 53489"
    }
)

$polizas = "Responsabilidad civil general, de propiedad (100% del valor de reposicion), interrupcion de negocio, abuso/agresion sexual, camas de bronceado, practicas laborales, auto, desempleo, ciber, y paraguas (umbrella) en exceso. Aseguradora con calificacion AM Best A- o superior, Financial Size Category VIII o mas."
$condicionesRenovacion = "Successor Franchise (Art. 14.1): derecho a 10 anos adicionales, con aviso de 6 a 12 meses de anticipacion, sin incumplimientos pendientes, remodelacion requerida, y pago de la cuota entonces vigente."
$territorio = "Franquicia 'solo el sitio' (site only), sin territorio protegido ni exclusividad (Articulo 3.1), salvo Area Development Agreement."
$garante = "Fitness Para Todos Holdings, S. de R.L. de C.V."

Add-Type -AssemblyName System.Net.Http

$credenciales = Get-Credential -Message "Inicia sesion en Contratos FPT (correo y password)"
$loginBody = @{ email = $credenciales.UserName; password = $credenciales.GetNetworkCredential().Password } | ConvertTo-Json
Write-Host "Iniciando sesion..."
$loginResp = Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
$headers = @{ Authorization = "Bearer $token" }

$lista = Invoke-RestMethod -Uri "$apiBase/franquicias" -Headers $headers -Method Get
$todos = @($lista.contratos)

$pdfs = Get-ChildItem -Path $carpetaPdfs -Recurse -Filter *.pdf -ErrorAction SilentlyContinue

foreach ($c in $clubes) {
    Write-Host ""
    Write-Host "=== $($c.Folio) - $($c.Nombre) ===" -ForegroundColor Cyan

    $contrato = $todos | Where-Object { $_.folio -eq $c.Folio } | Select-Object -First 1
    if (-not $contrato) {
        Write-Host "No se encontro el folio $($c.Folio) en Franquicias. Se omite." -ForegroundColor Red
        continue
    }
    $id = $contrato.id

    # 1. Datos generales del contrato.
    $fechaEf = [datetime]::ParseExact($c.FechaEfectiva, "yyyy-MM-dd", $null)
    $patch = @{
        titulo               = "Contrato de Franquicia - $($c.Nombre) (PF Club #$($c.PfId))"
        parte                = "Fitness para todos, S. de R.L. de C.V."
        contraparteNombre    = "Planet Fitness Mexico, S. de R.L. de C.V."
        contraparteContacto  = "Darrell Chichester"
        monto                = 0
        moneda               = "USD"
        fechaInicio          = $c.FechaEfectiva
        fechaFin             = $fechaEf.AddYears(10).ToString("yyyy-MM-dd")
        renovacionAutomatica = $false
        diasAvisoVencimiento = 90
        descripcion          = "Franchise Agreement de $($c.Nombre) (PF Club #$($c.PfId)), vigencia de 10 anos desde la fecha efectiva $($c.FechaEfectiva). Cuota inicial US`$0; regalias 4.5% (esquema escalonado del FA). Direccion: $($c.Direccion)."
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiBase/contratos/$id" -Headers $headers -Method Patch -Body $patch -ContentType "application/json" | Out-Null
    Write-Host "Contrato actualizado."

    # 2. Datos de franquicia (sin club_abierto / fecha_apertura, que vienen del directorio).
    $fr = @{
        clubAbierto                  = $true
        fechaApertura                = $c.Apertura
        cuotaInicial                 = 0
        regaliasPorcentaje           = 4.5
        fondoMercadeoPorcentaje      = 9
        periodicidadPagoRegalias     = "mensual"
        territorio                   = $territorio
        direccionPunto               = $c.Direccion
        fechaLimiteApertura          = $fechaEf.AddDays(330).ToString("yyyy-MM-dd")
        numeroRenovacionesPermitidas = 1
        condicionesRenovacion        = $condicionesRenovacion
        polizasSeguroRequeridas      = $polizas
        garantiaPersonal             = $false
        garanteNombre                = $garante
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiBase/contratos/$id/franquicia" -Headers $headers -Method Put -Body $fr -ContentType "application/json" | Out-Null
    Write-Host "Datos de franquicia guardados."

    # 3. PDF firmado: debe llamarse como un FA (no el contrato de arrendamiento).
    $candidatos = @($pdfs | Where-Object {
        $n = $_.Name
        $ok = $true
        foreach ($k in $c.Claves) { if ($n -notlike "*$k*") { $ok = $false } }
        $ok -and ($n -match "FA" -or $n -match "Franchise")
    })
    if ($candidatos.Count -ne 1) {
        Write-Host "No pude identificar un unico PDF del FA (encontre $($candidatos.Count)). Sube el PDF a mano desde la plataforma como Documento firmado manual:" -ForegroundColor Yellow
        $candidatos | ForEach-Object { Write-Host "   - $($_.FullName)" -ForegroundColor Yellow }
        continue
    }
    $rutaPdf = $candidatos[0].FullName
    Write-Host "PDF: $rutaPdf"

    $http = New-Object System.Net.Http.HttpClient
    $http.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $stream = [System.IO.File]::OpenRead($rutaPdf)
    $content = New-Object System.Net.Http.StreamContent($stream)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $multipart.Add($content, "archivo", [System.IO.Path]::GetFileName($rutaPdf))
    $multipart.Add((New-Object System.Net.Http.StringContent("firmado_manual")), "categoria")
    $resp = $http.PostAsync("$apiBase/contratos/$id/documentos", $multipart).Result
    $stream.Close()
    if ($resp.IsSuccessStatusCode) {
        Write-Host "PDF subido como Documento firmado manual." -ForegroundColor Green
    } else {
        Write-Host "Error subiendo el PDF: $($resp.StatusCode) $($resp.Content.ReadAsStringAsync().Result)" -ForegroundColor Red
    }
    $http.Dispose()
}

Write-Host ""
Write-Host "Listo. Revisa los 3 expedientes en Franquicias." -ForegroundColor Green