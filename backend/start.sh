#!/usr/bin/env bash
# Script de arranque para Render / Railway / cualquier PaaS.
# IMPORTANTE: ningún paso elimina datos del usuario. Todo es UPSERT idempotente.

set -e

echo "▶ Inicializando esquema de BD (tablas nuevas)..."
flask init-db || echo "  (esquema ya existente)"

echo "▶ Migrando columnas nuevas (ALTER TABLE seguros)..."
flask upgrade-schema || echo "  (no hubo cambios)"

echo "▶ Creando admin si no existe..."
flask create-admin || echo "  (admin ya existe)"

# Carga seeds SIN flag --replace-errors (UPSERT puro).
# Esto añade los códigos nuevos y actualiza los del catálogo oficial,
# pero NO borra los que tú hayas creado a mano en la plataforma.
echo "▶ Cargando/actualizando catálogos (UPSERT, sin borrar datos del usuario)..."
flask seed-all || echo "  (algo falló en seeds, revisa logs)"

# El dedupe sólo elimina filas con clave duplicada (mismo code/proyecto),
# preservando el id más bajo. Es seguro.
echo "▶ Limpiando duplicados..."
flask dedupe || echo "  (no se pudo deduplicar)"

echo "▶ Arrancando Gunicorn en puerto ${PORT:-5000}..."
exec gunicorn --workers 2 --timeout 120 --bind "0.0.0.0:${PORT:-5000}" wsgi:app
