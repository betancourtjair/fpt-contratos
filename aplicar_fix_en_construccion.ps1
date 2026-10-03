# ============================================================================
# Script de entrega: marcar Escobedo/Izazaga/Melt Polanco como en construccion
# ============================================================================
# Estos 3 clubes no se encontraron con el primer script (nombre exacto), asi que
# se quedaron marcados como abiertos por default. Este script los busca por
# coincidencia parcial (ILIKE) y los corrige.
#
# Como usarlo:
#   1) Corre este script desde la raiz del repo (fpt-contratos) en PowerShell.
#   2) git add -A ; git commit -m "..." ; git push
#   3) Con la DATABASE_URL de produccion en un .env local dentro de backend/:
#        npm run fix:franquicias-en-construccion
#      Revisa en la consola que si haya encontrado los 3 clubes antes de que
#      diga "Marcados como aun no abiertos". Si encuentra de mas o de menos,
#      avisame con el nombre exacto que imprima el catalogo.
#      Borra el .env al terminar.
# ============================================================================

function Write-FileFromBase64 {
    param(
        [string]$RelativePath,
        [string]$Base64Content
    )
    $fullPath = Join-Path (Get-Location) $RelativePath
    $dir = Split-Path $fullPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $bytes = [System.Convert]::FromBase64String($Base64Content)
    [System.IO.File]::WriteAllBytes($fullPath, $bytes)
    Write-Host "Escrito: $RelativePath"
}

Write-Host "Aplicando correccion de clubes en construccion..."

$b64 = @"
ewogICJuYW1lIjogImZwdC1jb250cmF0b3MtYmFja2VuZCIsCiAgInZlcnNpb24iOiAiMC4xLjAiLAogICJwcml2YXRlIjogdHJ1ZSwKICAiZGVzY3JpcHRp
b24iOiAiQmFja2VuZCBkZSBsYSBwbGF0YWZvcm1hIGRlIGdlc3Rpw7NuIGNvbnRyYWN0dWFsIChDTE0pIGRlIEZpdG5lc3MgUGFyYSBUb2RvcyAoRlBUKSIs
CiAgIm1haW4iOiAic3JjL3NlcnZlci5qcyIsCiAgInNjcmlwdHMiOiB7CiAgICAic3RhcnQiOiAibm9kZSBzcmMvc2VydmVyLmpzIiwKICAgICJkZXYiOiAi
bm9kZSAtLXdhdGNoIHNyYy9zZXJ2ZXIuanMiLAogICAgInNlZWQiOiAibm9kZSBwcmlzbWEvc2VlZC5qcyIsCiAgICAibWlncmF0ZTphcnJlbmRhbWllbnRv
cyI6ICJub2RlIHByaXNtYS9taWdyYXRlX2FycmVuZGFtaWVudG9zLmpzIiwKICAgICJtaWdyYXRlOmZyYW5xdWljaWEtYWxlcnRhcyI6ICJub2RlIHByaXNt
YS9taWdyYXRlX2ZyYW5xdWljaWFfYWxlcnRhcy5qcyIsCiAgICAiZml4OmZyYW5xdWljaWFzLWZpcm1hZG8iOiAibm9kZSBwcmlzbWEvbWFyY2FyX2ZyYW5x
dWljaWFzX2Zpcm1hZGFzLmpzIiwKICAgICJtaWdyYXRlOmZyYW5xdWljaWEtY2x1Yi1hYmllcnRvIjogIm5vZGUgcHJpc21hL21pZ3JhdGVfZnJhbnF1aWNp
YV9jbHViX2FiaWVydG8uanMiLAogICAgImZpeDpmcmFucXVpY2lhcy1jbHViLWFiaWVydG8iOiAibm9kZSBwcmlzbWEvbWFyY2FyX2NsdWJlc19ub19hYmll
cnRvcy5qcyIsCiAgICAiZml4OmZyYW5xdWljaWFzLWVuLWNvbnN0cnVjY2lvbiI6ICJub2RlIHByaXNtYS9tYXJjYXJfY2x1YmVzX2VuX2NvbnN0cnVjY2lv
bi5qcyIKICB9LAogICJkZXBlbmRlbmNpZXMiOiB7CiAgICAiYmNyeXB0IjogIl42LjAuMCIsCiAgICAiY29ycyI6ICJeMi44LjUiLAogICAgImRvY3h0ZW1w
bGF0ZXIiOiAiXjMuNjkuMyIsCiAgICAiZG90ZW52IjogIl4xNi40LjUiLAogICAgImV4cHJlc3MiOiAiXjQuMTkuMiIsCiAgICAiZXhwcmVzcy1hc3luYy1l
cnJvcnMiOiAiXjMuMS4xIiwKICAgICJqc29ud2VidG9rZW4iOiAiXjkuMC4yIiwKICAgICJtdWx0ZXIiOiAiXjEuNC41LWx0cy4xIiwKICAgICJub2RlLWNy
b24iOiAiXjMuMC4zIiwKICAgICJwZyI6ICJeOC4xMi4wIiwKICAgICJwaXp6aXAiOiAiXjMuMi4wIgogIH0KfQo=
"@
Write-FileFromBase64 -RelativePath "backend/package.json" -Base64Content $b64

$b64 = @"
Ly8gQ29ycmVjY2nDs24gcHVudHVhbCAoc2VndWltaWVudG8gYSBtYXJjYXJfY2x1YmVzX25vX2FiaWVydG9zLmpzKTogRXNjb2JlZG8sIEl6YXphZ2EgeSBN
ZWx0Ci8vIFBvbGFuY28gc2lndWVuIGVuIGNvbnN0cnVjY2nDs24sIHBlcm8gZWwgcHJpbWVyIHNjcmlwdCBubyBsb3MgZW5jb250csOzIChwcm9iYWJsZW1l
bnRlIGVsCi8vIG5vbWJyZSBleGFjdG8gZW4gZWwgY2F0YWxvZ28gZGUgY2x1YmVzIG5vIGNvaW5jaWRpYSBjYXJhY3RlciBwb3IgY2FyYWN0ZXIgY29uIGVs
IGRlIGxhCi8vIGxpc3RhKSwgYXNpIHF1ZSBzZSBxdWVkYXJvbiBjb24gY2x1Yl9hYmllcnRvID0gdHJ1ZSAoZWwgZGVmYXVsdCkuIEVzdGUgc2NyaXB0IGxv
cyBidXNjYSBwb3IKLy8gY29pbmNpZGVuY2lhIHBhcmNpYWwgKElMSUtFKSBlbiB2ZXogZGUgbm9tYnJlIGV4YWN0bywgcGFyYSBubyBmYWxsYXIgb3RyYSB2
ZXogcG9yIHVuIGFjZW50bywKLy8gZXNwYWNpbyBvIGFicmV2aWF0dXJhIGRpc3RpbnRhLCB5IGxvcyBtYXJjYSBjb21vIGF1biBubyBhYmllcnRvcy4KLy8K
Ly8gRWplY3V0YXIgY29uOgovLyAgIG5vZGUgcHJpc21hL21hcmNhcl9jbHViZXNfZW5fY29uc3RydWNjaW9uLmpzCi8vIFNlZ3VybyBkZSBjb3JyZXIgbWFz
IGRlIHVuYSB2ZXouCgpyZXF1aXJlKCdkb3RlbnYnKS5jb25maWcoKTsKY29uc3QgeyBDbGllbnQgfSA9IHJlcXVpcmUoJ3BnJyk7CgovLyBQYXRyb25lcyBk
ZSBidXNxdWVkYSAocGFyY2lhbCwgaW5zZW5zaWJsZSBhIG1heXVzY3VsYXMvYWNlbnRvcyBubyBnYXJhbnRpemFkbyBwb3IgSUxJS0UgcHVybywKLy8gcGVy
byBjdWJyZSBlbCBjYXNvIGNvbXVuIGRlIHF1ZSBlbCBub21icmUgY29tcGxldG8gbm8gY29pbmNpZGlhIGV4YWN0bykuCmNvbnN0IFBBVFJPTkVTID0gWycl
ZXNjb2JlZG8lJywgJyVpemF6YWdhJScsICclbWVsdCUnXTsKCmFzeW5jIGZ1bmN0aW9uIG1haW4oKSB7CiAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudCh7
IGNvbm5lY3Rpb25TdHJpbmc6IHByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTCB9KTsKICBhd2FpdCBjbGllbnQuY29ubmVjdCgpOwogIGNvbnNvbGUubG9nKGBD
b3JyaWdpZW5kbyBjbHViZXMgZW4gY29uc3RydWNjaW9uIGNvbnRyYSAke3Byb2Nlc3MuZW52LkRBVEFCQVNFX1VSTD8ucmVwbGFjZSgvOlteOkBdK0AvLCAn
OioqKkAnKX0gLi4uYCk7CgogIHRyeSB7CiAgICAvLyAxKSBNb3N0cmFyIHF1ZSBjbHViZXMgZGUgZnJhbnF1aWNpYSBtYXRjaGVhbiBsb3MgcGF0cm9uZXMs
IGNvbiBzdSBlc3RhZG8gYWN0dWFsLCBhbnRlcyBkZSB0b2NhciBuYWRhLgogICAgY29uc3QgeyByb3dzOiBjYW5kaWRhdG9zIH0gPSBhd2FpdCBjbGllbnQu
cXVlcnkoCiAgICAgIGBTRUxFQ1QgY2wuaWQsIGNsLm5vbWJyZSwgZmQuY2x1Yl9hYmllcnRvLCBmZC5mZWNoYV9hcGVydHVyYQogICAgICAgRlJPTSBjbHVi
ZXMgY2wKICAgICAgIEpPSU4gY29udHJhdG9fZnJhbnF1aWNpYV9kZXRhbGxlcyBmZCBPTiBmZC5jbHViX2lkID0gY2wuaWQKICAgICAgIFdIRVJFIGNsLm5v
bWJyZSBJTElLRSBBTlkoJDE6OnRleHRbXSkKICAgICAgIE9SREVSIEJZIGNsLm5vbWJyZWAsCiAgICAgIFtQQVRST05FU10KICAgICk7CiAgICBjb25zb2xl
LmxvZyhgRW5jb250cmFkb3MgJHtjYW5kaWRhdG9zLmxlbmd0aH0gY2x1YihlcykgcXVlIG1hdGNoZWFuIGVzY29iZWRvL2l6YXphZ2EvbWVsdDpgKTsKICAg
IGZvciAoY29uc3QgYyBvZiBjYW5kaWRhdG9zKSB7CiAgICAgIGNvbnNvbGUubG9nKGAgIC0gJHtjLm5vbWJyZX0gfCBjbHViX2FiaWVydG89JHtjLmNsdWJf
YWJpZXJ0b30gfCBmZWNoYV9hcGVydHVyYT0ke2MuZmVjaGFfYXBlcnR1cmEgPz8gJ251bGwnfWApOwogICAgfQoKICAgIGlmICghY2FuZGlkYXRvcy5sZW5n
dGgpIHsKICAgICAgY29uc29sZS53YXJuKCdObyBzZSBlbmNvbnRybyBuaW5ndW4gY2x1YiBjb24gZXNvcyBwYXRyb25lcy4gUmV2aXNhIGVsIG5vbWJyZSBl
eGFjdG8gZW4gZWwgY2F0YWxvZ28gZGUgY2x1YmVzLicpOwogICAgICByZXR1cm47CiAgICB9CgogICAgLy8gMikgTWFyY2FybG9zIGNvbW8gYXVuIG5vIGFi
aWVydG9zIChlbiBjb25zdHJ1Y2Npb24pLgogICAgY29uc3QgeyByb3dzOiBhY3R1YWxpemFkb3MgfSA9IGF3YWl0IGNsaWVudC5xdWVyeSgKICAgICAgYFVQ
REFURSBjb250cmF0b19mcmFucXVpY2lhX2RldGFsbGVzIGZkCiAgICAgICBTRVQgY2x1Yl9hYmllcnRvID0gZmFsc2UsIGZlY2hhX2FwZXJ0dXJhID0gTlVM
TCwgdXBkYXRlZF9hdCA9IG5vdygpCiAgICAgICBGUk9NIGNsdWJlcyBjbAogICAgICAgV0hFUkUgZmQuY2x1Yl9pZCA9IGNsLmlkIEFORCBjbC5ub21icmUg
SUxJS0UgQU5ZKCQxOjp0ZXh0W10pCiAgICAgICBSRVRVUk5JTkcgY2wubm9tYnJlYCwKICAgICAgW1BBVFJPTkVTXQogICAgKTsKICAgIGNvbnNvbGUubG9n
KGBNYXJjYWRvcyBjb21vIGF1biBubyBhYmllcnRvcyAoZW4gY29uc3RydWNjaW9uKTogJHthY3R1YWxpemFkb3MubGVuZ3RofWApOwogICAgZm9yIChjb25z
dCByIG9mIGFjdHVhbGl6YWRvcykgY29uc29sZS5sb2coYCAgLSAke3Iubm9tYnJlfWApOwogIH0gY2F0Y2ggKGVycikgewogICAgY29uc29sZS5lcnJvcign
RXJyb3IgYWwgY29ycmVnaXIgY2x1YmVzIGVuIGNvbnN0cnVjY2lvbjonLCBlcnIubWVzc2FnZSk7CiAgICBwcm9jZXNzLmV4aXRDb2RlID0gMTsKICB9IGZp
bmFsbHkgewogICAgYXdhaXQgY2xpZW50LmVuZCgpOwogIH0KfQoKbWFpbigpOwo=
"@
Write-FileFromBase64 -RelativePath "backend/prisma/marcar_clubes_en_construccion.js" -Base64Content $b64

Write-Host ""
Write-Host "Listo. Archivos escritos. Siguiente paso:"
Write-Host "  git add -A"
Write-Host "  git commit -m 'Agregar script para marcar Escobedo/Izazaga/Melt Polanco en construccion'"
Write-Host "  git push"
Write-Host ""
Write-Host "Despues, desde backend/ con la DATABASE_URL de produccion en un .env local:"
Write-Host "  npm run fix:franquicias-en-construccion"