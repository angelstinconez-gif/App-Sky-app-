"""CRUD de checklists post-venta C&I."""
import json

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.checklist import Checklist
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("checklists", __name__)


def _to_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return parse_str(value)


@bp.route("", methods=["GET"])
@jwt_required()
def list_c():
    args = request.args
    q = Checklist.query
    if args.get("ticketId"):
        q = q.filter(Checklist.ticket_id == int(args["ticketId"]))
    if args.get("resultado"):
        q = q.filter(Checklist.resultado == args["resultado"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Checklist.project.ilike(like),
            Checklist.cliente.ilike(like),
            Checklist.modelo.ilike(like),
            Checklist.sn_inversor.ilike(like),
        ))
    items = q.order_by(Checklist.fecha_visita.desc().nullslast(), Checklist.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
def get_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    return jsonify(c.to_dict())


def _apply(c: Checklist, data: dict):
    c.ticket_id = parse_int(data.get("ticketId"))
    c.project = parse_str(data.get("project"))
    c.code = parse_str(data.get("code"))
    c.cliente = parse_str(data.get("cliente"))
    c.distribuidor = parse_str(data.get("distribuidor"))
    c.pais = parse_str(data.get("pais")) or c.pais or "México"
    c.modelo = parse_str(data.get("modelo"))
    c.sn_inversor = parse_str(data.get("snInversor"))
    c.sn_logger = parse_str(data.get("snLogger"))
    try:
        c.capacidad_kw = float(data.get("capacidadKw") or 0) or None
    except (TypeError, ValueError):
        c.capacidad_kw = None
    c.datos_panel = parse_str(data.get("datosPanel"))
    c.config_panel = parse_str(data.get("configPanel"))
    c.alarmas = parse_str(data.get("alarmas"))
    c.descripcion_falla = parse_str(data.get("descripcionFalla"))
    c.mediciones_dc = _to_json(data.get("medicionesDc"))
    c.mediciones_ac = _to_json(data.get("medicionesAc"))
    c.frecuencia_hz = parse_str(data.get("frecuenciaHz"))
    c.continuidad_check = parse_str(data.get("continuidadCheck"))
    c.continuidad_serie = parse_str(data.get("continuidadSerie"))
    c.fotos = _to_json(data.get("fotos"))
    c.videos = _to_json(data.get("videos"))
    c.resultado = parse_str(data.get("resultado")) or c.resultado or "En proceso"
    c.observaciones = parse_str(data.get("observaciones"))
    c.tecnico = parse_str(data.get("tecnico"))
    c.fecha_visita = parse_date(data.get("fechaVisita"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_c():
    data = request.get_json(silent=True) or {}
    c = Checklist()
    _apply(c, data)
    db.session.add(c)
    db.session.flush()
    log_change("checklists", "crear", f"Checklist {c.project or '#' + str(c.id)}", new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    old = c.to_dict()
    _apply(c, request.get_json(silent=True) or {})
    log_change("checklists", "editar", f"Checklist #{c.id}", old=old, new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    log_change("checklists", "eliminar", f"Checklist #{c.id}", old=c.to_dict())
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)
