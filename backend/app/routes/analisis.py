"""Análisis de datos PV — KPIs y tablas de cumplimiento mensual."""
import json
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.analisis import AnalisisPlanta, MONTHS
from app.models.poliza import Poliza
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_int, parse_str

bp = Blueprint("analisis", __name__)


def _to_json(v):
    if v is None: return None
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return parse_str(v)


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _es_planta_pv(p):
    """Determina si una póliza es de tipo PV (incluye COMPLETO, GENERACIÓN, vacío)."""
    tipo = (p.poliza or "").upper()
    if "BESS" in tipo:
        # Si es PURAMENTE BESS, no es PV
        return "PV" in tipo or "FV" in tipo or "COMPLETO" in tipo
    if "PV" in tipo or "FV" in tipo:
        return True
    # Si tipo está vacío o es COMPLETO/GENERACIÓN, asumir PV
    if tipo in ("", "COMPLETO", "GENERACIÓN", "GENERACION", "HÍBRIDO", "HIBRIDO"):
        return True
    # Si el código contiene -FV- es PV
    if p.code and "-FV" in (p.code or "").upper():
        return True
    return False


@bp.route("", methods=["GET"])
@jwt_required()
def list_analisis():
    """Devuelve TODAS las plantas PV vigentes (las que están en póliza),
    autocreando registros AnalisisPlanta vacíos para las nuevas.

    Esto garantiza que si añades una nueva póliza PV, aparezca inmediatamente
    aquí para que puedas capturar su generación mensual.
    """
    args = request.args
    today = datetime.utcnow().date()
    incluir_vencidas = args.get("vencidas") in ("1", "true", "yes")

    # 1. Pólizas PV (vigentes o todas si vencidas=1)
    polizas = Poliza.query.all()
    pv_polizas = []
    for p in polizas:
        if not _es_planta_pv(p):
            continue
        vigente = (p.pol_end is None) or (p.pol_end >= today)
        if not vigente and not incluir_vencidas:
            continue
        pv_polizas.append(p)

    # 2. Indexar análisis existentes por project (lowercase)
    analisis_idx = {}
    for a in AnalisisPlanta.query.all():
        if a.project:
            analisis_idx[a.project.strip().lower()] = a

    # 3. Para cada póliza PV, devolver el análisis (creando vacío si no existe)
    out = []
    nuevos_a_crear = []
    for pol in pv_polizas:
        key = (pol.project or "").strip().lower()
        a = analisis_idx.get(key)
        if not a:
            # Crear registro nuevo vacío para que pueda capturarse
            a = AnalisisPlanta(project=pol.project)
            nuevos_a_crear.append(a)

        d = a.to_dict()
        # Enriquecer con datos de póliza
        d["polizaTipo"] = pol.poliza
        d["polizaFin"] = pol.pol_end.isoformat() if pol.pol_end else None
        d["zona"] = pol.zona
        d["plataforma"] = pol.platform
        d["codigo"] = pol.code
        d["vigente"] = (pol.pol_end is None) or (pol.pol_end >= today)
        out.append(d)

    # Commit de los nuevos análisis vacíos (para que tengan ID y se puedan editar)
    if nuevos_a_crear:
        for a in nuevos_a_crear:
            db.session.add(a)
        try:
            db.session.commit()
            # Re-leer para tener IDs reales
            for d in out:
                if not d.get("id"):
                    a = AnalisisPlanta.query.filter_by(project=d["project"]).first()
                    if a:
                        d["id"] = a.id
        except Exception as e:
            db.session.rollback()
            print(f"⚠️  No se pudieron crear análisis nuevos: {e}")

    # 4. Filtro de mes — atajos sin pisar los dicts originales
    mes_filter = args.get("mes")
    if mes_filter and mes_filter.lower() in MONTHS:
        m = mes_filter.lower()
        for d in out:
            d["garantizadoMesFiltro"] = (d.get("garantizado") or {}).get(m)
            gen_dict = d.get("generadoMes") or {}
            d["generadoMesFiltro"] = gen_dict.get(m) if isinstance(gen_dict, dict) else None

    # Ordenar por nombre de proyecto
    out.sort(key=lambda x: (x.get("project") or "").lower())
    return jsonify(out)


@bp.route("/kpis", methods=["GET"])
@jwt_required()
def kpis_analisis():
    """KPIs agregados para el mes en curso (o el solicitado)."""
    mes = (request.args.get("mes") or MONTHS[datetime.utcnow().month - 1]).lower()
    if mes not in MONTHS:
        mes = MONTHS[datetime.utcnow().month - 1]
    analisis_all = AnalisisPlanta.query.all()
    total = 0
    sum_garantizado = 0
    sum_generado = 0
    cumplen = 0
    for a in analisis_all:
        g = a._parse("garantizado").get(mes)
        e = a._parse("generado_mes").get(mes)
        if g:
            total += 1
            sum_garantizado += g
            if e is not None:
                sum_generado += e
                if e >= g:
                    cumplen += 1
    pct = round((sum_generado / sum_garantizado) * 100, 1) if sum_garantizado > 0 else 0
    return jsonify(
        mes=mes,
        totalPlantas=total,
        sumGarantizado=round(sum_garantizado, 2),
        sumGenerado=round(sum_generado, 2),
        porcentaje=pct,
        cumplen=cumplen,
        nocumplen=total - cumplen if total > sum(1 for a in analisis_all if a._parse("generado_mes").get(mes) is None) else None,
    )


def _apply(a: AnalisisPlanta, data: dict):
    a.project = parse_str(data.get("project")) or a.project
    a.potencia_kwp = _num(data.get("potenciaKwp"))
    a.generado_kwh = _num(data.get("generadoKwh"))
    if "garantizado" in data:
        a.garantizado = _to_json(data.get("garantizado"))
    if "generadoMes" in data:
        a.generado_mes = _to_json(data.get("generadoMes"))
    a.cumple_mayo = parse_str(data.get("cumpleMayo"))
    a.proveedor = parse_str(data.get("proveedor"))
    a.seguimiento = parse_str(data.get("seguimiento"))
    a.fallas = parse_str(data.get("fallas"))
    a.responsable = parse_str(data.get("responsable"))
    a.propuesta = parse_str(data.get("propuesta"))
    a.marca_inversor = parse_str(data.get("marcaInversor"))
    a.num_inversores = parse_int(data.get("numInversores"))
    a.notas = parse_str(data.get("notas"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_a():
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    a = AnalisisPlanta(project=parse_str(data["project"]))
    _apply(a, data)
    db.session.add(a)
    db.session.flush()
    log_change("analisis", "crear", a.project, new=a.to_dict())
    db.session.commit()
    return jsonify(a.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_a(item_id):
    a = db.session.get(AnalisisPlanta, item_id)
    if not a:
        return jsonify(error="not_found"), 404
    old = a.to_dict()
    _apply(a, request.get_json(silent=True) or {})
    log_change("analisis", "editar", a.project, old=old, new=a.to_dict())
    db.session.commit()
    return jsonify(a.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_a(item_id):
    a = db.session.get(AnalisisPlanta, item_id)
    if not a:
        return jsonify(error="not_found"), 404
    log_change("analisis", "eliminar", a.project, old=a.to_dict())
    db.session.delete(a)
    db.session.commit()
    return jsonify(ok=True)
