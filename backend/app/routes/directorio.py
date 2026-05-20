"""CRUD del Directorio (contactos por proyecto)."""
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
        query = query.filter(or_(
            Directorio.project.ilike(like),
            Directorio.project_code.ilike(like),
            Directorio.maint_contact.ilike(like),
            Directorio.maint_email.ilike(like),
            Directorio.client_name.ilike(like),
            Directorio.client_company.ilike(like),
            Directorio.client_email.ilike(like),
        ))
    items = query.order_by(Directorio.project.asc().nullslast()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(d, data):
    d.project = parse_str(data.get("project")) or d.project
    d.project_code = parse_str(data.get("projectCode") or data.get("project_code"))
    d.system_type = parse_str(data.get("systemType") or data.get("system_type"))
    d.category = parse_str(data.get("category"))
    d.notes = parse_str(data.get("notes"))

    d.maint_contact = parse_str(data.get("maintContact") or data.get("maint_contact"))
    d.maint_phone = parse_str(data.get("maintPhone") or data.get("maint_phone"))
    d.maint_contact_2 = parse_str(data.get("maintContact2") or data.get("maint_contact_2"))
    d.maint_phone_2 = parse_str(data.get("maintPhone2") or data.get("maint_phone_2"))
    d.maint_email = parse_str(data.get("maintEmail") or data.get("maint_email"))

    d.internal_pm = parse_str(data.get("internalPm") or data.get("internal_pm"))
    d.internal_phone = parse_str(data.get("internalPhone") or data.get("internal_phone"))

    d.client_name = parse_str(data.get("clientName") or data.get("client_name"))
    d.client_company = parse_str(data.get("clientCompany") or data.get("client_company"))
    d.client_phone = parse_str(data.get("clientPhone") or data.get("client_phone"))
    d.client_email = parse_str(data.get("clientEmail") or data.get("client_email"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_dir():
    data = request.get_json(silent=True) or {}
    project = parse_str(data.get("project"))
    if not project:
        return jsonify(error="missing_project", message="El proyecto es obligatorio"), 400
    d = Directorio(project=project)
    _apply(d, data)
    db.session.add(d)
    db.session.flush()
    log_change("directorio", "crear", d.project, new=d.to_dict())
    db.session.commit()
    return jsonify(d.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_dir(item_id):
    d = db.session.get(Directorio, item_id)
    if not d:
        return jsonify(error="not_found"), 404
    old = d.to_dict()
    _apply(d, request.get_json(silent=True) or {})
    log_change("directorio", "editar", d.project, old=old, new=d.to_dict())
    db.session.commit()
    return jsonify(d.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_dir(item_id):
    d = db.session.get(Directorio, item_id)
    if not d:
        return jsonify(error="not_found"), 404
    log_change("directorio", "eliminar", d.project, old=d.to_dict())
    db.session.delete(d)
    db.session.commit()
    return jsonify(ok=True)
