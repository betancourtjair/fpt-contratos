# ============================================================================
# Script de entrega: marcar Gransur y Multiplaza Las Palmas con fecha real
# ============================================================================
# Confirmado: ambos abrieron el 29 de diciembre de 2026, aunque su fecha limite
# ya habia pasado. Este script los marca como abiertos con esa fecha real.
#
# IMPORTANTE -- orden de ejecucion:
#   1) Primero corre (si no lo has hecho ya) el fix de fechas futuras que te
#      mande antes: npm run fix:franquicias-fechas-futuras
#   2) Luego corre este: npm run fix:franquicias-aperturas-confirmadas
# Si lo corres al reves, el paso 1 deshace la correccion de este script.
#
# Como usarlo:
#   1) Corre este script desde la raiz del repo (fpt-contratos) en PowerShell.
#   2) git add -A ; git commit -m "..." ; git push
#   3) Con la DATABASE_URL de produccion en un .env local dentro de backend/,
#      en este orden:
#        npm run fix:franquicias-fechas-futuras
#        npm run fix:franquicias-aperturas-confirmadas
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

Write-Host "Agregando correccion de aperturas confirmadas..."

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
bi5qcyIsCiAgICAibGlzdGFyOmZyYW5xdWljaWFzIjogIm5vZGUgcHJpc21hL2xpc3Rhcl9mcmFucXVpY2lhcy5qcyIsCiAgICAiZml4OmZyYW5xdWljaWFz
LWZlY2hhcy1mdXR1cmFzIjogIm5vZGUgcHJpc21hL2NvcnJlZ2lyX2ZlY2hhc19mdXR1cmFzLmpzIiwKICAgICJmaXg6ZnJhbnF1aWNpYXMtYXBlcnR1cmFz
LWNvbmZpcm1hZGFzIjogIm5vZGUgcHJpc21hL21hcmNhcl9hcGVydHVyYXNfY29uZmlybWFkYXMuanMiCiAgfSwKICAiZGVwZW5kZW5jaWVzIjogewogICAg
ImJjcnlwdCI6ICJeNi4wLjAiLAogICAgImNvcnMiOiAiXjIuOC41IiwKICAgICJkb2N4dGVtcGxhdGVyIjogIl4zLjY5LjMiLAogICAgImRvdGVudiI6ICJe
MTYuNC41IiwKICAgICJleHByZXNzIjogIl40LjE5LjIiLAogICAgImV4cHJlc3MtYXN5bmMtZXJyb3JzIjogIl4zLjEuMSIsCiAgICAianNvbndlYnRva2Vu
IjogIl45LjAuMiIsCiAgICAibXVsdGVyIjogIl4xLjQuNS1sdHMuMSIsCiAgICAibm9kZS1jcm9uIjogIl4zLjAuMyIsCiAgICAicGciOiAiXjguMTIuMCIs
CiAgICAicGl6emlwIjogIl4zLjIuMCIKICB9Cn0K
"@
Write-FileFromBase64 -RelativePath "backend/package.json" -Base64Content $b64

$b64 = @"
Ly8gQ29ycmVjY2lvbiBwdW50dWFsIGNvbiBmZWNoYXMgcmVhbGVzIGNvbmZpcm1hZGFzIHBvciBKYWlyICgyMDI2LTEwLTAzKToKLy8gICAtIEdyYW5zdXIs
IENETVg6IGFicmlvIGVsIDI5IGRlIGRpY2llbWJyZSBkZSAyMDI2LgovLyAgIC0gTXVsdGlwbGF6YSBMYXMgUGFsbWFzLCBHUk86IGFicmlvIGVsIDI5IGRl
IGRpY2llbWJyZSBkZSAyMDI2LgovLyAoT2F4YWNhIChDb2wgZGVsIE1hZXN0cm8pLCBQbGF5YSBkZWwgQ2FybWVuIChNaXNpb24gbGFzIEZsb3JlcykgeSBT
YWx0aWxsbyAoRWNoZXZlcnJpYSkKLy8gc2lndWVuIFNJTiBhYnJpciAtLSBlc29zIHlhIHF1ZWRhbiBlbiBmYWxzZSBjb24gY29ycmVnaXJfZmVjaGFzX2Z1
dHVyYXMuanMsIG5vIG5lY2VzaXRhbgovLyBuYWRhIGFxdWkuKQovLwovLyBJTVBPUlRBTlRFOiBlc3RlIHNjcmlwdCBkZWJlIGNvcnJlcnNlIERFU1BVRVMg
ZGUgY29ycmVnaXJfZmVjaGFzX2Z1dHVyYXMuanMuIEVzZSBzY3JpcHQKLy8gbWFyY2EgY29tbyBuby1hYmllcnRvcyBhIHRvZG9zIGxvcyBjbHViZXMgY29u
IGZlY2hhIGxpbWl0ZSBlbiBlbCBmdXR1cm8gKGluY2x1eWVuZG8gZXN0b3MKLy8gMiksIHkgZXN0ZSBsbyB2dWVsdmUgYSBhYnJpciBleHBsaWNpdGFtZW50
ZSBjb24gbGEgZmVjaGEgcmVhbCBxdWUgeWEgc2UgY29uZmlybW8uIFNpIHNlCi8vIGNvcnJlIGVuIGVsIG9yZGVuIGNvbnRyYXJpbywgY29ycmVnaXJfZmVj
aGFzX2Z1dHVyYXMuanMgZGVzaGFjZSBlc3RhIGNvcnJlY2Npb24uCi8vCi8vIEVqZWN1dGFyIGNvbiAoZW4gZXN0ZSBvcmRlbik6Ci8vICAgbm9kZSBwcmlz
bWEvY29ycmVnaXJfZmVjaGFzX2Z1dHVyYXMuanMKLy8gICBub2RlIHByaXNtYS9tYXJjYXJfYXBlcnR1cmFzX2NvbmZpcm1hZGFzLmpzCi8vIFNlZ3VybyBk
ZSBjb3JyZXIgbWFzIGRlIHVuYSB2ZXouCgpyZXF1aXJlKCdkb3RlbnYnKS5jb25maWcoKTsKY29uc3QgeyBDbGllbnQgfSA9IHJlcXVpcmUoJ3BnJyk7Cgpj
b25zdCBBUEVSVFVSQVNfQ09ORklSTUFEQVMgPSB7CiAgJ0dyYW5zdXIsIENETVgnOiAnMjAyNi0xMi0yOScsCiAgJ011bHRpcGxhemEgTGFzIFBhbG1hcywg
R1JPJzogJzIwMjYtMTItMjknLAp9OwoKYXN5bmMgZnVuY3Rpb24gbWFpbigpIHsKICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KHsgY29ubmVjdGlvblN0
cmluZzogcHJvY2Vzcy5lbnYuREFUQUJBU0VfVVJMIH0pOwogIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7CiAgY29uc29sZS5sb2coYE1hcmNhbmRvIGFwZXJ0
dXJhcyBjb25maXJtYWRhcyBjb250cmEgJHtwcm9jZXNzLmVudi5EQVRBQkFTRV9VUkw/LnJlcGxhY2UoLzpbXjpAXStALywgJzoqKipAJyl9IC4uLlxuYCk7
CgogIHRyeSB7CiAgICBmb3IgKGNvbnN0IFtub21icmUsIGZlY2hhXSBvZiBPYmplY3QuZW50cmllcyhBUEVSVFVSQVNfQ09ORklSTUFEQVMpKSB7CiAgICAg
IGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgY2xpZW50LnF1ZXJ5KAogICAgICAgIGBVUERBVEUgY29udHJhdG9fZnJhbnF1aWNpYV9kZXRhbGxlcyBmZAogICAg
ICAgICBTRVQgY2x1Yl9hYmllcnRvID0gdHJ1ZSwgZmVjaGFfYXBlcnR1cmEgPSAkMiwgdXBkYXRlZF9hdCA9IG5vdygpCiAgICAgICAgIEZST00gY2x1YmVz
IGNsCiAgICAgICAgIFdIRVJFIGZkLmNsdWJfaWQgPSBjbC5pZCBBTkQgY2wubm9tYnJlID0gJDEKICAgICAgICAgUkVUVVJOSU5HIGNsLm5vbWJyZWAsCiAg
ICAgICAgW25vbWJyZSwgZmVjaGFdCiAgICAgICk7CiAgICAgIGlmIChyb3dzLmxlbmd0aCkgY29uc29sZS5sb2coYE1hcmNhZG8gY29tbyBhYmllcnRvICgk
e2ZlY2hhfSk6ICR7bm9tYnJlfWApOwogICAgICBlbHNlIGNvbnNvbGUud2FybihgTm8gc2UgZW5jb250cm8gKHJldmlzYXIgbm9tYnJlIGV4YWN0byBlbiBl
bCBjYXRhbG9nbyBkZSBjbHViZXMpOiAke25vbWJyZX1gKTsKICAgIH0KICB9IGNhdGNoIChlcnIpIHsKICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGFsIG1h
cmNhciBhcGVydHVyYXMgY29uZmlybWFkYXM6JywgZXJyLm1lc3NhZ2UpOwogICAgcHJvY2Vzcy5leGl0Q29kZSA9IDE7CiAgfSBmaW5hbGx5IHsKICAgIGF3
YWl0IGNsaWVudC5lbmQoKTsKICB9Cn0KCm1haW4oKTsK
"@
Write-FileFromBase64 -RelativePath "backend/prisma/marcar_aperturas_confirmadas.js" -Base64Content $b64

Write-Host ""
Write-Host "Listo. Archivos escritos. Siguiente paso:"
Write-Host "  git add -A"
Write-Host "  git commit -m 'Agregar fecha real de apertura de Gransur y Multiplaza Las Palmas'"
Write-Host "  git push"
Write-Host ""
Write-Host "Despues, desde backend/ con la DATABASE_URL de produccion en un .env local, EN ESTE ORDEN:"
Write-Host "  npm run fix:franquicias-fechas-futuras"
Write-Host "  npm run fix:franquicias-aperturas-confirmadas"