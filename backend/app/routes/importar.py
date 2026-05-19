"""Importación masiva desde archivos Excel (.xlsx)."""
from io import BytesIO

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from openpyxl import load_workbook

from app import db
from app.models.incidencia import Incidencia
from app.models.poliza import Poliza
from app.models.garantia import Garantia
from app.models.error_catalog import ErrorCatalog
from app.utils.audit import log_change
from app.utils.decorators import admin_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("importar", __name__)


def _rows(file_storage):
    wb = load_workbook(BytesIO(file_storage.read()), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [str(h or "").strip() for h in rows[0]]
    return headers, rows[1:]


@bp.route("/incidencias", methods=["POST"])
@jwt_required()
@admin_required
def import_incidencias():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, key):
        n = idx.get(key.lower())
        return row[n] if n is not None and n < len(row) else None

    count = 0
    for row in rows:
        if not any(row):
            continue
        site = parse_str(g(row, "site") or g(row, "sitio"))
        if not site:
            continue
        inc = Incidencia(
            platform=parse_str(g(row, "platform") or g(row, "plataforma")),
            site=site,
            client=parse_str(g(row, "client") or g(row, "cliente")),
            code=parse_str(g(row, "code") or g(row, "codigo")),
            priority=parse_str(g(row, "priority") or g(row, "prioridad")),
            notes=parse_str(g(row, "notes") or g(row, "notas")),
            inc_date=parse_date(g(row, "incDate") or g(row, "fecha")),
            err_code=parse_str(g(row, "errCode") or g(row, "error")),
            classification=parse_str(g(row, "classification") or g(row, "clasificacion")),
            problem=parse_str(g(row, "problem") or g(row, "problema")),
            cause=parse_str(g(row, "cause") or g(row, "causa")),
            solution=parse_str(g(row, "solution") or g(row, "solucion")),
        )
        db.session.add(inc)
        count += 1
    log_change("importar", "incidencias", f"{count} incidencias importadas")
    db.session.commit()
    return jsonify(ok=True, imported=count)


@bp.route("/polizas", methods=["POST"])
@jwt_required()
@admin_required
def import_polizas():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, key):
        n = idx.get(key.lower())
        return row[n] if n is not None and n < len(row) else None

    count = 0
    for row in rows:
        if not any(row):
            continue
        project = parse_str(g(row, "project") or g(row, "proyecto"))
        if not project:
            continue
        p = Poliza(
            project=project,
            item=parse_int(g(row, "item")),
            grupo=parse_str(g(row, "grupo")),
            code=parse_str(g(row, "code") or g(row, "codigo")),
            tarifa=parse_str(g(row, "tarifa")),
            platform=parse_str(g(row, "platform") or g(row, "plataforma")),
            panels=parse_str(g(row, "panels") or g(row, "paneles")),
            inv=parse_str(g(row, "inv") or g(row, "inversores")),
            sys_start=parse_date(g(row, "sysStart") or g(row, "inicioSistema")),
            pol_start=parse_date(g(row, "polStart") or g(row, "inicioPoliza")),
            pol_end=parse_date(g(row, "polEnd") or g(row, "finPoliza")),
            status=parse_str(g(row, "status")),
            poliza=parse_str(g(row, "poliza") or g(row, "tipoPoliza")),
            zona=parse_str(g(row, "zona")),
            cuadrilla=parse_str(g(row, "cuadrilla")),
        )
        db.session.add(p)
        count += 1
    log_change("importar", "polizas", f"{count} pólizas importadas")
    db.session.commit()
    return jsonify(ok=True, imported=count)


@bp.route("/errores", methods=["POST"])
@jwt_required()
@admin_required
def import_errores():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, key):
        n = idx.get(key.lower())
        return row[n] if n is not None and n < len(row) else None

    count = 0
    for row in rows:
        if not any(row):
            continue
        brand = parse_str(g(row, "brand") or g(row, "marca"))
        code = parse_str(g(row, "code") or g(row, "codigo"))
        if not brand or not code:
            continue
        brand = brand.upper()
        if ErrorCatalog.query.filter_by(brand=brand, code=code).first():
            continue
        e = ErrorCatalog(
            brand=brand,
            code=code,
            classification=parse_str(g(row, "classification") or g(row, "clasificacion")),
            problem=parse_str(g(row, "problem") or g(row, "problema")),
            cause=parse_str(g(row, "cause") or g(row, "causa")),
            solution=parse_str(g(row, "solution") or g(row, "solucion")),
            priority=parse_str(g(row, "priority") or g(row, "prioridad")),
        )
        db.session.add(e)
        count += 1
    log_change("importar", "errores", f"{count} errores importados")
    db.session.commit()
    return jsonify(ok=True, imported=count)
