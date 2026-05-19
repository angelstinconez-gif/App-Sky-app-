"""CRUD de Mantenimientos."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.mantenimiento import Mantenimiento
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.notify import notify_event
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("mantenimiento", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_m():
    args = request.args
    query = Mantenimiento.query
    if args.get("estado"):
        query = query.filter(Mantenimiento.estado == args["estado"])
    if args.get("tipo"):
        query = query.filter(Mantenimiento.tipo == args["tipo"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(or_(Mantenimiento.project.ilike(like), Mantenimiento.code.ilike(like)))
    items = query.order_by(Mantenimiento.fecha_programada.desc().nullslast()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(m: Mantenimiento, data: dict):
    m.project = parse_str(data.get("project")) or m.project
    m.code = parse_str(data.get("code"))
    m.tipo = parse_str(data.get("tipo"))
    m.fecha_programada = parse_date(data.get("fechaProgramada"))
    m.fecha_ejecutada = parse_date(data.get("fechaEjecutada"))
    m.estado = parse_str(data.get("estado")) or m.estado
    m.cuadrilla = parse_str(data.get("cuadrilla"))
    m.responsable = parse_str(data.get("responsable"))
    m.descripcion = parse_str(data.get("descripcion"))
    m.resultados = parse_str(data.get("resultados"))
    m.poliza_id = parse_int(data.get("polizaId"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "mantenimiento")
def create_m():
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    m = Mantenimiento(project=parse_str(data["project"]))
    _apply(m, data)
    db.session.add(m)
    db.session.flush()
    log_change("mantenimiento", "crear", m.project, new=m.to_dict())
    db.session.commit()
    # Notificar a suscriptores
    try:
        notify_event(
            event_type="mantenimiento_programado",
            title=f"🔧 Nuevo mantenimiento programado",
            body=f"{m.tipo or 'Mantenimiento'} en {m.project}"
                 + (f" para el {m.fecha_programada}" if m.fecha_programada else ""),
            related_type="mantenimiento",
            related_id=m.id,
        )
    except Exception as e:
        print(f"⚠️  Error notificando: {e}")
    return jsonify(m.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "mantenimiento")
def update_m(item_id):
    m = db.session.get(Mantenimiento, item_id)
    if not m:
        return jsonify(error="not_found"), 404
    old = m.to_dict()
    _apply(m, request.get_json(silent=True) or {})
    log_change("mantenimiento", "editar", m.project, old=old, new=m.to_dict())
    db.session.commit()
    # Notificar cambios de estado relevantes
    if old.get("estado") != m.estado:
        try:
            notify_event(
                event_type=f"mantenimiento_{m.estado.lower().replace(' ', '_')}",
                title=f"🔄 Mantenimiento {m.estado}",
                body=f"{m.tipo or 'Mantenimiento'} en {m.project}",
                related_type="mantenimiento",
                related_id=m.id,
            )
        except Exception as e:
            print(f"⚠️  Error notificando: {e}")
    return jsonify(m.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_m(item_id):
    m = db.session.get(Mantenimiento, item_id)
    if not m:
        return jsonify(error="not_found"), 404
    log_change("mantenimiento", "eliminar", m.project, old=m.to_dict())
    db.session.delete(m)
    db.session.commit()
    return jsonify(ok=True)
