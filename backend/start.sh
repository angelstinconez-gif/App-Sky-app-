#!/usr/bin/env bash
# Script de arranque para Render / Railway / cualquier PaaS.
# IMPORTANTE: ningún paso elimina datos del usuario. Todo es UPSERT idempotente.
# Cada paso tiene timeout para que ningún cuelgue de BD bloquee gunicorn.

# NO usamos set -e — preferimos continuar arrancando aunque algún paso falle

run_with_timeout() {
  local seconds=$1
  shift
  echo "▶ $*"
  timeout "${seconds}s" "$@"
  local rc=$?
  if [ $rc -eq 124 ]; then
    echo "  ⏱️  TIMEOUT (${seconds}s) — continuamos para no bloquear el arranque"
  elif [ $rc -ne 0 ]; then
    echo "  ⚠️  paso falló (rc=$rc) — continuamos"
  else
    echo "  ✓ ok"
  fi
  return 0
}

run_with_timeout 30 flask init-db
run_with_timeout 60 flask upgrade-schema
run_with_timeout 20 flask create-admin
run_with_timeout 120 flask seed-all
run_with_timeout 60 flask dedupe

echo "▶ Arrancando Gunicorn en puerto ${PORT:-5000}..."
exec gunicorn --workers 2 --timeout 120 --bind "0.0.0.0:${PORT:-5000}" wsgi:app
