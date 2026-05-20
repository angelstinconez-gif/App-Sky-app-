"""CRUD de Incidencias."""
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import or_

from app import db
from app.models.incidencia import Incidencia
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("incidencias", __name__)


def _apply_filters(query):
    args = request.args
    if args.get("priority"):
        query = query.filter(Incidencia.priority == args["priority"])
    if args.get("platform"):
        query = query.filter(Incidencia.platform == args["platform"])
    if args.get("client"):
        query = query.filter(Incidencia.client == args["client"])
    if args.get("status"):
        query = query.filter(Incidencia.status == args["status"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(
            or_(
                Incidencia.site.ilike(like),
                Incidencia.code.ilike(like),
                Incidencia.notes.ilike(like),
                Incidencia.problem.ilike(like),
            )
        )
    return query


@bp.route("", methods=["GET"])
@jwt_required()
def list_incidencias():
    query = _apply_filters(Incidencia.query)
    items = query.order_by(Incidencia.inc_date.desc().nullslast(), Incidencia.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
def get_incidencia(item_id):
    inc = db.session.get(Incidencia, item_id)
    if not inc:
        return jsonify(error="not_found"), 404
    return jsonify(inc.to_dict())


def _apply_payload(inc: Incidencia, data: dict):
    inc.platform = parse_str(data.get("platform"))
    inc.num = parse_int(data.get("num"))
    inc.site = parse_str(data.get("site")) or inc.site
    inc.client = parse_str(data.get("client"))
    inc.code = parse_str(data.get("code"))
    inc.priority = parse_str(data.get("priority"))
    inc.notes = parse_str(data.get("notes"))
    inc.inc_date = parse_date(data.get("incDate"))
    inc.err_code = parse_str(data.get("errCode"))
    inc.classification = parse_str(data.get("classification"))
    inc.equipment = parse_str(data.get("equipment"))
    inc.problem = parse_str(data.get("problem"))
    inc.cause = parse_str(data.get("cause"))
    inc.solution = parse_str(data.get("solution"))
    inc.ticket_alta = parse_str(data.get("ticketAlta"))
    inc.ticket_date = parse_date(data.get("ticketDate"))
    inc.responsible = parse_str(data.get("responsible"))
    inc.comments = parse_str(data.get("comments"))
    if data.get("status") in ("abierta", "cerrada"):
        inc.status = data["status"]


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_incidencia():
    data = request.get_json(silent=True) or {}
    if not data.get("site"):
        return jsonify(error="missing_site", message="El sitio es obligatorio"), 400
    inc = Incidencia(site=parse_str(data["site"]))
    _apply_payload(inc, data)
    db.session.add(inc)
    db.session.flush()
    log_change("incidencias", "crear", f"Incidencia #{inc.id} — {inc.site}", new=inc.to_dict())
    db.session.commit()
    return jsonify(inc.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_incidencia(item_id):
    inc = db.session.get(Incidencia, item_id)
    if not inc:
        return jsonify(error="not_found"), 404
    old = inc.to_dict()
    _apply_payload(inc, request.get_json(silent=True) or {})
    inc.last_mod = datetime.utcnow().date()
    log_change("incidencias", "editar", f"Incidencia #{inc.id}", old=old, new=inc.to_dict())
    db.session.commit()
    return jsonify(inc.to_dict())


@bp.route("/<int:item_id>/close", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def close_incidencia(item_id):
    inc = db.session.get(Incidencia, item_id)
    if not inc:
        return jsonify(error="not_found"), 404
    data = request.get_json(silent=True) or {}
    claims = get_jwt()
    inc.status = "cerrada"
    inc.closed_at = datetime.utcnow()
    inc.closed_by = data.get("responsible") or claims.get("name") or "—"
    inc.closed_by_email = claims.get("email")
    inc.close_result = parse_str(data.get("result"))
    log_change(
        "incidencias",
        "cerrar",
        f"Incidencia #{inc.id} cerrada por {inc.closed_by}",
        new={"result": inc.close_result, "closedBy": inc.closed_by},
    )
    db.session.commit()
    return jsonify(inc.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_incidencia(item_id):
    inc = db.session.get(Incidencia, item_id)
    if not inc:
        return jsonify(error="not_found"), 404
    log_change("incidencias", "eliminar", f"Incidencia #{inc.id} — {inc.site}", old=inc.to_dict())
    db.session.delete(inc)
    db.session.commit()
    return jsonify(ok=True)
