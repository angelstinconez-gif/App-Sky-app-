"""Revisión semanal de plantas SFV (PV) en garantía vigente."""
from datetime import date, datetime

from flask import Blueprint, Response, jsonify, request
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


@bp.route("/reporte", methods=["GET"])
@jwt_required()
def reporte_html():
    """Reporte HTML imprimible de la revisión semanal indicada."""
    from datetime import date as _date
    today = _date.today()
    iso = today.isocalendar()
    year = int(request.args.get("year") or iso[0])
    week = int(request.args.get("week") or iso[1])

    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv_vigente(p)]

    revs = {r.project.strip().lower(): r for r in
            RevisionSemanal.query.filter_by(year=year, week=week).all()}

    rows_html = ""
    counts = {"OK": 0, "Sin comunicación": 0, "Falla": 0, "Falta de datos": 0, "Pendiente": 0}
    color_for = {
        "OK": "#dcfce7;color:#166534",
        "Sin comunicación": "#fef3c7;color:#92400e",
        "Falla": "#fee2e2;color:#991b1b",
        "Falta de datos": "#dbeafe;color:#1e40af",
        "Pendiente": "#f3f4f6;color:#6b7280",
    }
    for p in sorted(pv, key=lambda x: (x.project or "").lower()):
        key = (p.project or "").strip().lower()
        r = revs.get(key)
        estado = r.estado if r else "Pendiente"
        counts[estado] = counts.get(estado, 0) + 1
        inc = f'<a href="#" style="color:#dc2626;font-weight:700">#{r.incidencia_id}</a>' if r and r.incidencia_id else "—"
        obs = (r.observaciones or "") if r else ""
        rev_by = (r.revisado_por or "") if r else ""
        rows_html += f"""<tr>
            <td>{p.project or '—'}</td>
            <td style="font-family:monospace;font-size:10px">{p.code or '—'}</td>
            <td>{p.platform or '—'}</td>
            <td>{p.grupo or '—'}</td>
            <td><span style="padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;background:{color_for.get(estado, '#f3f4f6;color:#6b7280')}">{estado}</span></td>
            <td>{inc}</td>
            <td style="font-size:10px;color:#475569">{obs[:120]}</td>
            <td style="font-size:10px;color:#64748b">{rev_by}</td>
        </tr>"""

    total = len(pv)
    revisadas = sum(1 for p in pv if (p.project or "").strip().lower() in revs)
    pct = round((revisadas / total) * 100, 1) if total else 0

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Reporte Revisión Semanal — W{week} {year}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:Arial,sans-serif;font-size:12px;color:#1E293B;background:#F8FAFC;padding:0}}
.page{{max-width:1100px;margin:auto;background:white;padding:0;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
.cover{{background:linear-gradient(135deg,#1E3A5F 0%,#0EA5E9 100%);padding:32px 40px;color:white}}
.cover h1{{font-size:24px;font-weight:800;margin-bottom:6px}}
.cover p{{opacity:.85;font-size:13px}}
.kpis{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:20px 40px;background:#f8fafc}}
.kpi{{background:white;padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0}}
.kpi .lbl{{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}}
.kpi .val{{font-size:22px;font-weight:800;margin-top:4px}}
.section{{padding:24px 40px}}
.section-title{{font-size:14px;font-weight:800;color:#1E3A5F;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #0EA5E9}}
table{{width:100%;border-collapse:collapse;font-size:11px}}
th{{background:#1E3A5F;color:white;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase}}
td{{padding:6px 10px;border-bottom:1px solid #f1f5f9}}
tr:nth-child(even) td{{background:#fafbfc}}
.actions{{position:fixed;top:20px;right:20px;display:flex;gap:8px;z-index:100}}
.actions button{{background:#0EA5E9;color:white;border:0;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2)}}
.actions button:hover{{background:#0284C7}}
@media print{{body{{background:white}}.page{{box-shadow:none;max-width:100%}}.actions{{display:none}}@page{{margin:1cm}}}}
</style></head>
<body>
<div class="actions"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>
<div class="page">

<div class="cover">
  <h1>☀ Reporte Revisión Semanal SFV</h1>
  <p>Semana {week} de {year} · Generado el {today.isoformat()} · {total} plantas PV vigentes</p>
</div>

<div class="kpis">
  <div class="kpi"><div class="lbl">Total plantas</div><div class="val" style="color:#1E3A5F">{total}</div></div>
  <div class="kpi"><div class="lbl">Revisadas</div><div class="val" style="color:#0EA5E9">{revisadas}</div></div>
  <div class="kpi"><div class="lbl">Cumplimiento</div><div class="val" style="color:{'#16A34A' if pct == 100 else '#F59E0B' if pct >= 50 else '#DC2626'}">{pct}%</div></div>
  <div class="kpi"><div class="lbl">OK</div><div class="val" style="color:#16A34A">{counts.get('OK', 0)}</div></div>
  <div class="kpi"><div class="lbl">Con problema</div><div class="val" style="color:#DC2626">{counts.get('Sin comunicación', 0) + counts.get('Falla', 0) + counts.get('Falta de datos', 0)}</div></div>
</div>

<div class="section">
  <div class="section-title">📋 Detalle por planta</div>
  <table>
    <thead><tr>
      <th>Proyecto</th><th>Código</th><th>Plataforma</th><th>Cliente</th>
      <th>Estado</th><th>Incidencia</th><th>Observaciones</th><th>Revisó</th>
    </tr></thead>
    <tbody>{rows_html or '<tr><td colspan="8" style="text-align:center;color:#94a3b8">Sin plantas para revisar.</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">📊 Resumen por estado</div>
  <table>
    <thead><tr><th>Estado</th><th style="text-align:right">Conteo</th><th style="text-align:right">%</th></tr></thead>
    <tbody>
      {''.join(f'<tr><td>{e}</td><td style="text-align:right;font-weight:700">{c}</td><td style="text-align:right">{round((c / total) * 100, 1) if total else 0}%</td></tr>' for e, c in counts.items())}
    </tbody>
  </table>
</div>

</div></body></html>"""

    return Response(html, mimetype="text/html")


@bp.route("/heatmap", methods=["GET"])
@jwt_required()
def heatmap():
    """Devuelve matriz [planta][semana] con el estado para mostrar como heatmap.

    Query params:
      - weeks: número de semanas hacia atrás (default 8, max 26)
    """
    from datetime import date, timedelta
    args = request.args
    n_weeks = min(int(args.get("weeks") or 8), 26)

    today = date.today()
    # Generar lista de (year, week) hacia atrás
    weeks = []
    cur = today
    for _ in range(n_weeks):
        iso = cur.isocalendar()
        weeks.append({"year": iso[0], "week": iso[1]})
        cur = cur - timedelta(days=7)
    weeks.reverse()  # más antigua primero

    # Plantas PV vigentes
    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv_vigente(p)]

    # Trae todas las revisiones de esas semanas
    if weeks:
        years_in = list({w["year"] for w in weeks})
        revs_all = (RevisionSemanal.query
                    .filter(RevisionSemanal.year.in_(years_in))
                    .all())
    else:
        revs_all = []

    # Indexar revisiones por (project_key, year, week)
    rev_idx = {}
    for r in revs_all:
        key = (r.project or "").strip().lower()
        rev_idx[(key, r.year, r.week)] = r

    plantas = []
    for p in pv:
        key = (p.project or "").strip().lower()
        celdas = []
        ok_count = 0; bad_count = 0; pend_count = 0
        for w in weeks:
            r = rev_idx.get((key, w["year"], w["week"]))
            if r:
                celdas.append({
                    "year": w["year"], "week": w["week"],
                    "estado": r.estado, "incidenciaId": r.incidencia_id,
                })
                if r.estado == "OK": ok_count += 1
                else: bad_count += 1
            else:
                celdas.append({
                    "year": w["year"], "week": w["week"],
                    "estado": None, "incidenciaId": None,
                })
                pend_count += 1
        plantas.append({
            "polizaId": p.id,
            "project": p.project,
            "code": p.code,
            "platform": p.platform,
            "grupo": p.grupo,
            "celdas": celdas,
            "okCount": ok_count,
            "badCount": bad_count,
            "pendCount": pend_count,
        })
    plantas.sort(key=lambda x: (x.get("project") or "").lower())
    return jsonify(weeks=weeks, plantas=plantas, totalPlantas=len(plantas))


@bp.route("/bulk", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento", "tecnico")
def bulk_save():
    """Guarda varias revisiones de la misma semana con el mismo estado.

    Body:
      { year, week, estado, polizaIds: [1, 2, ...], generarIncidencias: bool }
    """
    from datetime import date
    data = request.get_json(silent=True) or {}
    estado = parse_str(data.get("estado")) or "OK"
    if estado not in ESTADOS_REVISION:
        return jsonify(error="invalid_estado"), 400
    today = date.today()
    iso = today.isocalendar()
    year = parse_int(data.get("year")) or iso[0]
    week = parse_int(data.get("week")) or iso[1]
    poliza_ids = data.get("polizaIds") or []
    if not isinstance(poliza_ids, list) or not poliza_ids:
        return jsonify(error="missing_polizas"), 400
    generar_inc = bool(data.get("generarIncidencias"))

    claims = get_jwt() or {}
    creados = 0
    actualizados = 0
    incidencias = []

    for pid in poliza_ids:
        try:
            pid = int(pid)
        except (TypeError, ValueError):
            continue
        pol = db.session.get(Poliza, pid)
        if not pol:
            continue
        existing = RevisionSemanal.query.filter_by(
            project=pol.project, year=year, week=week
        ).first()
        target = existing or RevisionSemanal(project=pol.project, year=year, week=week)
        target.code = pol.code
        target.poliza_id = pol.id
        target.estado = estado
        target.revisado_por = claims.get("name")
        target.revisado_por_email = claims.get("email")
        target.fecha_revision = today

        if estado != "OK" and generar_inc and not target.incidencia_id:
            try:
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
                    site=pol.project, code=pol.code,
                    priority=prio_map.get(estado, "Intermedia"),
                    problem=problem_map.get(estado, estado),
                    notes=f"Generada en bulk desde revisión semanal "
                          f"({year}-W{week:02d}) — Estado: {estado}",
                    classification="COMUNICACIÓN" if estado == "Sin comunicación" else "INVERSOR",
                    inc_date=today,
                    status="abierta",
                    responsible=claims.get("name"),
                    client=pol.grupo,
                    platform=pol.platform,
                )
                db.session.add(inc)
                db.session.flush()
                target.incidencia_id = inc.id
                incidencias.append(inc.id)
            except Exception as e:
                print(f"⚠️  Error creando incidencia bulk para {pol.project}: {e}")

        if existing:
            actualizados += 1
        else:
            db.session.add(target)
            creados += 1

    db.session.commit()
    log_change("revisiones_semanales", "bulk",
               f"Bulk save {year}-W{week:02d}: {len(poliza_ids)} plantas marcadas '{estado}'")
    return jsonify(
        creados=creados, actualizados=actualizados,
        incidenciasGeneradas=incidencias,
        total=creados + actualizados,
    ), 201


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
