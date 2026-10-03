# ============================================================================
# Script de entrega: diagnostico de solo lectura de contratos de franquicia
# ============================================================================
# El fix anterior (ILIKE escobedo/izazaga/melt) encontro 0 clubes. Este script
# NO modifica nada -- solo lista cada contrato de franquicia con el nombre real
# del club (o "(sin club_id)" si el contrato aun no tiene club asignado) para
# saber por que Escobedo/Izazaga/Melt Polanco no aparecieron.
#
# Como usarlo:
#   1) Corre este script desde la raiz del repo (fpt-contratos) en PowerShell.
#   2) git add -A ; git commit -m "..." ; git push
#   3) Con la DATABASE_URL de produccion en un .env local dentro de backend/:
#        npm run listar:franquicias
#   4) Copia y pegame la salida completa (o al menos las lineas de esos 3
#      clubes / las que digan "(sin club_id)") para corregir el fix con el
#      nombre o criterio correcto.
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

Write-Host "Agregando script de diagnostico (solo lectura)..."

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
bi5qcyIsCiAgICAibGlzdGFyOmZyYW5xdWljaWFzIjogIm5vZGUgcHJpc21hL2xpc3Rhcl9mcmFucXVpY2lhcy5qcyIKICB9LAogICJkZXBlbmRlbmNpZXMi
OiB7CiAgICAiYmNyeXB0IjogIl42LjAuMCIsCiAgICAiY29ycyI6ICJeMi44LjUiLAogICAgImRvY3h0ZW1wbGF0ZXIiOiAiXjMuNjkuMyIsCiAgICAiZG90
ZW52IjogIl4xNi40LjUiLAogICAgImV4cHJlc3MiOiAiXjQuMTkuMiIsCiAgICAiZXhwcmVzcy1hc3luYy1lcnJvcnMiOiAiXjMuMS4xIiwKICAgICJqc29u
d2VidG9rZW4iOiAiXjkuMC4yIiwKICAgICJtdWx0ZXIiOiAiXjEuNC41LWx0cy4xIiwKICAgICJub2RlLWNyb24iOiAiXjMuMC4zIiwKICAgICJwZyI6ICJe
OC4xMi4wIiwKICAgICJwaXp6aXAiOiAiXjMuMi4wIgogIH0KfQo=
"@
Write-FileFromBase64 -RelativePath "backend/package.json" -Base64Content $b64

$b64 = @"
Ly8gRGlhZ25vc3RpY28gKGRlIHNvbG8gbGVjdHVyYSwgbm8gbW9kaWZpY2EgbmFkYSk6IGxpc3RhIHRvZG9zIGxvcyBjb250cmF0b3MgZGUgZnJhbnF1aWNp
YQovLyBjb24gc3UgY2x1YiBhc29jaWFkbyAoc2kgdGllbmUpLCBjbHViX2FiaWVydG8geSBmZWNoYV9hcGVydHVyYSwgcGFyYSBlbmNvbnRyYXIgcG9yIHF1
ZQovLyBFc2NvYmVkby9JemF6YWdhL01lbHQgUG9sYW5jbyBubyBtYXRjaGVhcm9uIHBvciBub21icmUgKElMSUtFKSBuaSBhbnRlcyBwb3Igbm9tYnJlIGV4
YWN0by4KLy8gUG9zaWJsZXMgY2F1c2FzIGEgY29uZmlybWFyIGNvbiBlc3RhIGxpc3RhOgovLyAgIC0gRWwgbm9tYnJlIHJlYWwgZW4gZWwgY2F0YWxvZ28g
ZGUgY2x1YmVzIGVzIGRpc3RpbnRvIGFsIHF1ZSBzZSBhc3VtaW8uCi8vICAgLSBFbCBjb250cmF0byBkZSBmcmFucXVpY2lhIHRvZGF2aWEgbm8gdGllbmUg
Y2x1Yl9pZCBhc2lnbmFkbyAoTlVMTCkgLS0gY29tbW9uIHNpIGVsIGNsdWIKLy8gICAgIGZpc2ljbyAoZW4gY29uc3RydWNjaW9uKSBuaSBzaXF1aWVyYSBl
c3RhIGRhZG8gZGUgYWx0YSBlbiBlbCBjYXRhbG9nbyBkZSBjbHViZXMuCi8vCi8vIEVqZWN1dGFyIGNvbjoKLy8gICBub2RlIHByaXNtYS9saXN0YXJfZnJh
bnF1aWNpYXMuanMKCnJlcXVpcmUoJ2RvdGVudicpLmNvbmZpZygpOwpjb25zdCB7IENsaWVudCB9ID0gcmVxdWlyZSgncGcnKTsKCmFzeW5jIGZ1bmN0aW9u
IG1haW4oKSB7CiAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudCh7IGNvbm5lY3Rpb25TdHJpbmc6IHByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTCB9KTsKICBh
d2FpdCBjbGllbnQuY29ubmVjdCgpOwogIGNvbnNvbGUubG9nKGBMaXN0YW5kbyBjb250cmF0b3MgZGUgZnJhbnF1aWNpYSBjb250cmEgJHtwcm9jZXNzLmVu
di5EQVRBQkFTRV9VUkw/LnJlcGxhY2UoLzpbXjpAXStALywgJzoqKipAJyl9IC4uLlxuYCk7CgogIHRyeSB7CiAgICBjb25zdCB7IHJvd3MgfSA9IGF3YWl0
IGNsaWVudC5xdWVyeSgKICAgICAgYFNFTEVDVCBjLmZvbGlvLCBjLnRpdHVsbywgYy5lc3RhdHVzLCBjbC5ub21icmUgQVMgY2x1Yl9ub21icmUsIGZkLmNs
dWJfaWQsCiAgICAgICAgICAgICAgZmQuY2x1Yl9hYmllcnRvLCBmZC5mZWNoYV9hcGVydHVyYSwgZmQuZmVjaGFfbGltaXRlX2FwZXJ0dXJhCiAgICAgICBG
Uk9NIGNvbnRyYXRvcyBjCiAgICAgICBKT0lOIHRpcG9zX2NvbnRyYXRvIHRjIE9OIHRjLmlkID0gYy50aXBvX2NvbnRyYXRvX2lkCiAgICAgICBKT0lOIGNv
bnRyYXRvX2ZyYW5xdWljaWFfZGV0YWxsZXMgZmQgT04gZmQuY29udHJhdG9faWQgPSBjLmlkCiAgICAgICBMRUZUIEpPSU4gY2x1YmVzIGNsIE9OIGNsLmlk
ID0gZmQuY2x1Yl9pZAogICAgICAgV0hFUkUgdGMuZXNfZnJhbnF1aWNpYSA9IHRydWUKICAgICAgIE9SREVSIEJZIGNsLm5vbWJyZSBOVUxMUyBGSVJTVCwg
Yy5mb2xpb2AKICAgICk7CiAgICBjb25zb2xlLmxvZyhgVG90YWwgZGUgY29udHJhdG9zIGRlIGZyYW5xdWljaWE6ICR7cm93cy5sZW5ndGh9XG5gKTsKICAg
IGZvciAoY29uc3QgciBvZiByb3dzKSB7CiAgICAgIGNvbnNvbGUubG9nKAogICAgICAgIGAke3IuZm9saW99IHwgY2x1Yj0iJHtyLmNsdWJfbm9tYnJlID8/
ICcoc2luIGNsdWJfaWQpJ30iIHwgYWJpZXJ0bz0ke3IuY2x1Yl9hYmllcnRvfSB8IGAgKwogICAgICAgIGBmZWNoYV9hcGVydHVyYT0ke3IuZmVjaGFfYXBl
cnR1cmEgPz8gJ251bGwnfSB8IGZlY2hhX2xpbWl0ZT0ke3IuZmVjaGFfbGltaXRlX2FwZXJ0dXJhID8/ICdudWxsJ30gfCBlc3RhdHVzPSR7ci5lc3RhdHVz
fWAKICAgICAgKTsKICAgIH0KICB9IGNhdGNoIChlcnIpIHsKICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFsIGxpc3RhciBmcmFucXVpY2lhczonLCBlcnIu
bWVzc2FnZSk7CiAgICBwcm9jZXNzLmV4aXRDb2RlID0gMTsKICB9IGZpbmFsbHkgewogICAgYXdhaXQgY2xpZW50LmVuZCgpOwogIH0KfQoKbWFpbigpOwo=
"@
Write-FileFromBase64 -RelativePath "backend/prisma/listar_franquicias.js" -Base64Content $b64

Write-Host ""
Write-Host "Listo. Archivos escritos. Siguiente paso:"
Write-Host "  git add -A"
Write-Host "  git commit -m 'Agregar script de diagnostico de contratos de franquicia'"
Write-Host "  git push"
Write-Host ""
Write-Host "Despues, desde backend/ con la DATABASE_URL de produccion en un .env local:"
Write-Host "  npm run listar:franquicias"
Write-Host ""
Write-Host "Copia y pega la salida completa (o al menos las lineas de Escobedo/Izazaga/Melt"
Write-Host "Polanco, o las que digan '(sin club_id)')."