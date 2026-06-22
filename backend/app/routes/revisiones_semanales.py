"""Revisión DIARIA de plantas SFV (PV) en garantía vigente.

Mantiene el nombre histórico de la tabla/blueprint por compatibilidad.
"""
from datetime import date, datetime, timedelta

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required

from app import db
from app.models.revision_semanal import RevisionSemanal, ESTADOS_REVISION
from app.models.poliza import Poliza
from app.models.incidencia import Incidencia
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("revisiones_semanales", __name__)


def _hoy():
    return date.today()


def _parse_iso_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _es_pv(p):
    """Determina si la póliza es de tipo PV (o híbrido). Permisivo: por defecto SI."""
    if not p:
        return False
    tipo = (p.poliza or "").upper()
    code_up = (p.code or "").upper()
    # Excluir SOLO si es BESS puro sin componente PV
    if "BESS" in tipo and "PV" not in tipo and "FV" not in tipo and "HÍBRIDO" not in tipo and "HIBRIDO" not in tipo and "-HB" not in code_up:
        return False
    if "-BT" in code_up and "-FV" not in code_up and "-HB" not in code_up:
        return False
    return True   # cualquier otra cosa la consideramos PV/híbrido


def _es_vigente(p):
    """Vigente = sin fecha fin o fin >= hoy."""
    return (p.pol_end is None) or (p.pol_end >= date.today())


def _es_pv_vigente(p):
    """Compat: mantenido por si lo usa algún otro módulo."""
    return _es_pv(p) and _es_vigente(p)


def _rev_for_day(rev_list, target_date):
    """De una lista de revisiones de un proyecto, devuelve SOLO la del día exacto.
    Cada día es independiente — sin fallback semanal."""
    for r in rev_list:
        if r.fecha and r.fecha == target_date:
            return r
    return None


@bp.route("/marcar-como-pv", methods=["POST"])
@jwt_required()
@role_required("admin")
def marcar_como_pv():
    """Marca las pólizas indicadas (por id o nombre de proyecto) como tipo 'PV'.

    Body: { polizaIds: [...] } o { projects: ["NombreA", "NombreB"] }
    """
    data = request.get_json(silent=True) or {}
    poliza_ids = data.get("polizaIds") or []
    projects = data.get("projects") or []
    cambios = 0
    if poliza_ids:
        for pid in poliza_ids:
            try:
                p = db.session.get(Poliza, int(pid))
                if p:
                    p.poliza = "PV"
                    cambios += 1
            except Exception:
                pass
    if projects:
        for name in projects:
            if not name: continue
            pols = Poliza.query.filter(Poliza.project.ilike(f"%{name}%")).all()
            for p in pols:
                p.poliza = "PV"
                cambios += 1
    db.session.commit()
    return jsonify(ok=True, cambios=cambios)


@bp.route("/estados", methods=["GET"])
@jwt_required()
def list_estados():
    return jsonify(ESTADOS_REVISION)


@bp.route("/plantas", methods=["GET"])
@jwt_required()
def list_plantas():
    """Devuelve plantas PV vigentes con el estado de revisión del día solicitado.

    Query params:
      - fecha=YYYY-MM-DD (default hoy)
      - solo_pendientes=1
    """
    args = request.args
    fecha = _parse_iso_date(args.get("fecha")) or _hoy()
    solo_pendientes = args.get("solo_pendientes") in ("1", "true", "yes")

    # Pólizas PV vigentes
    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv(p) and _es_vigente(p)]   # solo PV en garantía vigente

    # Trae todas las revisiones del proyecto en cuestión (un poco amplio, pero simple)
    # Indexamos por project (lowercase) y mantenemos lista de RevisionSemanal
    project_names = {(p.project or "").strip().lower() for p in pv}
    if project_names:
        revs_all = RevisionSemanal.query.all()
    else:
        revs_all = []
    by_project = {}
    for r in revs_all:
        key = (r.project or "").strip().lower()
        by_project.setdefault(key, []).append(r)

    out = []
    iso = fecha.isocalendar()
    for p in pv:
        key = (p.project or "").strip().lower()
        revs = by_project.get(key, [])
        rev = _rev_for_day(revs, fecha)
        d = {
            "polizaId": p.id,
            "project": p.project,
            "code": p.code,
            "grupo": p.grupo,
            "platform": p.platform,
            "zona": p.zona,
            "tipoPoliza": p.poliza,
            "polEnd": p.pol_end.isoformat() if p.pol_end else None,
            "vigente": _es_vigente(p),
            "fecha": fecha.isoformat(),
            "year": iso[0],
            "week": iso[1],
            "estado": rev.estado if rev else None,
            "observaciones": rev.observaciones if rev else None,
            "revisadoPor": rev.revisado_por if rev else None,
            "fechaRevision": rev.fecha_revision.isoformat() if rev and rev.fecha_revision else None,
            "incidenciaId": rev.incidencia_id if rev else None,
            "revisionId": rev.id if rev else None,
        }
        # Bonus: estado del día anterior para contexto
        ayer = fecha - timedelta(days=1)
        rev_ayer = _rev_for_day(revs, ayer)
        d["estadoAyer"] = rev_ayer.estado if rev_ayer else None
        if solo_pendientes and rev:
            continue
        out.append(d)
    out.sort(key=lambda x: (x.get("project") or "").lower())
    return jsonify({
        "fecha": fecha.isoformat(),
        "isToday": fecha == _hoy(),
        "year": iso[0],
        "week": iso[1],
        "total": len(out),
        "revisadas": len([x for x in out if x["estado"]]),
        "pendientes": len([x for x in out if not x["estado"]]),
        "plantas": out,
    })


@bp.route("/historial/<int:poliza_id>", methods=["GET"])
@jwt_required()
def historial(poliza_id):
    pol = db.session.get(Poliza, poliza_id)
    if not pol:
        return jsonify([])
    revs = (RevisionSemanal.query
            .filter_by(project=pol.project)
            .order_by(RevisionSemanal.fecha.desc().nullslast(),
                      RevisionSemanal.year.desc(), RevisionSemanal.week.desc())
            .limit(30).all())
    return jsonify([r.to_dict() for r in revs])


@bp.route("/reporte", methods=["GET"])
@jwt_required()
def reporte_html():
    """Reporte HTML SEMANAL imprimible: lunes a domingo de la semana que contiene `fecha`."""
    args = request.args
    fecha = _parse_iso_date(args.get("fecha")) or _hoy()
    # Calcular lunes de la semana ISO que contiene `fecha`
    iso_dow = fecha.isoweekday()   # 1=Lun .. 7=Dom
    lunes = fecha - timedelta(days=iso_dow - 1)
    dias = [lunes + timedelta(days=i) for i in range(7)]
    dia_labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv(p) and _es_vigente(p)]
    revs_all = RevisionSemanal.query.all()
    by_project = {}
    for r in revs_all:
        key = (r.project or "").strip().lower()
        by_project.setdefault(key, []).append(r)

    estado_color = {
        "OK":               ("#dcfce7", "#166534", "✓"),
        "Sin comunicación": ("#fef3c7", "#92400e", "📡"),
        "Falla":            ("#fee2e2", "#991b1b", "✗"),
        "Falta de datos":   ("#dbeafe", "#1e40af", "?"),
        "Por entregar":     ("#ede9fe", "#5b21b6", "📦"),
        "No aplica":        ("#e5e7eb", "#374151", "N/A"),
    }
    pendiente_style = ("#f3f4f6", "#94a3b8", "—")

    rows_html = ""
    totals = {"OK": 0, "Sin comunicación": 0, "Falla": 0, "Falta de datos": 0,
              "Por entregar": 0, "No aplica": 0, "Pendiente": 0}
    revisadas_unicas = 0

    for p in sorted(pv, key=lambda x: (x.project or "").lower()):
        key = (p.project or "").strip().lower()
        revs = by_project.get(key, [])
        cells = ""
        tiene_alguna = False
        for d in dias:
            r = _rev_for_day(revs, d)
            if r:
                bg, fg, icon = estado_color.get(r.estado, pendiente_style)
                totals[r.estado] = totals.get(r.estado, 0) + 1
                tooltip = f"{r.estado} · {d.strftime('%d/%m')}"
                if r.observaciones:
                    tooltip += f" · {r.observaciones[:60]}"
                cells += f'<td title="{tooltip}" style="text-align:center;background:{bg};color:{fg};font-weight:700">{icon}</td>'
                tiene_alguna = True
            else:
                totals["Pendiente"] += 1
                cells += f'<td title="Sin revisar · {d.strftime("%d/%m")}" style="text-align:center;background:#fafbfc;color:#cbd5e1">·</td>'
        if tiene_alguna:
            revisadas_unicas += 1

        # Observaciones consolidadas (de cualquier día con observación)
        notas = []
        for d in dias:
            r = _rev_for_day(revs, d)
            if r and r.observaciones:
                notas.append(f"{d.strftime('%a %d')}: {r.observaciones[:80]}")
        notas_txt = " | ".join(notas)[:200]

        rows_html += f"""<tr>
            <td style="font-weight:600">{p.project or '—'}</td>
            <td style="font-family:monospace;font-size:10px;color:#64748b">{p.code or '—'}</td>
            <td style="font-size:10px;color:#64748b">{p.platform or '—'}</td>
            {cells}
            <td style="font-size:10px;color:#475569">{notas_txt}</td>
        </tr>"""

    total_plantas = len(pv)
    total_slots = total_plantas * 7
    completadas = total_slots - totals["Pendiente"]
    pct = round((completadas / total_slots) * 100, 1) if total_slots else 0
    con_problema = totals["Sin comunicación"] + totals["Falla"] + totals["Falta de datos"]

    headers_dias = "".join(
        f'<th style="text-align:center;min-width:42px">{lbl}<br><span style="font-size:9px;opacity:.7;font-weight:400">{d.strftime("%d/%m")}</span></th>'
        for lbl, d in zip(dia_labels, dias)
    )

    semana_str = f"{lunes.strftime('%d/%m/%Y')} – {dias[-1].strftime('%d/%m/%Y')}"
    year_iso, week_iso, _ = lunes.isocalendar()

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Reporte Semanal SFV — Semana {week_iso} {year_iso}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:Arial,sans-serif;font-size:12px;color:#1E293B;background:#F8FAFC;padding:0}}
.page{{max-width:1200px;margin:auto;background:white;padding:0;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
.cover{{background:linear-gradient(135deg,#0B1736 0%,#0033A0 100%);padding:32px 40px;color:white}}
.cover h1{{font-size:24px;font-weight:800;margin-bottom:6px}}
.cover p{{opacity:.85;font-size:13px}}
.kpis{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:20px 40px;background:#f8fafc}}
.kpi{{background:white;padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0}}
.kpi .lbl{{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}}
.kpi .val{{font-size:22px;font-weight:800;margin-top:4px}}
.section{{padding:18px 40px}}
.section-title{{font-size:14px;font-weight:800;color:#0B1736;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #0033A0}}
table{{width:100%;border-collapse:collapse;font-size:11px}}
th{{background:#0B1736;color:white;padding:7px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase}}
td{{padding:5px 8px;border-bottom:1px solid #f1f5f9}}
tr:nth-child(even) td{{background:#fafbfc}}
.legend{{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:11px}}
.legend span{{display:inline-flex;align-items:center;gap:5px}}
.legend i{{display:inline-block;width:14px;height:14px;border-radius:3px;font-style:normal;text-align:center;line-height:14px;font-size:9px;font-weight:700}}
.actions{{position:fixed;top:20px;right:20px;display:flex;gap:8px;z-index:100}}
.actions button{{background:#0033A0;color:white;border:0;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2)}}
@media print{{body{{background:white}}.page{{box-shadow:none;max-width:100%}}.actions{{display:none}}@page{{margin:.8cm;size:landscape}}}}
</style></head>
<body>
<div class="actions"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>
<div class="page">
<div class="cover">
  <h1>☀ Reporte Semanal de Revisión SFV</h1>
  <p>Semana ISO <strong>{week_iso}</strong> · {semana_str} · {total_plantas} plantas PV vigentes</p>
</div>
<div class="kpis">
  <div class="kpi"><div class="lbl">Plantas</div><div class="val" style="color:#0B1736">{total_plantas}</div></div>
  <div class="kpi"><div class="lbl">Revisiones</div><div class="val" style="color:#0033A0">{completadas} / {total_slots}</div></div>
  <div class="kpi"><div class="lbl">Cumplimiento</div><div class="val" style="color:{'#16A34A' if pct >= 90 else '#F59E0B' if pct >= 50 else '#DC2626'}">{pct}%</div></div>
  <div class="kpi"><div class="lbl">OK</div><div class="val" style="color:#16A34A">{totals.get('OK', 0)}</div></div>
  <div class="kpi"><div class="lbl">Con problema</div><div class="val" style="color:#DC2626">{con_problema}</div></div>
</div>
<div class="section">
  <div class="section-title">📋 Matriz semanal por planta</div>
  <table>
    <thead><tr>
      <th>Proyecto</th><th>Código</th><th>Plataforma</th>
      {headers_dias}
      <th>Observaciones</th>
    </tr></thead>
    <tbody>{rows_html or '<tr><td colspan="11" style="text-align:center;color:#94a3b8">Sin plantas.</td></tr>'}</tbody>
  </table>
  <div class="legend">
    <span><i style="background:#dcfce7;color:#166534">✓</i> OK</span>
    <span><i style="background:#fef3c7;color:#92400e">📡</i> Sin comunicación</span>
    <span><i style="background:#fee2e2;color:#991b1b">✗</i> Falla</span>
    <span><i style="background:#dbeafe;color:#1e40af">?</i> Falta de datos</span>
    <span><i style="background:#ede9fe;color:#5b21b6">📦</i> Por entregar</span>
    <span><i style="background:#e5e7eb;color:#374151">N/A</i> No aplica</span>
    <span><i style="background:#fafbfc;color:#cbd5e1">·</i> Sin revisar</span>
  </div>
</div>
</div></body></html>"""
    return Response(html, mimetype="text/html")


@bp.route("/heatmap", methods=["GET"])
@jwt_required()
def heatmap():
    """Matriz [planta][día] con el estado de las últimas N fechas (default 14)."""
    args = request.args
    n_days = min(int(args.get("days") or 14), 60)

    today = _hoy()
    dias = []
    for i in range(n_days):
        dia = today - timedelta(days=n_days - 1 - i)
        dias.append({"fecha": dia.isoformat(), "label": dia.strftime("%d/%m")})

    polizas = Poliza.query.all()
    pv = [p for p in polizas if _es_pv(p) and _es_vigente(p)]   # solo PV en garantía vigente
    revs_all = RevisionSemanal.query.all()
    by_project = {}
    for r in revs_all:
        key = (r.project or "").strip().lower()
        by_project.setdefault(key, []).append(r)

    plantas = []
    for p in pv:
        key = (p.project or "").strip().lower()
        revs = by_project.get(key, [])
        celdas = []
        ok_count = 0; bad_count = 0; pend_count = 0
        for d in dias:
            target = datetime.strptime(d["fecha"], "%Y-%m-%d").date()
            r = _rev_for_day(revs, target)
            if r:
                celdas.append({
                    "fecha": d["fecha"],
                    "estado": r.estado,
                    "incidenciaId": r.incidencia_id,
                })
                if r.estado == "OK": ok_count += 1
                else: bad_count += 1
            else:
                celdas.append({"fecha": d["fecha"], "estado": None, "incidenciaId": None})
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
    return jsonify(dias=dias, plantas=plantas, totalPlantas=len(plantas))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento", "tecnico")
def upsert():
    """Crea o actualiza una revisión diaria. Si el estado no es OK y
    `generarIncidencia` está en True, crea una incidencia asociada."""
    data = request.get_json(silent=True) or {}
    project = parse_str(data.get("project"))
    if not project:
        return jsonify(error="missing_project"), 400
    estado = parse_str(data.get("estado")) or "OK"
    if estado not in ESTADOS_REVISION:
        return jsonify(error="invalid_estado",
                       message=f"Estado debe ser uno de: {', '.join(ESTADOS_REVISION)}"), 400

    fecha = _parse_iso_date(data.get("fecha")) or _hoy()
    iso = fecha.isocalendar()
    claims = get_jwt() or {}

    # Buscar revisión existente del MISMO DÍA EXACTO (sin fallback semanal)
    existing = (RevisionSemanal.query
                .filter_by(project=project, fecha=fecha).first())

    target = existing or RevisionSemanal(project=project)
    target.fecha = fecha
    target.year = iso[0]
    target.week = iso[1]
    target.estado = estado
    target.observaciones = parse_str(data.get("observaciones"))
    target.code = parse_str(data.get("code"))
    target.poliza_id = parse_int(data.get("polizaId"))
    target.revisado_por = claims.get("name")
    target.revisado_por_email = claims.get("email")
    target.fecha_revision = _hoy()

    incidencia_created = None
    if estado != "OK" and bool(data.get("generarIncidencia")) and not target.incidencia_id:
        try:
            prio_map = {
                "Sin comunicación": "Alta",
                "Falla": "Critico",
                "Falta de datos": "Intermedia",
            }
            problem_map = {
                "Sin comunicación": "Sin comunicación con el equipo",
                "Falla": "Falla detectada en revisión diaria",
                "Falta de datos": "Falta de datos en revisión",
            }
            inc = Incidencia(
                site=project,
                code=target.code,
                priority=prio_map.get(estado, "Intermedia"),
                problem=problem_map.get(estado, estado),
                notes=f"Generada automáticamente desde revisión diaria del {fecha.isoformat()} — Estado: {estado}\n\n"
                      f"{data.get('observaciones') or ''}",
                classification="COMUNICACIÓN" if estado == "Sin comunicación" else "INVERSOR",
                inc_date=fecha,
                status="abierta",
                responsible=claims.get("name"),
            )
            if target.poliza_id:
                pol = db.session.get(Poliza, target.poliza_id)
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

    if not existing:
        db.session.add(target)
    log_change("revisiones_semanales",
               "actualizar" if existing else "crear",
               f"Revisión {project} {fecha.isoformat()}: {estado}",
               new=target.to_dict())
    db.session.commit()
    return jsonify(revision=target.to_dict(), incidenciaCreated=incidencia_created), 201


@bp.route("/bulk", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento", "tecnico")
def bulk_save():
    """Guarda varias revisiones del MISMO DÍA con el mismo estado.

    Body: { fecha: 'YYYY-MM-DD', estado, polizaIds: [...], generarIncidencias: bool }
    """
    data = request.get_json(silent=True) or {}
    estado = parse_str(data.get("estado")) or "OK"
    if estado not in ESTADOS_REVISION:
        return jsonify(error="invalid_estado"), 400
    fecha = _parse_iso_date(data.get("fecha")) or _hoy()
    iso = fecha.isocalendar()
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
        existing = (RevisionSemanal.query
                    .filter_by(project=pol.project, fecha=fecha).first())
        target = existing or RevisionSemanal(project=pol.project)
        target.fecha = fecha
        target.year = iso[0]
        target.week = iso[1]
        target.code = pol.code
        target.poliza_id = pol.id
        target.estado = estado
        target.revisado_por = claims.get("name")
        target.revisado_por_email = claims.get("email")
        target.fecha_revision = _hoy()

        if estado != "OK" and generar_inc and not target.incidencia_id:
            try:
                prio_map = {"Sin comunicación": "Alta", "Falla": "Critico", "Falta de datos": "Intermedia"}
                problem_map = {
                    "Sin comunicación": "Sin comunicación con el equipo",
                    "Falla": "Falla detectada en revisión diaria",
                    "Falta de datos": "Falta de datos en revisión",
                }
                inc = Incidencia(
                    site=pol.project, code=pol.code,
                    priority=prio_map.get(estado, "Intermedia"),
                    problem=problem_map.get(estado, estado),
                    notes=f"Generada en bulk desde revisión diaria del {fecha.isoformat()} — Estado: {estado}",
                    classification="COMUNICACIÓN" if estado == "Sin comunicación" else "INVERSOR",
                    inc_date=fecha,
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
                print(f"⚠️  Error creando incidencia bulk: {e}")

        if existing:
            actualizados += 1
        else:
            db.session.add(target)
            creados += 1

    db.session.commit()
    log_change("revisiones_semanales", "bulk",
               f"Bulk save {fecha.isoformat()}: {len(poliza_ids)} plantas '{estado}'")
    return jsonify(
        creados=creados, actualizados=actualizados,
        incidenciasGeneradas=incidencias,
        total=creados + actualizados,
    ), 201
