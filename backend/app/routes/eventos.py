"""Eventos del calendario."""
from datetime import date, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.evento import Evento
from app.models.poliza import Poliza
from app.models.incidencia import Incidencia
from app.models.ticket import Ticket
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("eventos", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_eventos():
    """Devuelve eventos manuales + derivados (vencimientos pólizas, incidencias, tickets)."""
    args = request.args
    start = parse_date(args.get("start"))
    end = parse_date(args.get("end"))

    eventos_manuales = Evento.query
    if start:
        eventos_manuales = eventos_manuales.filter(Evento.event_date >= start)
    if end:
        eventos_manuales = eventos_manuales.filter(Evento.event_date <= end)
    result = [e.to_dict() for e in eventos_manuales.all()]

    # Vencimientos de pólizas
    polizas = Poliza.query.filter(Poliza.pol_end.isnot(None)).all()
    for p in polizas:
        if start and p.pol_end < start: continue
        if end and p.pol_end > end: continue
        result.append({
            "id": f"pol-{p.id}",
            "title": f"Vence póliza — {p.project}",
            "eventDate": p.pol_end.isoformat(),
            "eventType": "vencimiento",
            "relatedId": p.id,
            "relatedType": "poliza",
            "color": "#EF4444" if p.computed_status() == "Vencida" else "#F59E0B",
        })

    # Incidencias por fecha
    incs = Incidencia.query.filter(Incidencia.inc_date.isnot(None)).all()
    for i in incs:
        if start and i.inc_date < start: continue
        if end and i.inc_date > end: continue
        result.append({
            "id": f"inc-{i.id}",
            "title": f"Incidencia — {i.site}",
            "eventDate": i.inc_date.isoformat(),
            "eventType": "incidencia",
            "relatedId": i.id,
            "relatedType": "incidencia",
            "color": "#0EA5E9",
        })

    # Tickets con due date
    tkts = Ticket.query.filter(Ticket.due_date.isnot(None)).all()
    for t in tkts:
        if start and t.due_date < start: continue
        if end and t.due_date > end: continue
        result.append({
            "id": f"tkt-{t.id}",
            "title": f"Ticket — {t.title}",
            "eventDate": t.due_date.isoformat(),
            "eventType": "ticket",
            "relatedId": t.id,
            "relatedType": "ticket",
            "color": "#8B5CF6",
        })

    return jsonify(result)


def _apply(e: Evento, data: dict):
    e.title = parse_str(data.get("title")) or e.title
    e.event_date = parse_date(data.get("eventDate")) or e.event_date
    e.end_date = parse_date(data.get("endDate"))
    e.event_type = parse_str(data.get("eventType"))
    e.related_id = parse_int(data.get("relatedId"))
    e.related_type = parse_str(data.get("relatedType"))
    e.description = parse_str(data.get("description"))
    e.color = parse_str(data.get("color"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator")
def create_evento():
    data = request.get_json(silent=True) or {}
    if not data.get("title") or not data.get("eventDate"):
        return jsonify(error="missing_fields"), 400
    e = Evento(title=parse_str(data["title"]), event_date=parse_date(data["eventDate"]))
    _apply(e, data)
    db.session.add(e)
    db.session.flush()
    log_change("eventos", "crear", e.title, new=e.to_dict())
    db.session.commit()
    return jsonify(e.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator")
def update_evento(item_id):
    e = db.session.get(Evento, item_id)
    if not e:
        return jsonify(error="not_found"), 404
    old = e.to_dict()
    _apply(e, request.get_json(silent=True) or {})
    log_change("eventos", "editar", e.title, old=old, new=e.to_dict())
    db.session.commit()
    return jsonify(e.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin", "operator")
def delete_evento(item_id):
    e = db.session.get(Evento, item_id)
    if not e:
        return jsonify(error="not_found"), 404
    log_change("eventos", "eliminar", e.title, old=e.to_dict())
    db.session.delete(e)
    db.session.commit()
    return jsonify(ok=True)
