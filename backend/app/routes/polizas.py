"""CRUD de Pólizas."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.poliza import Poliza
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("polizas", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_polizas():
    args = request.args
    query = Poliza.query
    if args.get("grupo"):
        query = query.filter(Poliza.grupo == args["grupo"])
    if args.get("zona"):
        query = query.filter(Poliza.zona == args["zona"])
    if args.get("status"):
        query = query.filter(Poliza.status == args["status"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(or_(Poliza.project.ilike(like), Poliza.code.ilike(like)))
    items = query.order_by(Poliza.item.asc().nullslast(), Poliza.id.asc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(p: Poliza, data: dict):
    p.item = parse_int(data.get("item"))
    p.grupo = parse_str(data.get("grupo"))
    p.code = parse_str(data.get("code"))
    p.project = parse_str(data.get("project")) or p.project
    p.tarifa = parse_str(data.get("tarifa"))
    p.platform = parse_str(data.get("platform"))
    p.panels = parse_str(data.get("panels"))
    p.inv = parse_str(data.get("inv"))
    p.sys_start = parse_date(data.get("sysStart"))
    p.pol_start = parse_date(data.get("polStart"))
    p.pol_end = parse_date(data.get("polEnd"))
    p.status = parse_str(data.get("status"))
    p.poliza = parse_str(data.get("poliza"))
    p.zona = parse_str(data.get("zona"))
    p.cuadrilla = parse_str(data.get("cuadrilla"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "mantenimiento")
def create_poliza():
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    if data.get("code") and Poliza.query.filter_by(code=data["code"]).first():
        return jsonify(error="duplicate_code"), 409
    p = Poliza(project=parse_str(data["project"]))
    _apply(p, data)
    db.session.add(p)
    db.session.flush()
    log_change("polizas", "crear", p.project, new=p.to_dict())
    db.session.commit()
    return jsonify(p.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "mantenimiento")
def update_poliza(item_id):
    p = db.session.get(Poliza, item_id)
    if not p:
        return jsonify(error="not_found"), 404
    old = p.to_dict()
    _apply(p, request.get_json(silent=True) or {})
    log_change("polizas", "editar", p.project, old=old, new=p.to_dict())
    db.session.commit()
    return jsonify(p.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_poliza(item_id):
    p = db.session.get(Poliza, item_id)
    if not p:
        return jsonify(error="not_found"), 404
    log_change("polizas", "eliminar", p.project, old=p.to_dict())
    db.session.delete(p)
    db.session.commit()
    return jsonify(ok=True)
