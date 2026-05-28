"""Generación de reporte profesional en HTML."""
from datetime import datetime
from collections import Counter

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.incidencia import Incidencia
from app.models.ticket import Ticket
from app.models.garantia import Garantia
from app.models.poliza import Poliza
from app.models.analisis import AnalisisPlanta, MONTHS
from app.utils.decorators import role_required

bp = Blueprint("reportes", __name__)


def _days_since(d):
    if not d:
        return None
    if hasattr(d, "date"):
        d = d.date()
    return (datetime.utcnow().date() - d).days


def _priority_badge(p):
    styles = {
        "Critico":    "background:#FEE2E2;color:#991B1B",
        "Alta":       "background:#FFEDD5;color:#9A3412",
        "Intermedia": "background:#FEF3C7;color:#92400E",
        "Baja":       "background:#DCFCE7;color:#166534",
    }
    s = styles.get(p, "background:#F1F5F9;color:#334155")
    return f'<span style="padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;{s}">{p or "—"}</span>'


def _status_badge(s):
    return f'<span style="padding:2px 6px;border-radius:10px;font-size:10px;background:#F1F5F9;color:#334155">{s or "—"}</span>'


def _days_cell(days, overdue_threshold=30):
    if days is None:
        return '<td style="color:#94A3B8">—</td>'
    color = "#DC2626" if days > overdue_threshold else "#15803D" if days <= 7 else "#9A3412"
    return f'<td style="font-weight:600;color:{color}">{days}d</td>'


@bp.route("/general", methods=["GET"])
@jwt_required()
@role_required("admin", "operator")
def reporte_general():
    """Genera un reporte HTML profesional con KPIs, incidencias, tickets, garantías y pólizas."""
    incs = Incidencia.query.order_by(Incidencia.inc_date.desc().nullslast()).all()
    tickets = Ticket.query.order_by(Ticket.open_date.desc().nullslast()).all()
    garantias = Garantia.query.order_by(Garantia.upload_date.desc().nullslast()).all()
    polizas = Poliza.query.all()

    today = datetime.utcnow().date()

    # KPIs
    inc_abiertas = [i for i in incs if (i.status or "").lower() == "abierta"]
    inc_criticas = [i for i in incs if (i.priority or "") == "Critico"]
    inc_alta = [i for i in incs if (i.priority or "") == "Alta"]

    tk_abiertos = [t for t in tickets if (t.status or "") != "Cerrado"]
    tk_vencidos = [t for t in tk_abiertos if t.due_date and t.due_date < today]

    g_abiertas = [g for g in garantias if (g.status or "").lower() not in ("cerrada", "rechazada", "aprobada")]

    pol_vencidas = [p for p in polizas if p.pol_end and p.pol_end < today]
    pol_pronto = [p for p in polizas if p.pol_end and today <= p.pol_end <= today.replace(year=today.year) and (p.pol_end - today).days <= 60]
    pol_vigentes = [p for p in polizas if p.pol_end and p.pol_end >= today]

    # Top clientes por incidencias
    client_counts = Counter((i.client or "—") for i in incs).most_common(5)
    max_c = client_counts[0][1] if client_counts else 1

    # ── HTML ──
    fecha_str = today.strftime("%d de %B de %Y").replace("January", "enero").replace("February", "febrero").replace("March", "marzo").replace("April", "abril").replace("May", "mayo").replace("June", "junio").replace("July", "julio").replace("August", "agosto").replace("September", "septiembre").replace("October", "octubre").replace("November", "noviembre").replace("December", "diciembre")

    def _short(t, n=120):
        if not t: return '—'
        s = str(t).replace('\n', ' ').strip()
        return (s[:n] + '…') if len(s) > n else s

    # Filas incidencias — ahora con Problema / Causa / Solución
    inc_rows = ""
    for i in incs[:15]:
        d = _days_since(i.inc_date)
        d_cell = _days_cell(d, overdue_threshold=30)
        inc_rows += f"""<tr>
            <td>{(i.site or '')[:30]}</td>
            <td>{(i.client or '')[:20]}</td>
            <td>{_priority_badge(i.priority)}</td>
            <td style="font-size:10px">{_short(i.problem, 90)}</td>
            <td style="font-size:10px;color:#475569">{_short(i.cause, 90)}</td>
            <td style="font-size:10px;color:#15803d">{_short(i.solution, 90)}</td>
            {d_cell}
        </tr>"""

    # Tickets activos
    tk_rows = ""
    for t in tk_abiertos[:15]:
        d = _days_since(t.open_date)
        overdue = t.due_date and t.due_date < today
        row_style = ' style="background:#FFF5F5"' if overdue else ''
        due_str = ""
        if t.due_date:
            due_str = f'{t.due_date.isoformat()} ⚠' if overdue else t.due_date.isoformat()
        d_cell = _days_cell(d, overdue_threshold=15)
        tk_rows += f"""<tr{row_style}>
            <td style="font-family:monospace;font-size:10px;font-weight:700">TKT-{t.id:03d}</td>
            <td>{(t.site or t.title or '')[:25]}</td>
            <td>{_priority_badge(t.priority)}</td>
            <td>{t.assigned_to or '—'}</td>
            <td>—</td>
            <td style="{'color:#DC2626;font-weight:700' if overdue else ''}">{due_str or '—'}</td>
            <td>{_status_badge(t.status)}</td>
            {d_cell}
        </tr>"""

    # Garantías activas
    g_rows = ""
    for g in g_abiertas[:10]:
        d = _days_since(g.upload_date or (g.created_at.date() if g.created_at else None))
        d_cell = _days_cell(d, overdue_threshold=60)
        g_rows += f"""<tr>
            <td>{(g.project or '')[:25]}</td>
            <td>{g.equipment or '—'}</td>
            <td>{g.brand or '—'}</td>
            <td>{g.error or '—'}</td>
            <td>{_status_badge(g.status)}</td>
            {d_cell}
        </tr>"""

    # ── Análisis PV: solo plantas vigentes con datos del mes actual ──
    mes_idx = today.month - 1
    mes_nombre = MONTHS[mes_idx]
    pol_vigentes_set = {(p.project or "").strip().lower() for p in pol_vigentes}
    analisis = AnalisisPlanta.query.all()
    pv_rows = []
    sum_gar = sum_gen = 0
    cumplen_n = 0
    for a in analisis:
        key = (a.project or "").strip().lower()
        if key not in pol_vigentes_set:
            continue
        import json as _json
        try:
            gar = _json.loads(a.garantizado or "{}").get(mes_nombre)
            gen = _json.loads(a.generado_mes or "{}").get(mes_nombre)
        except Exception:
            gar, gen = None, None
        if not gar:
            continue
        pct = round((gen / gar) * 100, 1) if gen and gar > 0 else None
        cumple = pct is not None and pct >= 100
        if cumple: cumplen_n += 1
        sum_gar += gar
        if gen: sum_gen += gen
        pv_rows.append({
            "project": a.project, "potencia": a.potencia_kwp,
            "gar": gar, "gen": gen, "pct": pct, "cumple": cumple,
            "fallas": a.fallas, "responsable": a.responsable,
        })
    pv_rows.sort(key=lambda x: (x["pct"] if x["pct"] is not None else -1))
    pct_global = round((sum_gen / sum_gar) * 100, 1) if sum_gar > 0 else 0

    pv_table = ""
    for r in pv_rows[:30]:
        pct_str = f"{r['pct']}%" if r["pct"] is not None else "—"
        color = "#15803D" if r["cumple"] else ("#DC2626" if r["pct"] is not None else "#94A3B8")
        pv_table += f"""<tr>
            <td>{(r['project'] or '')[:38]}</td>
            <td style="text-align:right">{r['potencia']:.1f}</td>
            <td style="text-align:right">{r['gar']:.0f}</td>
            <td style="text-align:right">{(r['gen'] or 0):.0f}</td>
            <td style="text-align:right;font-weight:700;color:{color}">{pct_str}</td>
            <td style="font-size:10px">{(r['fallas'] or '')[:60]}</td>
        </tr>""" if r["potencia"] else f"""<tr>
            <td>{(r['project'] or '')[:38]}</td>
            <td style="text-align:right;color:#94A3B8">—</td>
            <td style="text-align:right">{r['gar']:.0f}</td>
            <td style="text-align:right">{(r['gen'] or 0):.0f}</td>
            <td style="text-align:right;font-weight:700;color:{color}">{pct_str}</td>
            <td style="font-size:10px">{(r['fallas'] or '')[:60]}</td>
        </tr>"""

    # Pólizas por vencer
    pol_rows = ""
    pol_proximas = sorted(
        [p for p in polizas if p.pol_end and (p.pol_end - today).days <= 90 and p.pol_end >= today],
        key=lambda p: p.pol_end,
    )[:15]
    for p in pol_proximas:
        d = (p.pol_end - today).days
        color = "#DC2626" if d <= 15 else "#9A3412" if d <= 30 else "#15803D"
        pol_rows += f"""<tr>
            <td>{(p.project or '')[:30]}</td>
            <td>{p.code or '—'}</td>
            <td>{p.grupo or '—'}</td>
            <td>{p.pol_end.isoformat()}</td>
            <td style="font-weight:600;color:{color}">{d}d</td>
        </tr>"""

    # Barras top clientes
    client_bars = ""
    for name, cnt in client_counts:
        w = max(int(280 * cnt / max_c), 20)
        client_bars += f"""<div class="client-bar">
            <div class="name">{name}</div>
            <div class="bar" style="width:{w}px"></div>
            <div class="cnt">{cnt}</div>
        </div>"""

    # Conclusiones
    conclusiones = []
    if inc_criticas:
        conclusiones.append(f"⚠️ Existen <strong>{len(inc_criticas)}</strong> incidencias críticas que requieren atención inmediata.")
    if tk_vencidos:
        conclusiones.append(f"🔴 <strong>{len(tk_vencidos)}</strong> ticket(s) han superado su fecha compromiso — riesgo de SLA.")
    if pol_vencidas:
        conclusiones.append(f"🔴 <strong>{len(pol_vencidas)}</strong> póliza(s) vencida(s). Revisar continuidad de servicio.")
    if pol_pronto:
        conclusiones.append(f"⏰ <strong>{len(pol_pronto)}</strong> póliza(s) próximas a vencer en 60 días.")
    if g_abiertas:
        conclusiones.append(f"🛡 <strong>{len(g_abiertas)}</strong> garantía(s) activa(s) sin cierre.")
    if not conclusiones:
        conclusiones.append("✅ Operación al día — sin alertas críticas.")

    conclusiones_html = "".join(f"<li>{c}</li>" for c in conclusiones)

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Reporte SKY PV — {today.isoformat()}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:Arial,sans-serif;font-size:12px;color:#1E293B;background:#F8FAFC}}
.page{{max-width:960px;margin:auto;background:white;padding:0;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
.cover{{background:linear-gradient(135deg,#1E3A5F 0%,#0EA5E9 100%);padding:48px 48px 40px;color:white}}
.cover h1{{font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px}}
.cover p{{opacity:.8;font-size:13px}}
.cover .meta{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:28px}}
.cover .meta-item .lbl{{font-size:9px;text-transform:uppercase;letter-spacing:.1em;opacity:.6;margin-bottom:3px}}
.cover .meta-item .val{{font-size:13px;font-weight:600}}
.section{{padding:32px 40px;border-bottom:1px solid #E2E8F0}}
.section-title{{font-size:16px;font-weight:800;color:#1E3A5F;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #0EA5E9;display:flex;align-items:center;gap:8px}}
.kpi-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:4px}}
.kpi-card{{border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;background:#F8FAFC}}
.kpi-card .lbl{{font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}}
.kpi-card .val{{font-size:28px;font-weight:800}}
.kpi-card .sub{{font-size:10px;color:#94A3B8;margin-top:3px}}
table{{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px}}
th{{background:#1E3A5F;color:white;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}}
td{{padding:7px 10px;border-bottom:1px solid #F1F5F9}}
tr:hover td{{background:#F8FAFC}}
.concl-list{{list-style:none;padding:0}}
.concl-list li{{padding:10px 14px;margin-bottom:8px;border-left:3px solid #0EA5E9;background:#F0F9FF;border-radius:0 6px 6px 0;font-size:12px;line-height:1.5}}
.client-bar{{display:flex;align-items:center;gap:10px;margin-bottom:6px}}
.client-bar .name{{min-width:160px;font-size:11px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.client-bar .bar{{height:16px;background:#0EA5E9;border-radius:3px;min-width:4px}}
.client-bar .cnt{{font-size:11px;font-weight:700;color:#0EA5E9;min-width:24px}}
.footer{{text-align:center;padding:20px;background:#0F172A;color:#94A3B8;font-size:10px}}
@media print{{body{{background:white}}.page{{box-shadow:none;max-width:100%}}@page{{margin:1cm}}}}
.actions{{position:fixed;top:20px;right:20px;display:flex;gap:8px;z-index:100}}
.actions button{{background:#0EA5E9;color:white;border:0;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2)}}
.actions button:hover{{background:#0284C7}}
@media print{{.actions{{display:none}}}}
</style></head>
<body>
<div class="actions">
  <button onclick="window.print()">🖨 Imprimir / PDF</button>
</div>
<div class="page">

<div class="cover">
  <h1>☀ SKY Energía — Reporte PV</h1>
  <p>Sistema de Gestión de Monitoreo Fotovoltaico</p>
  <div class="meta">
    <div class="meta-item"><div class="lbl">Fecha de generación</div><div class="val">{fecha_str}</div></div>
    <div class="meta-item"><div class="lbl">Total incidencias</div><div class="val">{len(incs)} incidencias</div></div>
    <div class="meta-item"><div class="lbl">Generado por</div><div class="val">SKY PV Monitor</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">📊 Resumen Ejecutivo</div>
  <div class="kpi-grid">
    <div class="kpi-card"><div class="lbl">Incidencias</div><div class="val" style="color:#0EA5E9">{len(incs)}</div><div class="sub">{len(inc_criticas)} críticas · {len(inc_alta)} alta</div></div>
    <div class="kpi-card"><div class="lbl">Tickets activos</div><div class="val" style="color:#F59E0B">{len(tk_abiertos)}</div><div class="sub">{len(tk_vencidos)} vencidos</div></div>
    <div class="kpi-card"><div class="lbl">Garantías activas</div><div class="val" style="color:#8B5CF6">{len(g_abiertas)}</div><div class="sub">{len(garantias)} total registradas</div></div>
    <div class="kpi-card"><div class="lbl">Pólizas</div><div class="val" style="color:#EF4444">{len(pol_vencidas)} vencidas</div><div class="sub">{len(pol_pronto)} por vencer pronto</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">⚠️ Alertas y Conclusiones</div>
  <ul class="concl-list">{conclusiones_html}</ul>
</div>

<div class="section">
  <div class="section-title">📋 Incidencias por cliente (top)</div>
  {client_bars or '<p style="color:#94A3B8">Sin datos.</p>'}
</div>

<div class="section">
  <div class="section-title">🔴 Incidencias (últimas {len(incs[:15])})</div>
  <table><thead><tr><th>Proyecto</th><th>Cliente</th><th>Prioridad</th><th>Problema</th><th>Causa</th><th>Solución</th><th>Días</th></tr></thead>
  <tbody>{inc_rows or '<tr><td colspan="7" style="text-align:center;color:#94A3B8">Sin incidencias.</td></tr>'}</tbody></table>
</div>

<div class="section">
  <div class="section-title">🎫 Tickets Activos ({len(tk_abiertos)})</div>
  <table><thead><tr><th>ID</th><th>Proyecto</th><th>Prioridad</th><th>Responsable</th><th>F. Visita</th><th>F. Compromiso</th><th>Estatus</th><th>Días</th></tr></thead>
  <tbody>{tk_rows or '<tr><td colspan="8" style="text-align:center;color:#94A3B8">Sin tickets activos.</td></tr>'}</tbody></table>
</div>

<div class="section">
  <div class="section-title">🛡 Garantías Activas ({len(g_abiertas)})</div>
  <table><thead><tr><th>Proyecto</th><th>Equipo</th><th>Marca</th><th>Falla</th><th>Estado</th><th>Días</th></tr></thead>
  <tbody>{g_rows or '<tr><td colspan="6" style="text-align:center;color:#94A3B8">Sin garantías activas.</td></tr>'}</tbody></table>
</div>

<div class="section">
  <div class="section-title">☀ Análisis de datos — Plantas PV vigentes (mes: {mes_nombre.capitalize()})</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    <div class="kpi-card"><div class="lbl">Plantas analizadas</div><div class="val" style="color:#0EA5E9;font-size:22px">{len(pv_rows)}</div></div>
    <div class="kpi-card"><div class="lbl">Garantizado ({mes_nombre[:3]})</div><div class="val" style="color:#8B5CF6;font-size:22px">{sum_gar:,.0f}</div><div class="sub">kWh</div></div>
    <div class="kpi-card"><div class="lbl">Generado ({mes_nombre[:3]})</div><div class="val" style="color:#F59E0B;font-size:22px">{sum_gen:,.0f}</div><div class="sub">kWh</div></div>
    <div class="kpi-card"><div class="lbl">Cumplimiento</div><div class="val" style="color:{'#15803D' if pct_global >= 100 else '#DC2626'};font-size:22px">{pct_global}%</div><div class="sub">{cumplen_n} / {len(pv_rows)} cumplen</div></div>
  </div>
  <table><thead><tr><th>Proyecto</th><th style="text-align:right">kWp</th><th style="text-align:right">Garantizado</th><th style="text-align:right">Generado</th><th style="text-align:right">%</th><th>Fallas / notas</th></tr></thead>
  <tbody>{pv_table or '<tr><td colspan="6" style="text-align:center;color:#94A3B8">Sin datos del mes.</td></tr>'}</tbody></table>
  <div style="font-size:10px;color:#94A3B8;margin-top:6px">
    Sólo se incluyen plantas con póliza vigente y datos del mes en curso.
  </div>
</div>

<div class="section">
  <div class="section-title">📅 Pólizas próximas a vencer (90 días)</div>
  <table><thead><tr><th>Proyecto</th><th>Código</th><th>Cliente</th><th>Vence</th><th>Días restantes</th></tr></thead>
  <tbody>{pol_rows or '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Ninguna por vencer.</td></tr>'}</tbody></table>
</div>

<div class="footer">
  SKY Energía · Reporte generado automáticamente el {today.isoformat()} · SKY PV Monitor
</div>
</div></body></html>"""

    return Response(html, mimetype="text/html")
