"""CRUD de viáticos + presupuesto mensual."""
import json
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import or_, extract, func

from app import db
from app.models.viatico import Viatico, PresupuestoViaticos, TARIFAS
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("viaticos", __name__)


@bp.route("/tarifas", methods=["GET"])
@jwt_required()
def tarifas():
    """Devuelve las tarifas estándar para el cálculo del monto."""
    return jsonify(TARIFAS)


@bp.route("", methods=["GET"])
@jwt_required()
def list_v():
    args = request.args
    q = Viatico.query
    if args.get("ticketId"):
        q = q.filter(Viatico.ticket_id == args["ticketId"])
    if args.get("estado"):
        q = q.filter(Viatico.estado == args["estado"])
    if args.get("q"):
        like = f"%{args['q']}%"
        q = q.filter(or_(
            Viatico.project.ilike(like),
            Viatico.tag.ilike(like),
            Viatico.placa.ilike(like),
            Viatico.responsable.ilike(like),
        ))
    items = q.order_by(Viatico.fecha_salida.desc().nullslast(), Viatico.id.desc()).all()
    return jsonify([i.to_dict() for i in items])


def _to_json(v):
    if v is None: return None
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return parse_str(v)


def _apply(v: Viatico, data: dict):
    v.ticket_id = parse_str(data.get("ticketId"))
    v.project = parse_str(data.get("project"))
    v.code = parse_str(data.get("code"))
    v.responsable = parse_str(data.get("responsable"))
    if "responsablesExtra" in data:
        v.responsables_extra = _to_json(data.get("responsablesExtra"))
    v.tipo_persona = parse_str(data.get("tipoPersona")) or "tecnico"

    try: v.comidas = max(0, min(3, int(data.get("comidas") or 0)))
    except (TypeError, ValueError): v.comidas = 0
    try: v.noches = max(0, int(data.get("noches") or 0))
    except (TypeError, ValueError): v.noches = 0

    v.tipo_vehiculo = parse_str(data.get("tipoVehiculo"))
    try: v.cantidad_vehiculos = max(0, int(data.get("cantidadVehiculos") or 0))
    except (TypeError, ValueError): v.cantidad_vehiculos = 0

    v.tag = parse_str(data.get("tag"))
    v.placa = parse_str(data.get("placa"))

    # Monto: si llega vacío, usar calculado
    try:
        monto_in = data.get("monto")
        if monto_in not in (None, ""):
            v.monto = float(monto_in)
        else:
            v.monto = v.calc_monto()
    except (TypeError, ValueError):
        v.monto = v.calc_monto()
    v.monto_calculado = v.calc_monto()

    v.moneda = parse_str(data.get("moneda")) or "MXN"
    try: v.dias_sitio = int(data.get("diasSitio") or 0)
    except (TypeError, ValueError): v.dias_sitio = 0
    v.fecha_salida = parse_date(data.get("fechaSalida"))
    v.fecha_regreso = parse_date(data.get("fechaRegreso"))
    v.estado = parse_str(data.get("estado")) or v.estado or "Solicitado"
    v.comprobante_url = parse_str(data.get("comprobanteUrl"))
    v.notas = parse_str(data.get("notas"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def create_v():
    data = request.get_json(silent=True) or {}
    v = Viatico()
    _apply(v, data)
    db.session.add(v)
    db.session.flush()
    log_change("viaticos", "crear", f"Viático ticket {v.ticket_id or ''} ${v.monto}", new=v.to_dict())
    db.session.commit()
    return jsonify(v.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "operator", "mantenimiento")
def update_v(item_id):
    v = db.session.get(Viatico, item_id)
    if not v:
        return jsonify(error="not_found"), 404
    old = v.to_dict()
    _apply(v, request.get_json(silent=True) or {})
    log_change("viaticos", "editar", f"Viático #{v.id}", old=old, new=v.to_dict())
    db.session.commit()
    return jsonify(v.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_v(item_id):
    v = db.session.get(Viatico, item_id)
    if not v:
        return jsonify(error="not_found"), 404
    log_change("viaticos", "eliminar", f"Viático #{v.id}", old=v.to_dict())
    db.session.delete(v)
    db.session.commit()
    return jsonify(ok=True)


# ──────────────────────────────────────────────────────────
#  PRESUPUESTO MENSUAL (sólo admin para crear/editar; todos pueden leer)
# ──────────────────────────────────────────────────────────
@bp.route("/presupuesto", methods=["GET"])
@jwt_required()
def presupuesto_list():
    """Lista presupuestos con gasto acumulado por mes."""
    args = request.args
    q = PresupuestoViaticos.query
    if args.get("year"):
        q = q.filter(PresupuestoViaticos.year == int(args["year"]))
    items = q.order_by(PresupuestoViaticos.year.desc(), PresupuestoViaticos.month.desc()).all()
    out = []
    for p in items:
        d = p.to_dict()
        # Calcular gasto del mes (suma de viáticos con fecha_salida en ese mes)
        gasto = db.session.query(func.coalesce(func.sum(Viatico.monto), 0)).filter(
            extract("year", Viatico.fecha_salida) == p.year,
            extract("month", Viatico.fecha_salida) == p.month,
        ).scalar() or 0
        d["gasto"] = float(gasto)
        d["disponible"] = round((p.monto or 0) - float(gasto), 2)
        d["porcentaje"] = round((float(gasto) / p.monto) * 100, 1) if p.monto else 0
        out.append(d)
    return jsonify(out)


@bp.route("/presupuesto", methods=["POST"])
@jwt_required()
@role_required("admin")
def presupuesto_create():
    data = request.get_json(silent=True) or {}
    year = int(data.get("year") or datetime.utcnow().year)
    month = int(data.get("month") or datetime.utcnow().month)
    monto = float(data.get("monto") or 0)
    claims = get_jwt() or {}
    p = PresupuestoViaticos.query.filter_by(year=year, month=month).first()
    if p:
        p.monto = monto
        p.notas = parse_str(data.get("notas"))
    else:
        p = PresupuestoViaticos(
            year=year, month=month, monto=monto,
            notas=parse_str(data.get("notas")),
            created_by=claims.get("name"),
        )
        db.session.add(p)
    db.session.flush()
    log_change("viaticos", "presupuesto", f"Presupuesto {year}-{month:02d}: ${monto}", new=p.to_dict())
    db.session.commit()
    return jsonify(p.to_dict()), 201


@bp.route("/presupuesto/<int:pid>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def presupuesto_delete(pid):
    p = db.session.get(PresupuestoViaticos, pid)
    if not p:
        return jsonify(error="not_found"), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify(ok=True)
