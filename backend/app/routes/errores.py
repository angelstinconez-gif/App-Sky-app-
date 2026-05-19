"""CRUD del catálogo de errores."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.error_catalog import ErrorCatalog
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_str

bp = Blueprint("errores", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_errores():
    q = request.args.get("q")
    brand = request.args.get("brand")
    classification = request.args.get("classification")
    query = ErrorCatalog.query
    if brand:
        query = query.filter(ErrorCatalog.brand == brand)
    if classification:
        query = query.filter(ErrorCatalog.classification == classification)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(ErrorCatalog.code.ilike(like), ErrorCatalog.problem.ilike(like)))
    items = query.order_by(ErrorCatalog.brand, ErrorCatalog.code).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("/lookup", methods=["GET"])
@jwt_required()
def lookup():
    """Búsqueda exacta por brand+code para autocompletar incidencias."""
    brand = request.args.get("brand", "").upper()
    code = request.args.get("code", "")
    if not brand or not code:
        return jsonify(error="missing_params"), 400
    e = ErrorCatalog.query.filter_by(brand=brand, code=code).first()
    if not e:
        return jsonify(None)
    return jsonify(e.to_dict())


def _apply(err: ErrorCatalog, data: dict):
    err.brand = parse_str(data.get("brand")) or err.brand
    err.code = parse_str(data.get("code")) or err.code
    err.classification = parse_str(data.get("classification"))
    err.problem = parse_str(data.get("problem"))
    err.cause = parse_str(data.get("cause"))
    err.solution = parse_str(data.get("solution"))
    err.priority = parse_str(data.get("priority"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_error():
    data = request.get_json(silent=True) or {}
    brand = (data.get("brand") or "").upper()
    code = parse_str(data.get("code"))
    if not brand or not code:
        return jsonify(error="missing_fields"), 400
    if ErrorCatalog.query.filter_by(brand=brand, code=code).first():
        return jsonify(error="duplicate"), 409
    err = ErrorCatalog(brand=brand, code=code)
    _apply(err, data)
    db.session.add(err)
    db.session.flush()
    log_change("errores", "crear", f"{err.clave}", new=err.to_dict())
    db.session.commit()
    return jsonify(err.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_error(item_id):
    err = db.session.get(ErrorCatalog, item_id)
    if not err:
        return jsonify(error="not_found"), 404
    old = err.to_dict()
    _apply(err, request.get_json(silent=True) or {})
    log_change("errores", "editar", f"{err.clave}", old=old, new=err.to_dict())
    db.session.commit()
    return jsonify(err.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_error(item_id):
    err = db.session.get(ErrorCatalog, item_id)
    if not err:
        return jsonify(error="not_found"), 404
    log_change("errores", "eliminar", err.clave, old=err.to_dict())
    db.session.delete(err)
    db.session.commit()
    return jsonify(ok=True)
