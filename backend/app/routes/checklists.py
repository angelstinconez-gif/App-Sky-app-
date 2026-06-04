"""CRUD de checklists post-venta C&I + descarga HTML."""
import json

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.checklist import Checklist
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("checklists", __name__)


def _to_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return parse_str(value)


@bp.route("", methods=["GET"])
@jwt_required()
def list_c():
    args = request.args
    q = Checklist.query
    if args.get("ticketId"):
        q = q.filter(Checklist.ticket_id == int(args["ticketId"]))
    if args.get("resultado"):
        q = q.filter(Checklist.resultado == args["resultado"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Checklist.project.ilike(like),
            Checklist.cliente.ilike(like),
            Checklist.modelo.ilike(like),
            Checklist.sn_inversor.ilike(like),
        ))
    items = q.order_by(Checklist.fecha_visita.desc().nullslast(), Checklist.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
def get_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    return jsonify(c.to_dict())


@bp.route("/<int:item_id>/download", methods=["GET"])
@jwt_required()
def download_c(item_id):
    """Descarga el checklist como HTML imprimible (con imágenes embebidas)."""
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    d = c.to_dict()

    # Mediciones DC y AC como tablas
    dc = d.get("medicionesDc") or {}
    ac = d.get("medicionesAc") or {}
    fotos = d.get("fotos") or []
    if isinstance(fotos, dict):
        fotos = list(fotos.values()) if fotos else []

    def _t(v):
        return v if v not in (None, '', 'None') else '—'

    def row(label, value, full=False):
        return f'<tr><td style="background:#f8fafc;font-weight:600;width:200px">{label}</td><td colspan="{3 if full else 1}">{_t(value)}</td></tr>'

    # Mediciones DC tabla
    dc_html = ''
    if dc:
        dc_html = '<table style="margin-top:8px"><thead><tr><th>Medición</th>'
        for m in range(1, 11):
            dc_html += f'<th colspan="2">MPPT {m}</th>'
        dc_html += '</tr><tr><th></th>'
        for m in range(1, 11):
            dc_html += '<th>S1</th><th>S2</th>'
        dc_html += '</tr></thead><tbody>'
        for label, key in [('Voc (V)', 'voc'), ('Isc (A)', 'isc'), ('PE (+)', 'pePos'), ('PE (−)', 'peNeg')]:
            dc_html += f'<tr><td style="background:#f8fafc;font-weight:600">{label}</td>'
            for m in range(1, 11):
                for s in range(1, 3):
                    val = (dc.get(key, {}) or {}).get(f'mppt{m}_s{s}', '') or ''
                    dc_html += f'<td style="text-align:center">{val}</td>'
            dc_html += '</tr>'
        dc_html += '</tbody></table>'

    # AC tabla
    ac_html = ''
    if ac:
        items = [(k, v) for k, v in ac.items() if v not in (None, '')]
        if items:
            ac_html = '<table style="margin-top:8px"><thead><tr><th>Par</th><th>Voltaje (V)</th></tr></thead><tbody>'
            for k, v in items:
                ac_html += f'<tr><td style="font-weight:600">{k}</td><td>{v}</td></tr>'
            ac_html += '</tbody></table>'

    # Imágenes embebidas
    img_html = ''
    for i, foto in enumerate(fotos):
        if isinstance(foto, dict):
            url = foto.get('url') or foto.get('data') or ''
            tipo = foto.get('tipo') or f'Foto {i + 1}'
        else:
            url = str(foto)
            tipo = f'Foto {i + 1}'
        if url:
            img_html += f'''<div style="display:inline-block;margin:6px;text-align:center;vertical-align:top">
                <img src="{url}" style="max-width:280px;max-height:200px;border:1px solid #cbd5e1;border-radius:6px" />
                <div style="font-size:10px;color:#64748b;margin-top:3px">{tipo}</div>
            </div>'''

    titulo = f"Checklist #{c.id} — {c.project or 's/proyecto'} — {c.fecha_visita.isoformat() if c.fecha_visita else ''}"
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>{titulo}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:Arial,sans-serif;font-size:11px;color:#1E293B;background:#F8FAFC;padding:20px}}
.page{{max-width:1100px;margin:auto;background:white;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
h1{{color:#0EA5E9;border-bottom:3px solid #0EA5E9;padding-bottom:10px;margin-bottom:6px}}
.meta{{color:#64748b;font-size:12px;margin-bottom:20px}}
.section{{margin:18px 0}}
.section-title{{font-size:14px;font-weight:700;color:#1E3A5F;background:#dbeafe;padding:6px 10px;border-radius:4px;margin-bottom:6px}}
table{{width:100%;border-collapse:collapse;font-size:11px}}
th{{background:#1E3A5F;color:white;padding:5px 8px;text-align:left;font-size:10px;font-weight:700}}
td{{padding:5px 8px;border-bottom:1px solid #e2e8f0}}
.evidencias{{background:#f8fafc;padding:10px;border-radius:6px}}
.actions{{position:fixed;top:20px;right:20px;display:flex;gap:8px;z-index:100}}
.actions button{{background:#0EA5E9;color:white;border:0;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2)}}
@media print{{body{{background:white;padding:0}}.page{{box-shadow:none;max-width:100%}}.actions{{display:none}}@page{{margin:1cm}}}}
</style></head><body>
<div class="actions"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>
<div class="page">
<h1>☀ {titulo}</h1>
<div class="meta">Generado el {c.created_at.strftime('%Y-%m-%d') if c.created_at else ''} · Resultado: <strong>{_t(c.resultado)}</strong></div>

<div class="section">
  <div class="section-title">📝 Información general</div>
  <table>
    {row('Cliente / Empresa', c.cliente)}
    {row('Distribuidor', c.distribuidor)}
    {row('País', c.pais)}
    {row('Modelo', c.modelo)}
    {row('SN Inversor', c.sn_inversor)}
    {row('SN Logger', c.sn_logger)}
    {row('Capacidad (kW)', c.capacidad_kw)}
    {row('Datos del panel', c.datos_panel)}
    {row('Configuración del panel', c.config_panel)}
    {row('Alarmas en el equipo', c.alarmas)}
    {row('Descripción de la falla', c.descripcion_falla)}
    {row('Técnico', c.tecnico)}
  </table>
</div>

{f'<div class="section"><div class="section-title">⚡ Mediciones lado DC</div>{dc_html}</div>' if dc_html else ''}
{f'<div class="section"><div class="section-title">🔌 Mediciones lado AC + Frecuencia: {c.frecuencia_hz or "—"} Hz</div>{ac_html}</div>' if ac_html else ''}

<div class="section">
  <div class="section-title">🔧 Continuidad inversor</div>
  <table>
    {row('¿Hay continuidad?', c.continuidad_check)}
    {row('¿En qué serie?', c.continuidad_serie)}
  </table>
</div>

{f'<div class="section"><div class="section-title">📸 Evidencias ({len(fotos)} fotos)</div><div class="evidencias">{img_html}</div></div>' if img_html else ''}

<div class="section">
  <div class="section-title">✅ Observaciones finales</div>
  <div style="background:#f0f9ff;padding:12px;border-radius:6px;white-space:pre-wrap">{_t(c.observaciones)}</div>
</div>

</div></body></html>"""

    # Forzar descarga
    filename = f"checklist_{c.id}_{(c.project or 'sin').replace(' ', '_')[:30]}.html"
    resp = Response(html, mimetype="text/html")
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


def _apply(c: Checklist, data: dict):
    c.ticket_id = parse_int(data.get("ticketId"))
    c.project = parse_str(data.get("project"))
    c.code = parse_str(data.get("code"))
    c.cliente = parse_str(data.get("cliente"))
    c.distribuidor = parse_str(data.get("distribuidor"))
    c.pais = parse_str(data.get("pais")) or c.pais or "México"
    c.modelo = parse_str(data.get("modelo"))
    c.sn_inversor = parse_str(data.get("snInversor"))
    c.sn_logger = parse_str(data.get("snLogger"))
    try:
        c.capacidad_kw = float(data.get("capacidadKw") or 0) or None
    except (TypeError, ValueError):
        c.capacidad_kw = None
    c.datos_panel = parse_str(data.get("datosPanel"))
    c.config_panel = parse_str(data.get("configPanel"))
    c.alarmas = parse_str(data.get("alarmas"))
    c.descripcion_falla = parse_str(data.get("descripcionFalla"))
    c.mediciones_dc = _to_json(data.get("medicionesDc"))
    c.mediciones_ac = _to_json(data.get("medicionesAc"))
    c.frecuencia_hz = parse_str(data.get("frecuenciaHz"))
    c.continuidad_check = parse_str(data.get("continuidadCheck"))
    c.continuidad_serie = parse_str(data.get("continuidadSerie"))
    c.fotos = _to_json(data.get("fotos"))
    c.videos = _to_json(data.get("videos"))
    c.resultado = parse_str(data.get("resultado")) or c.resultado or "En proceso"
    c.observaciones = parse_str(data.get("observaciones"))
    c.tecnico = parse_str(data.get("tecnico"))
    c.fecha_visita = parse_date(data.get("fechaVisita"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_c():
    data = request.get_json(silent=True) or {}
    c = Checklist()
    _apply(c, data)
    db.session.add(c)
    db.session.flush()
    log_change("checklists", "crear", f"Checklist {c.project or '#' + str(c.id)}", new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    old = c.to_dict()
    _apply(c, request.get_json(silent=True) or {})
    log_change("checklists", "editar", f"Checklist #{c.id}", old=old, new=c.to_dict())
    db.session.commit()
    return jsonify(c.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_c(item_id):
    c = db.session.get(Checklist, item_id)
    if not c:
        return jsonify(error="not_found"), 404
    log_change("checklists", "eliminar", f"Checklist #{c.id}", old=c.to_dict())
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)
