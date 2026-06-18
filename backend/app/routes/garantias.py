"""CRUD de Garantías."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.garantia import Garantia
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_str

bp = Blueprint("garantias", __name__)


# Flags de proceso (volátiles): True una vez que ya se hicieron
_dedupe_done = False
_columns_added = False


def _ensure_creado_por_columns():
    """Añade columnas creado_por / creado_por_email a garantias si no existen.
    Una sola vez por instancia."""
    global _columns_added
    if _columns_added:
        return
    _columns_added = True
    try:
        from sqlalchemy import inspect, text
        insp = inspect(db.engine)
        if not insp.has_table("garantias"):
            return
        cols = {c["name"] for c in insp.get_columns("garantias")}
        for col, ddl in [
            ("creado_por",       "ALTER TABLE garantias ADD COLUMN creado_por VARCHAR(160)"),
            ("creado_por_email", "ALTER TABLE garantias ADD COLUMN creado_por_email VARCHAR(180)"),
        ]:
            if col not in cols:
                try:
                    with db.engine.begin() as conn:
                        conn.execute(text(ddl))
                    print(f"➕ Columna garantias.{col} creada")
                except Exception as e:
                    print(f"⚠️  No se pudo crear garantias.{col}: {e}")
    except Exception as e:
        print(f"⚠️  ensure_creado_por_columns falló: {e}")


def _auto_dedupe_garantias_once():
    """Elimina duplicados por (project, ticket, error, sn) la PRIMERA vez que se llama.
    Después no hace nada hasta el próximo reinicio del backend.
    Silencioso si no hay duplicados."""
    global _dedupe_done
    if _dedupe_done:
        return 0
    _dedupe_done = True   # marcar ya hecho aunque falle, para no reintentar en loop
    try:
        def _n(s): return (s or "").strip().lower()
        seen, to_del = set(), 0
        for g in Garantia.query.order_by(Garantia.id.asc()).all():
            k = (_n(g.project), _n(g.ticket), _n(g.error), _n(g.sn))
            if all(not x for x in k):
                continue  # registros con todo vacío no se consideran duplicado
            if k in seen:
                db.session.delete(g)
                to_del += 1
            else:
                seen.add(k)
        if to_del:
            db.session.commit()
            print(f"🧹 Auto-dedupe garantías: {to_del} duplicados eliminados")
        return to_del
    except Exception as e:
        db.session.rollback()
        print(f"⚠️  Auto-dedupe garantías falló: {e}")
        return 0


@bp.route("", methods=["GET"])
@jwt_required()
def list_garantias():
    # ── Auto-setup en la primera llamada (silencioso, una sola vez por instancia) ──
    _ensure_creado_por_columns()
    _auto_dedupe_garantias_once()

    q = request.args.get("q")
    status = request.args.get("status")
    query = Garantia.query
    if status:
        query = query.filter(Garantia.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Garantia.project.ilike(like), Garantia.error.ilike(like), Garantia.ticket.ilike(like))
        )
    items = query.order_by(Garantia.upload_date.desc().nullslast(), Garantia.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(g: Garantia, data: dict):
    g.project = parse_str(data.get("project")) or g.project
    g.code = parse_str(data.get("code"))
    g.equipment = parse_str(data.get("equipment"))
    g.brand = parse_str(data.get("brand"))
    g.model = parse_str(data.get("model"))
    g.sn = parse_str(data.get("sn"))
    g.error = parse_str(data.get("error"))
    g.supplier = parse_str(data.get("supplier"))
    g.contact = parse_str(data.get("contact"))
    g.ticket = parse_str(data.get("ticket"))
    g.status = parse_str(data.get("status"))
    g.upload_date = parse_date(data.get("uploadDate"))
    g.abierto_por = parse_str(data.get("abiertoPor"))
    g.abierto_por_email = parse_str(data.get("abiertoPorEmail"))
    g.comments = parse_str(data.get("comments"))


def _norm(s):
    return (s or "").strip().lower()


def _find_duplicate(project, ticket, error, sn):
    """Busca una garantía existente con la misma clave (project, ticket, error, sn)."""
    if not project:
        return None
    candidates = Garantia.query.filter(
        Garantia.project.ilike(project or "")
    ).all()
    pk = _norm(project)
    tk = _norm(ticket)
    er = _norm(error)
    sk = _norm(sn)
    for c in candidates:
        if (_norm(c.project) == pk and
            _norm(c.ticket) == tk and
            _norm(c.error) == er and
            _norm(c.sn) == sk):
            return c
    return None


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "mantenimiento")
def create_garantia():
    from flask_jwt_extended import get_jwt
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400

    # ── Anti-duplicado: misma (project, ticket, error, sn) = no crear nuevo ──
    dup = _find_duplicate(
        parse_str(data.get("project")),
        parse_str(data.get("ticket")),
        parse_str(data.get("error")),
        parse_str(data.get("sn")),
    )
    if dup:
        return jsonify(
            error="duplicate",
            message=f"Ya existe una garantía con esos datos (ID #{dup.id}). Se evitó duplicar.",
            existing=dup.to_dict(),
        ), 409

    g = Garantia(project=parse_str(data["project"]))
    _apply(g, data)
    claims = get_jwt() or {}
    # Quien abrió el ticket con el proveedor (si no se especificó, usa el usuario logueado)
    if not g.abierto_por:
        g.abierto_por = claims.get("name")
        g.abierto_por_email = claims.get("email")
    # Quien SUBIÓ el registro a SkySense (siempre del JWT, no editable desde el form)
    g.creado_por = claims.get("name")
    g.creado_por_email = claims.get("email")
    db.session.add(g)
    db.session.flush()
    log_change("garantias", "crear", g.project, new=g.to_dict())
    db.session.commit()
    return jsonify(g.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "mantenimiento")
def update_garantia(item_id):
    g = db.session.get(Garantia, item_id)
    if not g:
        return jsonify(error="not_found"), 404
    old = g.to_dict()
    _apply(g, request.get_json(silent=True) or {})
    log_change("garantias", "editar", g.project, old=old, new=g.to_dict())
    db.session.commit()
    return jsonify(g.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_garantia(item_id):
    g = db.session.get(Garantia, item_id)
    if not g:
        return jsonify(error="not_found"), 404
    log_change("garantias", "eliminar", g.project, old=g.to_dict())
    db.session.delete(g)
    db.session.commit()
    return jsonify(ok=True)
