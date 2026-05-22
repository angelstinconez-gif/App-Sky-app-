"""CRUD de avisos del día (sólo admins crean/editan/borran; todos leen)."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required

from app import db
from app.models.aviso import Aviso
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.notify import notify_event
from app.utils.parse import parse_date, parse_str

bp = Blueprint("avisos", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_avisos():
    """Devuelve avisos. Por defecto sólo los activos; ?all=1 trae todos."""
    show_all = request.args.get("all") in ("1", "true", "yes")
    q = Aviso.query.order_by(Aviso.pinned.desc(), Aviso.created_at.desc())
    items = [a for a in q.all() if show_all or a.is_active()]
    return jsonify([a.to_dict() for a in items])


def _apply(a: Aviso, data: dict):
    a.title = parse_str(data.get("title")) or a.title
    a.body = parse_str(data.get("body"))
    a.level = parse_str(data.get("level")) or a.level or "info"
    a.valid_from = parse_date(data.get("validFrom"))
    a.valid_until = parse_date(data.get("validUntil"))
    a.pinned = bool(data.get("pinned"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_aviso():
    data = request.get_json(silent=True) or {}
    if not data.get("title"):
        return jsonify(error="missing_title"), 400
    claims = get_jwt() or {}
    a = Aviso(
        title=parse_str(data["title"]),
        posted_by=claims.get("name"),
        posted_by_email=claims.get("email"),
    )
    _apply(a, data)
    db.session.add(a)
    db.session.flush()
    log_change("avisos", "crear", f"Aviso '{a.title}'", new=a.to_dict())
    db.session.commit()

    # Notificar a TODOS los usuarios activos (in-app)
    try:
        from app.models.user import User
        ids = [u.id for u in User.query.filter_by(active=True).all()]
        if ids:
            notify_event(
                event_type="aviso_dia",
                title=f"📢 {a.title}",
                body=a.body or "",
                related_type="aviso",
                related_id=a.id,
                user_ids=ids,
            )
    except Exception as e:
        print(f"⚠️  notify aviso falló: {e}")

    return jsonify(a.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_aviso(item_id):
    a = db.session.get(Aviso, item_id)
    if not a:
        return jsonify(error="not_found"), 404
    old = a.to_dict()
    _apply(a, request.get_json(silent=True) or {})
    log_change("avisos", "editar", f"Aviso #{a.id}", old=old, new=a.to_dict())
    db.session.commit()
    return jsonify(a.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_aviso(item_id):
    a = db.session.get(Aviso, item_id)
    if not a:
        return jsonify(error="not_found"), 404
    log_change("avisos", "eliminar", f"Aviso #{a.id} — {a.title}", old=a.to_dict())
    db.session.delete(a)
    db.session.commit()
    return jsonify(ok=True)
