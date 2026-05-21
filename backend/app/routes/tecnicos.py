"""CRUD de Técnicos (directorio de personal asignable)."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.tecnico import Tecnico
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_int, parse_str

bp = Blueprint("tecnicos", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_tec():
    args = request.args
    q = Tecnico.query
    if args.get("zona"):
        q = q.filter(Tecnico.zona == args["zona"])
    if args.get("cuadrillaId"):
        q = q.filter(Tecnico.cuadrilla_id == int(args["cuadrillaId"]))
    if args.get("rol"):
        q = q.filter(Tecnico.rol == args["rol"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Tecnico.nombre.ilike(like),
            Tecnico.telefono.ilike(like),
            Tecnico.email.ilike(like),
        ))
    items = q.order_by(Tecnico.activo.desc(), Tecnico.nombre.asc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(t: Tecnico, data: dict):
    t.nombre = parse_str(data.get("nombre")) or t.nombre
    t.telefono = parse_str(data.get("telefono"))
    t.email = parse_str(data.get("email"))
    t.rol = parse_str(data.get("rol"))
    t.cuadrilla_id = parse_int(data.get("cuadrillaId"))
    t.zona = parse_str(data.get("zona"))
    t.notas = parse_str(data.get("notas"))
    if "activo" in data:
        t.activo = bool(data.get("activo"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_tec():
    data = request.get_json(silent=True) or {}
    if not data.get("nombre"):
        return jsonify(error="missing_nombre", message="El nombre es obligatorio"), 400
    t = Tecnico(nombre=parse_str(data["nombre"]))
    _apply(t, data)
    db.session.add(t)
    db.session.flush()
    log_change("tecnicos", "crear", t.nombre, new=t.to_dict())
    db.session.commit()
    return jsonify(t.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_tec(item_id):
    t = db.session.get(Tecnico, item_id)
    if not t:
        return jsonify(error="not_found"), 404
    old = t.to_dict()
    _apply(t, request.get_json(silent=True) or {})
    log_change("tecnicos", "editar", t.nombre, old=old, new=t.to_dict())
    db.session.commit()
    return jsonify(t.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_tec(item_id):
    t = db.session.get(Tecnico, item_id)
    if not t:
        return jsonify(error="not_found"), 404
    log_change("tecnicos", "eliminar", t.nombre, old=t.to_dict())
    db.session.delete(t)
    db.session.commit()
    return jsonify(ok=True)
