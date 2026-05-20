#!/usr/bin/env bash
# Script de arranque para Render / Railway / cualquier PaaS.
# Tolerante a fallos: si algún paso ya está hecho, continúa al siguiente.

set -e

echo "▶ Inicializando esquema de BD (tablas nuevas)..."
flask init-db || echo "  (esquema ya existente)"

echo "▶ Actualizando esquema de tablas modificadas..."
flask upgrade-schema || echo "  (no hubo cambios o falló silenciosamente)"

echo "▶ Creando admin si no existe..."
flask create-admin || echo "  (admin ya existe)"

echo "▶ Cargando seeds (errores + directorio + pólizas demo)..."
flask seed-all --replace-errors || echo "  (algo falló en seeds, revisa logs)"

echo "▶ Arrancando Gunicorn en puerto ${PORT:-5000}..."
exec gunicorn --workers 2 --timeout 120 --bind "0.0.0.0:${PORT:-5000}" wsgi:app
