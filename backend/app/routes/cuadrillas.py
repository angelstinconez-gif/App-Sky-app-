"""CRUD de Cuadrillas."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.cuadrilla import Cuadrilla
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_str

bp = Blueprint("cuadrillas", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_c():
    zona = request.args.get("zona")
    query = Cuadrilla.query
    if zona:
        query = query.filter(Cuadrilla.zona == zona)
    items = query.order_by(Cuadrilla.zona, Cuadrilla.nombre).all()
    return jsonify([i.to_dict() for i in items])


def _apply(c: Cuadrilla, data: dict):
    c.nombre = parse_str(data.get("nombre")) or c.nombre
    c.zona = parse_str(data.get("zona"))
    c.lider = parse_str(data.get("lider"))
    c.miembros = parse_str(data.get("miembros"))
    c.telefono = parse_str(data.get("telefono"))
    c.notes = parse_str(data.get("notes"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_c():
    data = request.get_json(silent=True) or {}
    if not data.get("nombre"):
        return jsonify(error="missing_nombre"), 400
    c = Cuadrilla(nombre=parse_str(data["nombre"]))
    _apply(c, data)
    db.session.add(c)
    db.session.flush()
    log_change("cuadrillas", "crear", c.nombre, new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_c(item_id):
    c = db.session.get(Cuadrilla, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    old = c.to_dict()
    _apply(c, request.get_json(silent=True) or {})
    log_change("cuadrillas", "editar", c.nombre, old=old, new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_c(item_id):
    c = db.session.get(Cuadrilla, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    log_change("cuadrillas", "eliminar", c.nombre, old=c.to_dict())
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)
