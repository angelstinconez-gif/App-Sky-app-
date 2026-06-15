"""Revisión semanal de plantas SFV (PV) en garantía vigente."""
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required

from app import db
from app.models.revision_semanal import RevisionSemanal, ESTADOS_REVISION
from app.models.poliza import Poliza
from app.models.incidencia import Incidencia
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_int, parse_str

bp = Blueprint("revisiones_semanales", __name__)


def _current_iso_week():
    """Devuelve (year, week) ISO de hoy."""
    iso = date.today().isocalendar()
    return iso[0], iso[1]


def _es_pv_vigente(p):
    """True si la póliza es PV (o COMPLETO/GENERACIÓN) y está vigente."""
    if not p:
        return False
    tipo = (p.poliza or "").upper()
    es_pv = ("PV" in tipo) or ("FV" in tipo) or (tipo in ("", "COMPLETO", "GENERACIÓN", "GENERACION", "HÍBRIDO", "HIBRIDO"))
    if not es_pv:
        # Heurística por código (-FV-)
        if not (p.code and "-FV" in (p.code or "").upper()):
            return False
    vigente = (p.pol_end is None) or (p.pol_end >= date.today())
    return vigente


@bp.route("/estados", methods=["GET"])
@jwt_required()
def list_estados():
    """Devuelve los 4 estados disponibles."""
    return jsonify(ESTADOS_REVISION)


@bp.route("/plantas", methods=["GET"])
@jwt_required()
def list_plantas():
    """Devuelve TODAS las plantas PV vigentes + el estado de revisión de la semana solicitada.

    Query params:
      - year (default: año ISO actual)
      - week (default: semana ISO actual)
      - solo_pendientes (1 = filtra solo las sin revisión)
    """
    args = request.args
    today = date.today()
    iso = today.isocalendar()
    year = int(args.get("year") or iso[0])
    week = int(args.get("week") or iso[1])
    solo_pendientes = args.get("solo_pendientes") in ("1", "true", "yes")

    # 1) Pólizas PV vigentes
    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv_vigente(p)]

    # 2) Revisiones existentes de la semana
    revs = {r.project.strip().lower(): r for r in
            RevisionSemanal.query.filter_by(year=year, week=week).all()}

    out = []
    for p in pv:
        key = (p.project or "").strip().lower()
        rev = revs.get(key)
        d = {
            "polizaId": p.id,
            "project": p.project,
            "code": p.code,
            "grupo": p.grupo,
            "platform": p.platform,
            "zona": p.zona,
            "polEnd": p.pol_end.isoformat() if p.pol_end else None,
            "year": year,
            "week": week,
            "estado": rev.estado if rev else None,
            "observaciones": rev.observaciones if rev else None,
            "revisadoPor": rev.revisado_por if rev else None,
            "fechaRevision": rev.fecha_revision.isoformat() if rev and rev.fecha_revision else None,
            "incidenciaId": rev.incidencia_id if rev else None,
            "revisionId": rev.id if rev else None,
        }
        if solo_pendientes and rev:
            continue
        out.append(d)
    out.sort(key=lambda x: (x.get("project") or "").lower())
    return jsonify({
        "year": year,
        "week": week,
        "currentYear": iso[0],
        "currentWeek": iso[1],
        "total": len(out),
        "revisadas": len([x for x in out if x["estado"]]),
        "pendientes": len([x for x in out if not x["estado"]]),
        "plantas": out,
    })


@bp.route("/historial/<int:poliza_id>", methods=["GET"])
@jwt_required()
def historial(poliza_id):
    """Histórico de revisiones de una planta (últimas 12 semanas)."""
    revs = (RevisionSemanal.query.filter_by(poliza_id=poliza_id)
            .order_by(RevisionSemanal.year.desc(), RevisionSemanal.week.desc())
            .limit(12).all())
    return jsonify([r.to_dict() for r in revs])


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento", "tecnico")
def upsert():
    """Crea o actualiza una revisión semanal. Si el estado no es OK y `generarIncidencia`
    está en True, crea una incidencia asociada."""
    data = request.get_json(silent=True) or {}
    project = parse_str(data.get("project"))
    if not project:
        return jsonify(error="missing_project"), 400
    estado = parse_str(data.get("estado")) or "OK"
    if estado not in ESTADOS_REVISION:
        return jsonify(error="invalid_estado",
                       message=f"Estado debe ser uno de: {', '.join(ESTADOS_REVISION)}"), 400

    today = date.today()
    iso = today.isocalendar()
    year = parse_int(data.get("year")) or iso[0]
    week = parse_int(data.get("week")) or iso[1]
    claims = get_jwt() or {}

    # Upsert por (project, year, week)
    existing = RevisionSemanal.query.filter_by(project=project, year=year, week=week).first()
    target = existing or RevisionSemanal(project=project, year=year, week=week)
    target.estado = estado
    target.observaciones = parse_str(data.get("observaciones"))
    target.code = parse_str(data.get("code"))
    target.poliza_id = parse_int(data.get("polizaId"))
    target.revisado_por = claims.get("name")
    target.revisado_por_email = claims.get("email")
    target.fecha_revision = today

    # Auto-crear incidencia si se solicita
    incidencia_created = None
    if estado != "OK" and bool(data.get("generarIncidencia")):
        # Si ya hay incidencia asociada, no duplicar
        if not target.incidencia_id:
            try:
                # Mapear estado → prioridad y problema
                prio_map = {
                    "Sin comunicación": "Alta",
                    "Falla": "Critico",
                    "Falta de datos": "Intermedia",
                }
                problem_map = {
                    "Sin comunicación": "Sin comunicación con el equipo",
                    "Falla": "Falla detectada en revisión semanal",
                    "Falta de datos": "Falta de datos en revisión",
                }
                inc = Incidencia(
                    site=project,
                    code=target.code,
                    priority=prio_map.get(estado, "Intermedia"),
                    problem=problem_map.get(estado, estado),
                    notes=f"Generada automáticamente desde revisión semanal "
                          f"({year}-W{week:02d}) — Estado: {estado}\n\n"
                          f"{data.get('observaciones') or ''}",
                    classification="COMUNICACIÓN" if estado == "Sin comunicación" else "INVERSOR",
                    inc_date=today,
                    status="abierta",
                    responsible=claims.get("name"),
                )
                # Heredar datos de la póliza si está
                if target.poliza_id:
                    from app.models.poliza import Poliza as _P
                    pol = db.session.get(_P, target.poliza_id)
                    if pol:
                        inc.client = pol.grupo
                        if not inc.code: inc.code = pol.code
                        if pol.platform: inc.platform = pol.platform
                db.session.add(inc)
                db.session.flush()
                target.incidencia_id = inc.id
                incidencia_created = inc.id
            except Exception as e:
                print(f"⚠️  No se pudo crear incidencia: {e}")

    if existing:
        log_change("revisiones_semanales", "actualizar",
                   f"Revisión {project} {year}-W{week:02d}: {estado}", new=target.to_dict())
    else:
        db.session.add(target)
        log_change("revisiones_semanales", "crear",
                   f"Revisión {project} {year}-W{week:02d}: {estado}", new=target.to_dict())
    db.session.commit()
    return jsonify(revision=target.to_dict(), incidenciaCreated=incidencia_created), 201
