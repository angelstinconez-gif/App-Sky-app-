"""CRUD de Mantenimientos."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.mantenimiento import Mantenimiento
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.notify import notify_event
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("mantenimiento", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_m():
    args = request.args
    query = Mantenimiento.query
    if args.get("estado"):
        query = query.filter(Mantenimiento.estado == args["estado"])
    if args.get("tipo"):
        query = query.filter(Mantenimiento.tipo == args["tipo"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(or_(Mantenimiento.project.ilike(like), Mantenimiento.code.ilike(like)))
    items = query.order_by(Mantenimiento.fecha_programada.desc().nullslast()).all()
    return jsonify([i.to_dict() for i in items])


def _apply(m: Mantenimiento, data: dict):
    import json
    m.project = parse_str(data.get("project")) or m.project
    m.code = parse_str(data.get("code"))
    m.tipo = parse_str(data.get("tipo"))
    m.fecha_programada = parse_date(data.get("fechaProgramada"))
    m.fecha_ejecutada = parse_date(data.get("fechaEjecutada"))
    m.fecha_inicio_ejecucion = parse_date(data.get("fechaInicioEjecucion"))
    m.fecha_fin_ejecucion = parse_date(data.get("fechaFinEjecucion"))
    # Si llega fin de ejecución y no fecha_ejecutada, copia para compat
    if m.fecha_fin_ejecucion and not m.fecha_ejecutada:
        m.fecha_ejecutada = m.fecha_fin_ejecucion
    m.estado = parse_str(data.get("estado")) or m.estado

    # Cuadrilla: aceptar tanto id como nombre
    cid = parse_int(data.get("cuadrillaId"))
    if cid:
        m.cuadrilla_id = cid
        try:
            from app.models.cuadrilla import Cuadrilla
            c = db.session.get(Cuadrilla, cid)
            if c:
                m.cuadrilla = c.nombre
        except Exception:
            pass
    else:
        m.cuadrilla = parse_str(data.get("cuadrilla"))

    m.responsable = parse_str(data.get("responsable"))

    # Técnicos: lista de IDs
    tids = data.get("tecnicosIds")
    if isinstance(tids, list):
        ids = [int(x) for x in tids if str(x).lstrip("-").isdigit()]
        m.tecnicos_ids = json.dumps(ids) if ids else None
    elif "tecnicosIds" in data:
        m.tecnicos_ids = None

    m.descripcion = parse_str(data.get("descripcion"))
    m.resultados = parse_str(data.get("resultados"))
    m.poliza_id = parse_int(data.get("polizaId"))

    # Duración y viáticos
    try:
        dh = data.get("duracionHoras")
        m.duracion_horas = float(dh) if dh not in (None, "") else None
    except (TypeError, ValueError):
        m.duracion_horas = None
    if "requiereViaticos" in data:
        m.requiere_viaticos = bool(data.get("requiereViaticos"))


def _autocrear_viatico(m: Mantenimiento, claims: dict):
    """Crea un viático pre-llenado para este mantenimiento (estado Solicitado).
    Las cantidades se calculan en función del número de personas asignadas.
    Devuelve el id del viático creado o None.
    """
    if m.viatico_id:
        return m.viatico_id
    try:
        import json as _json
        from app.models.viatico import Viatico, TARIFAS
        # Personas: cuadrilla + técnicos asignados (mínimo 1)
        tecs_ids = []
        try:
            tecs_ids = _json.loads(m.tecnicos_ids or "[]")
        except Exception:
            tecs_ids = []
        # Obtener nombres
        nombres_tecnicos = []
        try:
            from app.models.tecnico import Tecnico
            if tecs_ids:
                for t in Tecnico.query.filter(Tecnico.id.in_(tecs_ids)).all():
                    nombres_tecnicos.append(t.nombre)
        except Exception:
            pass
        personas = max(1, len(nombres_tecnicos) + (1 if m.responsable else 0))

        # Estimación: 1 comida × personas, sin vehículo, estado Solicitado.
        # El usuario debe completar: vehículo, TAG, placa, monto final.
        v = Viatico(
            ticket_id=f"M{m.id}",
            project=m.project,
            code=m.code,
            responsable=m.responsable or (nombres_tecnicos[0] if nombres_tecnicos else None),
            responsables_extra=_json.dumps(nombres_tecnicos, ensure_ascii=False) if nombres_tecnicos else None,
            tipo_persona="tecnico",
            comidas=1,
            noches=0,
            fecha_salida=m.fecha_programada or m.fecha_inicio_ejecucion,
            estado="Solicitado",
            notas=f"🔧 Auto-generado desde Mantenimiento M{m.id} — {m.tipo or 'Mantenimiento'} en {m.project}",
        )
        db.session.add(v)
        db.session.flush()
        m.viatico_id = v.id
        return v.id
    except Exception as e:
        print(f"⚠️  No se pudo crear viático auto: {e}")
        return None


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin", "mantenimiento")
def create_m():
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    m = Mantenimiento(project=parse_str(data["project"]))
    _apply(m, data)
    db.session.add(m)
    db.session.flush()
    # Auto-crear viático si está marcado
    if m.requiere_viaticos:
        from flask_jwt_extended import get_jwt
        _autocrear_viatico(m, get_jwt() or {})
    log_change("mantenimiento", "crear", m.project, new=m.to_dict())
    db.session.commit()
    # Notificar a suscriptores
    try:
        notify_event(
            event_type="mantenimiento_programado",
            title=f"🔧 Nuevo mantenimiento programado",
            body=f"{m.tipo or 'Mantenimiento'} en {m.project}"
                 + (f" para el {m.fecha_programada}" if m.fecha_programada else ""),
            related_type="mantenimiento",
            related_id=m.id,
        )
    except Exception as e:
        print(f"⚠️  Error notificando: {e}")
    return jsonify(m.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin", "mantenimiento")
def update_m(item_id):
    m = db.session.get(Mantenimiento, item_id)
    if not m:
        return jsonify(error="not_found"), 404
    old = m.to_dict()
    _apply(m, request.get_json(silent=True) or {})
    # Si acaba de marcarse "requiere viáticos" y aún no tiene viático asociado → crearlo
    if m.requiere_viaticos and not m.viatico_id:
        from flask_jwt_extended import get_jwt
        _autocrear_viatico(m, get_jwt() or {})
    log_change("mantenimiento", "editar", m.project, old=old, new=m.to_dict())
    db.session.commit()
    # Notificar cambios de estado relevantes
    if old.get("estado") != m.estado:
        try:
            notify_event(
                event_type=f"mantenimiento_{m.estado.lower().replace(' ', '_')}",
                title=f"🔄 Mantenimiento {m.estado}",
                body=f"{m.tipo or 'Mantenimiento'} en {m.project}",
                related_type="mantenimiento",
                related_id=m.id,
            )
        except Exception as e:
            print(f"⚠️  Error notificando: {e}")
    return jsonify(m.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_m(item_id):
    m = db.session.get(Mantenimiento, item_id)
    if not m:
        return jsonify(error="not_found"), 404
    log_change("mantenimiento", "eliminar", m.project, old=m.to_dict())
    db.session.delete(m)
    db.session.commit()
    return jsonify(ok=True)
