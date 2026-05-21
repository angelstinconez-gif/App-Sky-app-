"""CRUD de Cuadrillas."""
import json

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.cuadrilla import Cuadrilla
from app.models.tecnico import Tecnico
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_int, parse_str

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


def _serialize_miembros(value):
    """Acepta lista de ids o texto y devuelve JSON string."""
    if value is None:
        return None
    if isinstance(value, list):
        ids = [int(x) for x in value if str(x).lstrip("-").isdigit()]
        return json.dumps(ids)
    return parse_str(value)


def _apply(c: Cuadrilla, data: dict):
    c.nombre = parse_str(data.get("nombre")) or c.nombre
    c.zona = parse_str(data.get("zona"))

    # Líder: si llega liderId, buscar el técnico y auto-llenar nombre + teléfono
    lider_id = parse_int(data.get("liderId"))
    if lider_id:
        tec = db.session.get(Tecnico, lider_id)
        if tec:
            c.lider_id = tec.id
            c.lider = tec.nombre
            c.telefono = tec.telefono or parse_str(data.get("telefono"))
        else:
            c.lider_id = None
            c.lider = parse_str(data.get("lider"))
            c.telefono = parse_str(data.get("telefono"))
    else:
        c.lider_id = None
        c.lider = parse_str(data.get("lider"))
        c.telefono = parse_str(data.get("telefono"))

    # Miembros: aceptamos lista de IDs (preferido) o texto libre
    if "miembrosIds" in data:
        c.miembros = _serialize_miembros(data.get("miembrosIds"))
    elif "miembros" in data:
        c.miembros = _serialize_miembros(data.get("miembros"))

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
