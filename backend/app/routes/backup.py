"""Backup y restore manual de la base de datos a JSON.

Solo admin. Pensado para guardar respaldos locales cuando la BD free de Render
expira y los datos se pierden.

Endpoints:
  GET  /api/backup/download        → descarga JSON con todas las tablas (admin)
  POST /api/backup/restore         → recibe JSON y repuebla la BD (admin)
  GET  /api/backup/stats           → cuenta filas por tabla (rápido, para verificar)
"""
import json
from datetime import datetime, date
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import jwt_required

from app import db
from app.utils.decorators import role_required

bp = Blueprint("backup", __name__)


# Tablas que NO respaldamos (catálogos auto-sembrados o info volátil)
SKIP_TABLES = {
    "ai_conversations",       # historial de chat IA, no crítico
    "notification_log",        # logs de notifs
    "notification_subscriptions",
    "historial",               # log de cambios (puede ser grande)
}


def _serialize_row(row):
    """Convierte una fila de SQLAlchemy a dict JSON-serializable."""
    out = {}
    for c in row.__table__.columns:
        v = getattr(row, c.name)
        if isinstance(v, (datetime, date)):
            out[c.name] = v.isoformat()
        elif isinstance(v, bytes):
            # No incluir blobs grandes (fotos checklist, etc.)
            out[c.name] = "__BINARY__"
        else:
            out[c.name] = v
    return out


def _all_models():
    """Devuelve lista de modelos a respaldar (todos los que tiene la app menos los excluidos)."""
    models = []
    for m in db.Model.registry.mappers:
        cls = m.class_
        tbl = cls.__tablename__
        if tbl in SKIP_TABLES:
            continue
        models.append((tbl, cls))
    return models


@bp.route("/stats", methods=["GET"])
@jwt_required()
@role_required("admin")
def backup_stats():
    """Cuenta filas por tabla para que sepas qué hay antes de descargar."""
    stats = {}
    total = 0
    for tbl, cls in _all_models():
        try:
            n = cls.query.count()
            stats[tbl] = n
            total += n
        except Exception as e:
            stats[tbl] = f"error: {str(e)[:60]}"
    return jsonify(total=total, tablas=stats)


@bp.route("/download", methods=["GET"])
@jwt_required()
@role_required("admin")
def backup_download():
    """Descarga un JSON con todo el contenido de la BD."""
    dump = {
        "_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "format_version": "1.0",
            "app": "SkySense Centro de Incidencias",
        },
        "tables": {},
    }
    for tbl, cls in _all_models():
        try:
            rows = cls.query.all()
            dump["tables"][tbl] = [_serialize_row(r) for r in rows]
        except Exception as e:
            dump["tables"][tbl] = {"__error__": str(e)[:200]}

    data = json.dumps(dump, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    buf = BytesIO(data)
    fname = f"skysense_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    return send_file(
        buf,
        mimetype="application/json",
        as_attachment=True,
        download_name=fname,
    )


@bp.route("/restore", methods=["POST"])
@jwt_required()
@role_required("admin")
def backup_restore():
    """Restaura un JSON de backup. UPSERT por id si existe, INSERT si no.

    Body: JSON del backup (se acepta como JSON body o como archivo en 'file').
    Query param: ?wipe=1 → vacía cada tabla antes de restaurar (peligroso pero limpio).
    """
    wipe = request.args.get("wipe") in ("1", "true", "yes")

    # Aceptar JSON crudo o archivo
    if request.files.get("file"):
        try:
            dump = json.loads(request.files["file"].read())
        except Exception as e:
            return jsonify(error="bad_file", message=str(e)), 400
    else:
        dump = request.get_json(silent=True)

    if not dump or "tables" not in dump:
        return jsonify(error="invalid_backup", message="JSON sin sección 'tables'"), 400

    models_by_tbl = {tbl: cls for tbl, cls in _all_models()}
    results = {}

    for tbl, rows in dump.get("tables", {}).items():
        cls = models_by_tbl.get(tbl)
        if not cls:
            results[tbl] = "ignorada (tabla no existe en la app actual)"
            continue
        if isinstance(rows, dict) and "__error__" in rows:
            results[tbl] = f"saltada: {rows['__error__']}"
            continue
        if not isinstance(rows, list):
            results[tbl] = "saltada (formato no es lista)"
            continue

        try:
            if wipe:
                cls.query.delete()
                db.session.flush()

            insertadas = 0
            actualizadas = 0
            erroneas = 0
            col_names = {c.name for c in cls.__table__.columns}
            date_cols = {c.name for c in cls.__table__.columns
                         if "DATE" in str(c.type).upper() or "TIMESTAMP" in str(c.type).upper()}

            for r in rows:
                try:
                    # Solo columnas que existen + skip binarios
                    clean = {}
                    for k, v in r.items():
                        if k not in col_names:
                            continue
                        if v == "__BINARY__":
                            continue
                        # Parsear fechas
                        if k in date_cols and isinstance(v, str) and v:
                            try:
                                from dateutil import parser as _parser
                                v = _parser.parse(v)
                            except Exception:
                                try:
                                    v = datetime.fromisoformat(v)
                                except Exception:
                                    pass
                        clean[k] = v

                    row_id = clean.get("id")
                    existing = None
                    if row_id and not wipe:
                        existing = db.session.get(cls, row_id)
                    if existing:
                        for k, v in clean.items():
                            if k != "id":
                                setattr(existing, k, v)
                        actualizadas += 1
                    else:
                        obj = cls(**clean)
                        db.session.add(obj)
                        insertadas += 1
                except Exception:
                    erroneas += 1
                    db.session.rollback()

            db.session.commit()
            results[tbl] = {
                "insertadas": insertadas,
                "actualizadas": actualizadas,
                "erroneas": erroneas,
            }
        except Exception as e:
            db.session.rollback()
            results[tbl] = f"error general: {str(e)[:200]}"

    return jsonify(success=True, wipe_aplicado=wipe, resultados=results)
