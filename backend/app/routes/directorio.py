"""CRUD del Directorio."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.directorio import Directorio
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_str

bp = Blueprint("directorio", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_dir():
    args = request.args
    query = Directorio.query
    if args.get("category"):
        query = query.filter(Directorio.category == args["category"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(
            or_(Directorio.name.ilike(like), Directorio.company.ilike(like), Directorio.email.ilike(like))
        )
    items = query.order_by(Directorio.name.asc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(d: Directorio, data: dict):
    d.name = parse_str(data.get("name")) or d.name
    d.role = parse_str(data.get("role"))
    d.company = parse_str(data.get("company"))
    d.email = parse_str(data.get("email"))
    d.phone = parse_str(data.get("phone"))
    d.category = parse_str(data.get("category"))
    d.notes = parse_str(data.get("notes"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_dir():
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return jsonify(error="missing_name"), 400
    d = Directorio(name=parse_str(data["name"]))
    _apply(d, data)
    db.session.add(d)
    db.session.flush()
    log_change("directorio", "crear", d.name, new=d.to_dict())
    db.session.commit()
    return jsonify(d.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_dir(item_id):
    d = db.session.get(Directorio, item_id)
    if not d:
        return jsonify(error="not_found"), 404
    old = d.to_dict()
    _apply(d, request.get_json(silent=True) or {})
    log_change("directorio", "editar", d.name, old=old, new=d.to_dict())
    db.session.commit()
    return jsonify(d.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_dir(item_id):
    d = db.session.get(Directorio, item_id)
    if not d:
        return jsonify(error="not_found"), 404
    log_change("directorio", "eliminar", d.name, old=d.to_dict())
    db.session.delete(d)
    db.session.commit()
    return jsonify(ok=True)
