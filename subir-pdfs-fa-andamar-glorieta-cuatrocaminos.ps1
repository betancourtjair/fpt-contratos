# subir-pdfs-fa-andamar-glorieta-cuatrocaminos.ps1
# Sube SOLO los 3 PDFs de FA como "firmado_manual" (los datos de los contratos ya se guardaron).
# Si un PDF aparece duplicado (misma nombre en distintas carpetas) usa una sola copia.

$ErrorActionPreference = "Stop"
$apiBase = "https://fpt-contratos-backend.onrender.com/api"
$carpetaPdfs = "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos"

$clubes = @(
    @{ Folio = "CT-2026-0057"; Claves = @("Andamar") },
    @{ Folio = "CT-2026-0058"; Claves = @("Glorieta") },
    @{ Folio = "CT-2026-0059"; Claves = @("Cuatro", "Caminos") }
)

Add-Type -AssemblyName System.Net.Http
$cred = Get-Credential -Message "Inicia sesion en Contratos FPT (correo y password)"
$loginBody = @{ email = $cred.UserName; password = $cred.GetNetworkCredential().Password } | ConvertTo-Json
$token = (Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json").token
$headers = @{ Authorization = "Bearer $token" }
$todos = @((Invoke-RestMethod -Uri "$apiBase/franquicias" -Headers $headers -Method Get).contratos)
$pdfs = Get-ChildItem -Path $carpetaPdfs -Recurse -Filter *.pdf -ErrorAction SilentlyContinue

foreach ($c in $clubes) {
    Write-Host ""
    Write-Host "=== $($c.Folio) ===" -ForegroundColor Cyan
    $contrato = $todos | Where-Object { $_.folio -eq $c.Folio } | Select-Object -First 1
    if (-not $contrato) { Write-Host "Folio no encontrado." -ForegroundColor Red; continue }

    $cand = @($pdfs | Where-Object {
        $n = $_.Name; $ok = $true
        foreach ($k in $c.Claves) { if ($n -notlike "*$k*") { $ok = $false } }
        $ok -and ($n -match "FA" -or $n -match "Franchise")
    })
    # Quitar duplicados por nombre de archivo (misma copia en varias carpetas).
    $unicos = @($cand | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 })
    if ($unicos.Count -ne 1) {
        Write-Host "Encontre $($unicos.Count) PDFs distintos, no subo nada:" -ForegroundColor Yellow
        $unicos | ForEach-Object { Write-Host "   - $($_.FullName)" -ForegroundColor Yellow }
        continue
    }
    $rutaPdf = $unicos[0].FullName
    Write-Host "PDF: $rutaPdf"

    $http = New-Object System.Net.Http.HttpClient
    $http.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $stream = [System.IO.File]::OpenRead($rutaPdf)
    $content = New-Object System.Net.Http.StreamContent($stream)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $multipart.Add($content, "archivo", [System.IO.Path]::GetFileName($rutaPdf))
    $multipart.Add((New-Object System.Net.Http.StringContent("firmado_manual")), "categoria")
    $resp = $http.PostAsync("$apiBase/contratos/$($contrato.id)/documentos", $multipart).Result
    $stream.Close()
    if ($resp.IsSuccessStatusCode) {
        Write-Host "PDF subido como Documento firmado manual." -ForegroundColor Green
    } else {
        Write-Host "Error: $($resp.StatusCode) $($resp.Content.ReadAsStringAsync().Result)" -ForegroundColor Red
    }
    $http.Dispose()
}
Write-Host ""
Write-Host "Listo." -ForegroundColor Green