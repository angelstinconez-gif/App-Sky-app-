"""CRUD de viáticos asociados a tickets."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.viatico import Viatico
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("viaticos", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_v():
    args = request.args
    q = Viatico.query
    if args.get("ticketId"):
        q = q.filter(Viatico.ticket_id == int(args["ticketId"]))
    if args.get("estado"):
        q = q.filter(Viatico.estado == args["estado"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Viatico.project.ilike(like),
            Viatico.tag_carro.ilike(like),
            Viatico.responsable.ilike(like),
        ))
    items = q.order_by(Viatico.fecha_salida.desc().nullslast(), Viatico.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(v: Viatico, data: dict):
    v.ticket_id = parse_str(data.get("ticketId"))
    v.project = parse_str(data.get("project"))
    v.code = parse_str(data.get("code"))
    v.responsable = parse_str(data.get("responsable"))
    try:
        v.monto = float(data.get("monto") or 0)
    except (TypeError, ValueError):
        v.monto = 0
    v.moneda = parse_str(data.get("moneda")) or "MXN"
    v.tag_carro = parse_str(data.get("tagCarro"))
    try:
        v.dias_sitio = int(data.get("diasSitio") or 0)
    except (TypeError, ValueError):
        v.dias_sitio = 0
    v.fecha_salida = parse_date(data.get("fechaSalida"))
    v.fecha_regreso = parse_date(data.get("fechaRegreso"))
    v.estado = parse_str(data.get("estado")) or v.estado or "Solicitado"
    v.comprobante_url = parse_str(data.get("comprobanteUrl"))
    v.notas = parse_str(data.get("notas"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_v():
    data = request.get_json(silent=True) or {}
    v = Viatico()
    _apply(v, data)
    db.session.add(v)
    db.session.flush()
    log_change("viaticos", "crear", f"Viático ticket #{v.ticket_id} ${v.monto}", new=v.to_dict())
    db.session.commit()
    return jsonify(v.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_v(item_id):
    v = db.session.get(Viatico, item_id)
    if not v:
        return jsonify(error="not_found"), 404
    old = v.to_dict()
    _apply(v, request.get_json(silent=True) or {})
    log_change("viaticos", "editar", f"Viático #{v.id}", old=old, new=v.to_dict())
    db.session.commit()
    return jsonify(v.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_v(item_id):
    v = db.session.get(Viatico, item_id)
    if not v:
        return jsonify(error="not_found"), 404
    log_change("viaticos", "eliminar", f"Viático #{v.id}", old=v.to_dict())
    db.session.delete(v)
    db.session.commit()
    return jsonify(ok=True)
