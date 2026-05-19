#!/usr/bin/env bash
# Script de arranque para Render / Railway / cualquier PaaS.
# Tolerante a fallos: si la DB ya existe o el admin ya está creado, continúa.

set -e

echo "▶ Inicializando esquema de BD..."
flask init-db || echo "  (esquema ya existente, se omite)"

echo "▶ Creando admin si no existe..."
flask create-admin || echo "  (admin ya existe)"

# Comenta la siguiente línea si NO quieres cargar datos de demostración:
echo "▶ Cargando seeds (errores catálogo, pólizas demo)..."
flask seed-all || echo "  (seeds ya cargados)"

echo "▶ Arrancando Gunicorn en puerto ${PORT:-5000}..."
exec gunicorn --workers 2 --timeout 120 --bind "0.0.0.0:${PORT:-5000}" wsgi:app
