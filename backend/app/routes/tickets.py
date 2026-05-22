"""CRUD de Tickets."""
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import or_

from app import db
from app.models.ticket import Ticket
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.notify import notify_admins
from app.utils.parse import parse_date, parse_int, parse_str


bp = Blueprint("tickets", __name__)


def _notify_admin_if_not_admin(action, t):
    """Si el usuario actual NO es admin, notifica a los admins del cambio."""
    claims = get_jwt() or {}
    if claims.get("role") == "admin":
        return
    try:
        notify_admins(
            event_type=f"ticket_{action}",
            title=f"🎫 Ticket {action} por {claims.get('name', 'usuario')}",
            body=f"#{t.id} — {t.title} (rol: {claims.get('role')})",
            related_type="ticket",
            related_id=t.id,
        )
    except Exception as e:
        print(f"⚠️  notify_admin falló: {e}")


@bp.route("", methods=["GET"])
@jwt_required()
def list_tickets():
    args = request.args
    query = Ticket.query
    if args.get("status"):
        query = query.filter(Ticket.status == args["status"])
    if args.get("priority"):
        query = query.filter(Ticket.priority == args["priority"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(or_(
            Ticket.title.ilike(like),
            Ticket.site.ilike(like),
            Ticket.description.ilike(like),
        ))
    items = query.order_by(Ticket.open_date.desc().nullslast(), Ticket.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(t, data):
    t.title = parse_str(data.get("title")) or t.title
    t.site = parse_str(data.get("site"))
    t.client = parse_str(data.get("client"))
    t.project_code = parse_str(data.get("projectCode"))
    t.priority = parse_str(data.get("priority"))
    t.status = parse_str(data.get("status")) or t.status
    if "assignedTo" in data:
        t.assigned_to = parse_str(data.get("assignedTo"))
    t.open_date = parse_date(data.get("openDate"))
    t.due_date = parse_date(data.get("dueDate"))
    t.description = parse_str(data.get("description"))
    t.incidencia_id = parse_int(data.get("incidenciaId"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_ticket():
    data = request.get_json(silent=True) or {}
    if not data.get("title"):
        return jsonify(error="missing_title"), 400
    t = Ticket(title=parse_str(data["title"]))
    _apply(t, data)
    db.session.add(t)
    db.session.flush()
    log_change("tickets", "crear", f"Ticket #{t.id} — {t.title}", new=t.to_dict())
    db.session.commit()
    _notify_admin_if_not_admin("creado", t)
    return jsonify(t.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_ticket(item_id):
    t = db.session.get(Ticket, item_id)
    if not t:
        return jsonify(error="not_found"), 404
    old = t.to_dict()
    data = request.get_json(silent=True) or {}
    # Lock: si NO es admin, no permitir cambiar 'assignedTo' (responsable)
    claims = get_jwt() or {}
    if claims.get("role") != "admin":
        data.pop("assignedTo", None)
    _apply(t, data)
    log_change("tickets", "editar", f"Ticket #{t.id}", old=old, new=t.to_dict())
    db.session.commit()
    _notify_admin_if_not_admin("editado", t)
    return jsonify(t.to_dict())


@bp.route("/<int:item_id>/close", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def close_ticket(item_id):
    t = db.session.get(Ticket, item_id)
    if not t:
        return jsonify(error="not_found"), 404
    data = request.get_json(silent=True) or {}
    claims = get_jwt()
    t.status = "Cerrado"
    t.close_date = datetime.utcnow().date()
    t.result = parse_str(data.get("result"))
    t.closed_by = data.get("responsible") or claims.get("name")
    t.closed_by_email = claims.get("email")
    log_change("tickets", "cerrar", f"Ticket #{t.id} cerrado por {t.closed_by}", new=t.to_dict())
    db.session.commit()
    _notify_admin_if_not_admin("cerrado", t)
    return jsonify(t.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_ticket(item_id):
    t = db.session.get(Ticket, item_id)
    if not t:
        return jsonify(error="not_found"), 404
    log_change("tickets", "eliminar", f"Ticket #{t.id}", old=t.to_dict())
    db.session.delete(t)
    db.session.commit()
    return jsonify(ok=True)
