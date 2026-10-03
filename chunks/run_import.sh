#!/usr/bin/env bash
#
# Corre la importación de Arrendamientos directamente contra Neon via psql,
# evitando el editor SQL web de Neon (que tiene un bug reproducible con
# ciertos strings largos -> "unterminated quoted string").
#
# Uso:
#   1) Copia este script a la carpeta donde tienes los 43 archivos
#      part01_chunk01.sql ... part06_chunk06.sql (el zip que te mandé).
#   2) Exporta tu DATABASE_URL (la misma que está en backend/.env), p.ej.:
#        export DATABASE_URL="postgresql://usuario:password@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
#   3) Corre:  ./run_import.sh
#      (por default empieza en part01_chunk02.sql porque part01_chunk01.sql
#       ya se importó exitosamente la primera vez que lo corriste a mano)
#
#      Si quieres forzar un punto de inicio distinto:
#        ./run_import.sh part03_chunk01.sql
#
# El script se detiene en el primer error (cada chunk es su propia
# transacción BEGIN/COMMIT, así que nunca deja datos a medias) e imprime
# exactamente qué archivo falló para que me lo reportes.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: define la variable DATABASE_URL antes de correr este script."
  echo '  export DATABASE_URL="postgresql://...tu connection string de Neon..."'
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: no encontré 'psql' instalado en esta máquina."
  echo "  macOS:   brew install libpq && brew link --force libpq"
  echo "  Ubuntu:  sudo apt-get install postgresql-client"
  exit 1
fi

START_FROM="${1:-part01_chunk02.sql}"

# Lista todos los chunks en orden correcto (part01_chunk01 ... part06_chunk06)
mapfile -t ALL_CHUNKS < <(ls part*_chunk*.sql 2>/dev/null | sort)

if [[ ${#ALL_CHUNKS[@]} -eq 0 ]]; then
  echo "ERROR: no encontré archivos part*_chunk*.sql en este directorio."
  echo "Corre este script desde la carpeta donde descomprimiste los chunks."
  exit 1
fi

echo "Encontré ${#ALL_CHUNKS[@]} archivos de chunk."
echo "Empezando desde: $START_FROM"
echo ""

STARTED=0
COUNT_OK=0
for f in "${ALL_CHUNKS[@]}"; do
  if [[ "$f" == "$START_FROM" ]]; then
    STARTED=1
  fi
  if [[ "$STARTED" -eq 0 ]]; then
    continue
  fi

  echo "-> Ejecutando $f ..."
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; then
    echo "   OK ($f)"
    COUNT_OK=$((COUNT_OK + 1))
  else
    echo ""
    echo "============================================================"
    echo "FALLÓ: $f"
    echo "Como cada chunk corre en su propia transacción BEGIN/COMMIT,"
    echo "nada de este archivo quedó guardado a medias. No lo reintentes"
    echo "solo -- avísame cuál archivo fue y seguimos desde ahí."
    echo "============================================================"
    exit 1
  fi
done

echo ""
echo "Listo. $COUNT_OK chunks importados sin error en esta corrida."
