"""Buscador global multi-sección con filtrado por rol del usuario.

Las secciones que cada rol puede ver:
- admin:     todas
- operator:  incidencias, tickets, mantenimientos (read), directorio, pólizas (read)
- mantenimiento: tickets, mantenimientos, garantías, directorio, pólizas (read), incidencias (read)
- tecnico:   tickets (read), mantenimientos (read), checklists, lecciones
- viewer:    tickets, incidencias (read), calendario (read)
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import or_

from app import db
from app.models.ticket import Ticket
from app.models.incidencia import Incidencia
from app.models.mantenimiento import Mantenimiento
from app.models.directorio import Directorio
from app.models.garantia import Garantia
from app.models.poliza import Poliza

bp = Blueprint("search", __name__)


# Roles que pueden ver cada sección
ROLES_BY_SECTION = {
    "tickets":       ["admin", "operator", "mantenimiento", "tecnico", "viewer"],
    "incidencias":   ["admin", "operator", "mantenimiento", "tecnico", "viewer"],
    "mantenimientos":["admin", "mantenimiento", "tecnico"],
    "directorio":    ["admin", "operator", "mantenimiento"],
    "garantias":     ["admin", "mantenimiento"],
    "polizas":       ["admin", "operator", "mantenimiento"],
}


def _safe_int(s):
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


@bp.route("", methods=["GET"])
@jwt_required()
def global_search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify(query=q, results=[], total=0,
                       message="Escribe al menos 2 caracteres")

    claims = get_jwt() or {}
    role = claims.get("role")
    like = f"%{q}%"
    qid = _safe_int(q)

    section_filter = request.args.get("section")  # opcional: forzar una sola
    limit_per = int(request.args.get("limit") or 8)

    results = []

    def allowed(sec):
        if section_filter and sec != section_filter:
            return False
        return role in ROLES_BY_SECTION.get(sec, [])

    # ── Tickets ──
    if allowed("tickets"):
        rows = (
            Ticket.query.filter(or_(
                Ticket.title.ilike(like),
                Ticket.site.ilike(like),
                Ticket.project_code.ilike(like),
                Ticket.client.ilike(like),
                Ticket.assigned_to.ilike(like),
                Ticket.description.ilike(like),
                Ticket.id == qid,
            ))
            .order_by(Ticket.id.desc())
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "tickets",
                "id": r.id,
                "title": f"#{r.id} · {r.title or ''}",
                "subtitle": f"{r.site or '—'} · {r.client or ''} · {r.status or ''}",
                "extra": f"Prioridad: {r.priority or '—'} · Asignado: {r.assigned_to or '—'}",
                "route": f"/tickets",
                "icon": "ticket",
            })

    # ── Incidencias ──
    if allowed("incidencias"):
        rows = (
            Incidencia.query.filter(or_(
                Incidencia.site.ilike(like),
                Incidencia.client.ilike(like),
                Incidencia.code.ilike(like),
                Incidencia.err_code.ilike(like),
                Incidencia.problem.ilike(like),
                Incidencia.notes.ilike(like),
                Incidencia.platform.ilike(like),
                Incidencia.id == qid,
            ))
            .order_by(Incidencia.inc_date.desc().nullslast())
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "incidencias",
                "id": r.id,
                "title": f"#{r.id} · {r.site or '—'}",
                "subtitle": f"{r.platform or ''} · {r.problem or r.err_code or '—'} · {r.status}",
                "extra": f"Prioridad: {r.priority or '—'}",
                "route": "/incidencias",
                "icon": "alert",
            })

    # ── Mantenimientos ──
    if allowed("mantenimientos"):
        rows = (
            Mantenimiento.query.filter(or_(
                Mantenimiento.project.ilike(like),
                Mantenimiento.code.ilike(like),
                Mantenimiento.tipo.ilike(like),
                Mantenimiento.cuadrilla.ilike(like),
                Mantenimiento.responsable.ilike(like),
                Mantenimiento.descripcion.ilike(like),
                Mantenimiento.id == qid,
            ))
            .order_by(Mantenimiento.fecha_programada.desc().nullslast())
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "mantenimientos",
                "id": r.id,
                "title": f"M{r.id} · {r.tipo or 'Mantenimiento'}",
                "subtitle": f"{r.project or '—'} · {r.estado or ''}",
                "extra": f"Cuadrilla: {r.cuadrilla or '—'} · Resp: {r.responsable or '—'}",
                "route": "/mantenimiento",
                "icon": "wrench",
            })

    # ── Directorio ──
    if allowed("directorio"):
        rows = (
            Directorio.query.filter(or_(
                Directorio.project.ilike(like),
                Directorio.project_code.ilike(like),
                Directorio.maint_contact.ilike(like),
                Directorio.client_name.ilike(like),
                Directorio.client_company.ilike(like),
                Directorio.maint_email.ilike(like),
                Directorio.client_email.ilike(like),
            ))
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "directorio",
                "id": r.id,
                "title": r.project or '—',
                "subtitle": f"Mantto: {r.maint_contact or '—'} · {r.maint_phone or ''}",
                "extra": f"Cliente: {r.client_name or r.client_company or '—'}",
                "route": "/directorio",
                "icon": "users",
            })

    # ── Garantías ──
    if allowed("garantias"):
        rows = (
            Garantia.query.filter(or_(
                Garantia.project.ilike(like),
                Garantia.code.ilike(like),
                Garantia.brand.ilike(like),
                Garantia.model.ilike(like),
                Garantia.sn.ilike(like),
                Garantia.supplier.ilike(like),
                Garantia.error.ilike(like),
                Garantia.id == qid,
            ))
            .order_by(Garantia.id.desc())
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "garantias",
                "id": r.id,
                "title": f"{r.brand or ''} {r.model or ''} (SN: {r.sn or 's/n'})",
                "subtitle": f"{r.project or '—'} · {r.status or '—'}",
                "extra": f"Proveedor: {r.supplier or '—'}",
                "route": "/garantias",
                "icon": "shield",
            })

    # ── Pólizas ──
    if allowed("polizas"):
        rows = (
            Poliza.query.filter(or_(
                Poliza.project.ilike(like),
                Poliza.code.ilike(like),
                Poliza.grupo.ilike(like),
                Poliza.zona.ilike(like),
                Poliza.platform.ilike(like),
                Poliza.id == qid,
            ))
            .limit(limit_per).all()
        )
        for r in rows:
            results.append({
                "section": "polizas",
                "id": r.id,
                "title": r.project or '—',
                "subtitle": f"Código: {r.code or '—'} · {r.platform or ''} · {r.zona or ''}",
                "extra": f"Vence: {r.pol_end.isoformat() if r.pol_end else '—'}",
                "route": "/polizas",
                "icon": "file",
            })

    return jsonify(query=q, role=role, total=len(results), results=results)
