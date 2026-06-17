"""Endpoints temporales para arreglos de schema en producción cuando NO se tiene shell.

Solo accesibles para admin. Pensados para usarse 1-2 veces y luego se borran.
"""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import text

from app import db
from app.utils.decorators import role_required

bp = Blueprint("admin_fix", __name__)


@bp.route("/drop-uq-proj-year-week", methods=["GET", "POST"])
@jwt_required()
@role_required("admin")
def drop_uq_proj_year_week():
    """Elimina el constraint UNIQUE (project, year, week) heredado del modo semanal.
    Necesario para poder guardar revisiones diarias.
    """
    results = []
    attempts = [
        "ALTER TABLE revisiones_semanales DROP CONSTRAINT IF EXISTS uq_proj_year_week",
        "ALTER TABLE revisiones_semanales DROP CONSTRAINT uq_proj_year_week",
        "DROP INDEX IF EXISTS uq_proj_year_week",
    ]
    dropped = False
    for stmt in attempts:
        try:
            with db.engine.begin() as conn:
                conn.execute(text(stmt))
            results.append({"sql": stmt, "ok": True})
            dropped = True
            break
        except Exception as e:
            results.append({"sql": stmt, "ok": False, "error": str(e)[:200]})

    # Fallback: buscar constraints por columnas y dropear por nombre
    if not dropped:
        try:
            from sqlalchemy import inspect
            insp = inspect(db.engine)
            for u in insp.get_unique_constraints("revisiones_semanales"):
                cols = set(u.get("column_names") or [])
                if cols == {"project", "year", "week"}:
                    name = u.get("name")
                    if name:
                        try:
                            with db.engine.begin() as conn:
                                conn.execute(text(
                                    f'ALTER TABLE revisiones_semanales DROP CONSTRAINT "{name}"'
                                ))
                            results.append({"sql": f"DROP CONSTRAINT {name}", "ok": True})
                            dropped = True
                        except Exception as e:
                            results.append({"sql": f"DROP CONSTRAINT {name}", "ok": False, "error": str(e)[:200]})
        except Exception as e:
            results.append({"sql": "inspect", "ok": False, "error": str(e)[:200]})

    return jsonify(success=dropped, attempts=results)


@bp.route("/health", methods=["GET"])
@jwt_required()
@role_required("admin")
def admin_health():
    """Comprueba si el constraint sigue existiendo."""
    try:
        from sqlalchemy import inspect
        insp = inspect(db.engine)
        uniques = insp.get_unique_constraints("revisiones_semanales")
        return jsonify(
            constraints=[{"name": u.get("name"), "columns": u.get("column_names")} for u in uniques],
        )
    except Exception as e:
        return jsonify(error=str(e)), 500
