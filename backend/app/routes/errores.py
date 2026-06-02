"""CRUD del catálogo de errores."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.error_catalog import ErrorCatalog
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_str

bp = Blueprint("errores", __name__)


@bp.route("/diagnostico", methods=["GET"])
@jwt_required()
def diagnostico():
    """Devuelve diagnóstico del catálogo: conteos por marca, manuales vs oficiales."""
    from sqlalchemy import func
    total = ErrorCatalog.query.count()
    by_brand = dict(db.session.query(ErrorCatalog.brand, func.count(ErrorCatalog.id))
                    .group_by(ErrorCatalog.brand).all())
    manuales = ErrorCatalog.query.filter_by(manual=True).count()
    generales = ErrorCatalog.query.filter_by(es_general=True).count()
    # Detecta si el archivo seed está disponible
    try:
        from app.seeds.errores_full import FULL_ERRORES
        en_seed = len(FULL_ERRORES)
    except Exception as e:
        en_seed = f"ERROR: {e}"
    return jsonify({
        "totalEnBD": total,
        "porMarca": by_brand,
        "manuales": manuales,
        "generales": generales,
        "enArchivoSeed": en_seed,
    })


@bp.route("/recargar-catalogo", methods=["POST"])
@jwt_required()
@role_required("admin")
def recargar_catalogo():
    """Re-ejecuta el seed de errores SIN borrar nada manual.
    Permite refrescar los códigos oficiales sin tener que hacer redeploy."""
    try:
        from app.seeds.errores_full import FULL_ERRORES
    except Exception as e:
        return jsonify(error="seed_file_missing", message=str(e)), 500

    created, updated, preservados = 0, 0, 0
    for e in FULL_ERRORES:
        existing = ErrorCatalog.query.filter_by(brand=e["brand"], code=e["code"]).first()
        if existing:
            if existing.manual:
                preservados += 1
                continue
            existing.equipment = e.get("equipment") or existing.equipment
            existing.classification = e.get("classification") or existing.classification
            existing.tipo = e.get("tipo") or existing.tipo
            existing.problem = e.get("problem") or existing.problem
            existing.cause = e.get("cause") or existing.cause
            existing.solution = e.get("solution") or existing.solution
            existing.impact = e.get("impact") or existing.impact
            existing.source_url = e.get("source_url") or existing.source_url
            existing.priority = e.get("priority") or existing.priority
            if "es_general" in e:
                existing.es_general = bool(e["es_general"])
            updated += 1
        else:
            db.session.add(ErrorCatalog(
                brand=e["brand"], code=e["code"],
                equipment=e.get("equipment"),
                classification=e.get("classification"),
                tipo=e.get("tipo"), problem=e.get("problem"),
                cause=e.get("cause"), solution=e.get("solution"),
                impact=e.get("impact"), source_url=e.get("source_url"),
                priority=e.get("priority"),
                es_general=bool(e.get("es_general")),
                manual=False,
            ))
            created += 1
    db.session.commit()
    total = ErrorCatalog.query.count()
    return jsonify(
        ok=True,
        total=total,
        creados=created,
        actualizados=updated,
        preservados=preservados,
        manualesIntactos=ErrorCatalog.query.filter_by(manual=True).count(),
    )


@bp.route("", methods=["GET"])
@jwt_required()
def list_errores():
    q = request.args.get("q")
    brand = request.args.get("brand")
    classification = request.args.get("classification")
    query = ErrorCatalog.query
    if brand:
        query = query.filter(ErrorCatalog.brand == brand)
    if classification:
        query = query.filter(ErrorCatalog.classification == classification)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(ErrorCatalog.code.ilike(like), ErrorCatalog.problem.ilike(like)))
    items = query.order_by(ErrorCatalog.brand, ErrorCatalog.code).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("/lookup", methods=["GET"])
@jwt_required()
def lookup():
    """Búsqueda exacta por brand+code para autocompletar incidencias."""
    brand = request.args.get("brand", "").upper()
    code = request.args.get("code", "")
    if not brand or not code:
        return jsonify(error="missing_params"), 400
    e = ErrorCatalog.query.filter_by(brand=brand, code=code).first()
    if not e:
        return jsonify(None)
    return jsonify(e.to_dict())


def _apply(err: ErrorCatalog, data: dict):
    err.brand = (parse_str(data.get("brand")) or err.brand or "").upper()
    err.code = parse_str(data.get("code")) or err.code
    err.equipment = parse_str(data.get("equipment"))
    err.classification = parse_str(data.get("classification"))
    err.tipo = parse_str(data.get("tipo"))
    err.problem = parse_str(data.get("problem"))
    err.cause = parse_str(data.get("cause"))
    err.solution = parse_str(data.get("solution"))
    err.impact = parse_str(data.get("impact"))
    err.source_url = parse_str(data.get("sourceUrl"))
    err.priority = parse_str(data.get("priority"))
    if "esGeneral" in data:
        err.es_general = bool(data.get("esGeneral"))


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_error():
    data = request.get_json(silent=True) or {}
    brand = (data.get("brand") or "").upper()
    code = parse_str(data.get("code"))
    if not brand or not code:
        return jsonify(error="missing_fields"), 400
    if ErrorCatalog.query.filter_by(brand=brand, code=code).first():
        return jsonify(error="duplicate"), 409
    err = ErrorCatalog(brand=brand, code=code, manual=True)  # marca como manual: seed NUNCA lo toca
    _apply(err, data)
    db.session.add(err)
    db.session.flush()
    log_change("errores", "crear", f"{err.clave}", new=err.to_dict())
    db.session.commit()
    return jsonify(err.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_error(item_id):
    err = db.session.get(ErrorCatalog, item_id)
    if not err:
        return jsonify(error="not_found"), 404
    old = err.to_dict()
    _apply(err, request.get_json(silent=True) or {})
    log_change("errores", "editar", f"{err.clave}", old=old, new=err.to_dict())
    db.session.commit()
    return jsonify(err.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_error(item_id):
    err = db.session.get(ErrorCatalog, item_id)
    if not err:
        return jsonify(error="not_found"), 404
    log_change("errores", "eliminar", err.clave, old=err.to_dict())
    db.session.delete(err)
    db.session.commit()
    return jsonify(ok=True)
