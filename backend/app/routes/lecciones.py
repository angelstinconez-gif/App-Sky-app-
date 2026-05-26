"""CRUD de Lecciones Aprendidas."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import or_

from app import db
from app.models.leccion import Leccion
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_int, parse_str

bp = Blueprint("lecciones", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_l():
    args = request.args
    q = Leccion.query
    if args.get("platform"):
        q = q.filter(Leccion.platform == args["platform"])
    if args.get("classification"):
        q = q.filter(Leccion.classification == args["classification"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Leccion.problem.ilike(like),
            Leccion.solution.ilike(like),
            Leccion.cause.ilike(like),
            Leccion.err_code.ilike(like),
            Leccion.project.ilike(like),
            Leccion.tags.ilike(like),
        ))
    items = q.order_by(Leccion.created_at.desc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(l: Leccion, data: dict):
    l.incidencia_id = parse_int(data.get("incidenciaId"))
    l.ticket_id = parse_int(data.get("ticketId"))
    l.project = parse_str(data.get("project"))
    l.platform = parse_str(data.get("platform"))
    l.err_code = parse_str(data.get("errCode"))
    l.classification = parse_str(data.get("classification"))
    l.equipment = parse_str(data.get("equipment"))
    l.problem = parse_str(data.get("problem"))
    l.cause = parse_str(data.get("cause"))
    l.solution = parse_str(data.get("solution"))
    l.recommendation = parse_str(data.get("recommendation"))
    l.tags = parse_str(data.get("tags"))
    l.rating = parse_int(data.get("rating"))
    l.source = parse_str(data.get("source")) or l.source or "manual"


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_l():
    data = request.get_json(silent=True) or {}
    if not data.get("solution"):
        return jsonify(error="missing_solution", message="La solución es obligatoria"), 400
    claims = get_jwt() or {}
    l = Leccion(
        solution=parse_str(data["solution"]),
        autor=claims.get("name"),
        autor_email=claims.get("email"),
    )
    _apply(l, data)
    db.session.add(l)
    db.session.flush()
    log_change("lecciones", "crear", f"Lección #{l.id} — {l.problem or l.err_code or 's/t'}", new=l.to_dict())
    db.session.commit()
    return jsonify(l.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_l(item_id):
    l = db.session.get(Leccion, item_id)
    if not l:
        return jsonify(error="not_found"), 404
    old = l.to_dict()
    _apply(l, request.get_json(silent=True) or {})
    log_change("lecciones", "editar", f"Lección #{l.id}", old=old, new=l.to_dict())
    db.session.commit()
    return jsonify(l.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_l(item_id):
    l = db.session.get(Leccion, item_id)
    if not l:
        return jsonify(error="not_found"), 404
    log_change("lecciones", "eliminar", f"Lección #{l.id}", old=l.to_dict())
    db.session.delete(l)
    db.session.commit()
    return jsonify(ok=True)
