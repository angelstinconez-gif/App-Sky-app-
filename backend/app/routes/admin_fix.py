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


@bp.route("/add-garantias-creado-por", methods=["GET", "POST"])
@jwt_required()
@role_required("admin")
def add_garantias_creado_por():
    """Añade columnas creado_por / creado_por_email a garantias si no existen."""
    from sqlalchemy import inspect
    insp = inspect(db.engine)
    if not insp.has_table("garantias"):
        return jsonify(error="tabla garantias no existe"), 404
    cols = {c["name"] for c in insp.get_columns("garantias")}
    results = []
    for col, ddl in [
        ("creado_por",       "ALTER TABLE garantias ADD COLUMN creado_por VARCHAR(160)"),
        ("creado_por_email", "ALTER TABLE garantias ADD COLUMN creado_por_email VARCHAR(180)"),
    ]:
        if col in cols:
            results.append({"col": col, "status": "ya existe"})
            continue
        try:
            with db.engine.begin() as conn:
                conn.execute(text(ddl))
            results.append({"col": col, "status": "creada"})
        except Exception as e:
            results.append({"col": col, "status": f"error: {str(e)[:120]}"})
    return jsonify(success=True, results=results)


@bp.route("/reset-admin-password", methods=["POST", "GET"])
def reset_admin_password():
    """Resetea la password del admin usando una clave secreta del env var.
    NO requiere JWT — pensado para cuando no puedes entrar.

    Body o query: { secret, email, new_password }
    El 'secret' debe coincidir con la env var RESET_SECRET de Render.
    Si la env var no está configurada, el endpoint está deshabilitado.
    """
    import os
    from app.models.user import User
    expected_secret = os.environ.get("RESET_SECRET")
    if not expected_secret:
        return jsonify(
            error="disabled",
            message="Configura la env var RESET_SECRET en Render para habilitar este endpoint."
        ), 403

    data = request.get_json(silent=True) or request.args.to_dict()
    secret = data.get("secret")
    email = (data.get("email") or "").strip().lower()
    new_password = data.get("new_password") or data.get("password")

    if secret != expected_secret:
        return jsonify(error="bad_secret", message="Secret incorrecto"), 403
    if not email or not new_password:
        return jsonify(error="missing", message="Se requiere email y new_password"), 400
    if len(new_password) < 6:
        return jsonify(error="weak", message="Mínimo 6 caracteres"), 400

    u = User.query.filter_by(email=email).first()
    if not u:
        return jsonify(error="not_found", message=f"Usuario {email} no existe"), 404

    u.set_password(new_password)
    db.session.commit()
    return jsonify(success=True, message=f"Password reseteada para {email}")


@bp.route("/dedupe-garantias", methods=["POST"])
@jwt_required()
@role_required("admin")
def dedupe_garantias():
    """Elimina duplicados de garantías por (project, ticket, error, sn).
    Conserva el ID más bajo. Devuelve cuántos eliminó."""
    from app.models.garantia import Garantia
    def _norm(s):
        return (s or "").strip().lower()
    seen, to_del = set(), []
    for g in Garantia.query.order_by(Garantia.id.asc()).all():
        k = (_norm(g.project), _norm(g.ticket), _norm(g.error), _norm(g.sn))
        # Si todos están vacíos, no es un duplicado real, skip
        if all(not x for x in k):
            continue
        if k in seen:
            to_del.append(g.id)
            db.session.delete(g)
        else:
            seen.add(k)
    db.session.commit()
    return jsonify(success=True, eliminados=len(to_del), ids=to_del[:50])
