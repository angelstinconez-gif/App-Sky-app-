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


@bp.route("", methods=["GET"])
@jwt_required()
def list_garantias():
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


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "mantenimiento")
def create_garantia():
    from flask_jwt_extended import get_jwt
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    g = Garantia(project=parse_str(data["project"]))
    _apply(g, data)
    # Auto-llenar quién abre el ticket si no se especificó
    claims = get_jwt() or {}
    if not g.abierto_por:
        g.abierto_por = claims.get("name")
        g.abierto_por_email = claims.get("email")
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
