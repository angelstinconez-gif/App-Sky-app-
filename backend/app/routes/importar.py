"""Importación masiva desde archivos Excel (.xlsx).

Todos los endpoints usan UPSERT (no INSERT ciego):
- Si la fila ya existe por su clave única, se ACTUALIZA con los campos no vacíos.
- Si no existe, se crea nueva.
Así, reimportar el mismo archivo NO genera duplicados.
"""
from io import BytesIO

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from openpyxl import load_workbook

from app import db
from app.models.incidencia import Incidencia
from app.models.poliza import Poliza
from app.models.garantia import Garantia
from app.models.error_catalog import ErrorCatalog
from app.models.directorio import Directorio
from app.models.mantenimiento import Mantenimiento
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


def _apply_non_empty(obj, **fields):
    """Asigna sólo campos con valor (no None/vacío) — preserva datos existentes."""
    for k, v in fields.items():
        if v is None or (isinstance(v, str) and not v.strip()):
            continue
        setattr(obj, k, v)


# ──────────────────────────────────────────────────────────
#  INCIDENCIAS — upsert por (site, code, err_code, inc_date)
# ──────────────────────────────────────────────────────────
@bp.route("/incidencias", methods=["POST"])
@jwt_required()
@admin_required
def import_incidencias():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, *keys):
        for k in keys:
            n = idx.get(k.lower())
            if n is not None and n < len(row):
                return row[n]
        return None

    created, updated = 0, 0
    for row in rows:
        if not any(row):
            continue
        site = parse_str(g(row, "site", "sitio", "proyecto", "project"))
        if not site:
            continue
        code = parse_str(g(row, "code", "codigo"))
        err_code = parse_str(g(row, "errCode", "error", "código de error"))
        inc_date = parse_date(g(row, "incDate", "fecha"))

        existing = Incidencia.query.filter_by(
            site=site, code=code, err_code=err_code, inc_date=inc_date
        ).first()
        target = existing or Incidencia(site=site, status="abierta")
        _apply_non_empty(
            target,
            platform=parse_str(g(row, "platform", "plataforma")),
            site=site,
            client=parse_str(g(row, "client", "cliente")),
            code=code,
            priority=parse_str(g(row, "priority", "prioridad")),
            notes=parse_str(g(row, "notes", "notas")),
            inc_date=inc_date,
            err_code=err_code,
            classification=parse_str(g(row, "classification", "clasificacion")),
            equipment=parse_str(g(row, "equipment", "equipo")),
            problem=parse_str(g(row, "problem", "problema")),
            cause=parse_str(g(row, "cause", "causa")),
            solution=parse_str(g(row, "solution", "solucion")),
        )
        if existing:
            updated += 1
        else:
            db.session.add(target)
            created += 1
    log_change("importar", "incidencias", f"{created} nuevas, {updated} actualizadas")
    db.session.commit()
    return jsonify(ok=True, created=created, updated=updated)


# ──────────────────────────────────────────────────────────
#  PÓLIZAS — upsert por code, secundario por project
# ──────────────────────────────────────────────────────────
@bp.route("/polizas", methods=["POST"])
@jwt_required()
@admin_required
def import_polizas():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, *keys):
        for k in keys:
            n = idx.get(k.lower())
            if n is not None and n < len(row):
                return row[n]
        return None

    created, updated = 0, 0
    for row in rows:
        if not any(row):
            continue
        project = parse_str(g(row, "project", "proyecto"))
        code = parse_str(g(row, "code", "codigo", "código"))
        if not project and not code:
            continue

        existing = None
        if code:
            existing = Poliza.query.filter_by(code=code).first()
        if not existing and project:
            existing = Poliza.query.filter_by(project=project).first()

        target = existing or Poliza(project=project or "—")
        _apply_non_empty(
            target,
            project=project,
            item=parse_int(g(row, "item")),
            grupo=parse_str(g(row, "grupo", "gupo")),
            code=code,
            tarifa=parse_str(g(row, "tarifa")),
            platform=parse_str(g(row, "platform", "plataforma")),
            panels=parse_str(g(row, "panels", "paneles")),
            inv=parse_str(g(row, "inv", "inversores")),
            sys_start=parse_date(g(row, "sysStart", "inicioSistema", "inicio del sistema")),
            pol_start=parse_date(g(row, "polStart", "inicioPoliza", "inicio")),
            pol_end=parse_date(g(row, "polEnd", "finPoliza", "fin")),
            status=parse_str(g(row, "status", "estatus")),
            poliza=parse_str(g(row, "poliza", "tipoPoliza", "tipo de poliza")),
            zona=parse_str(g(row, "zona", "ubicación", "ubicacion")),
            cuadrilla=parse_str(g(row, "cuadrilla")),
        )
        if existing:
            updated += 1
        else:
            db.session.add(target)
            created += 1
    log_change("importar", "polizas", f"{created} nuevas, {updated} actualizadas")
    db.session.commit()
    return jsonify(ok=True, created=created, updated=updated)


# ──────────────────────────────────────────────────────────
#  DIRECTORIO — upsert por (project, maint_contact)
# ──────────────────────────────────────────────────────────
@bp.route("/directorio", methods=["POST"])
@jwt_required()
@admin_required
def import_directorio():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower().strip(): n for n, h in enumerate(headers) if h}

    def g(row, *keys):
        for k in keys:
            n = idx.get(k.lower())
            if n is not None and n < len(row) and row[n] not in (None, "", "N/A"):
                return row[n]
        return None

    created, updated = 0, 0
    for row in rows:
        if not any(row):
            continue
        project = parse_str(g(row, "proyecto", "project"))
        if not project:
            continue
        contact = parse_str(g(row, "contacto de mantenimiento en sitio", "contacto mantenimiento", "maintContact"))

        existing = Directorio.query.filter_by(project=project, maint_contact=contact).first()
        # Si no hay contacto, también buscamos por sólo el proyecto
        if not existing and not contact:
            existing = Directorio.query.filter_by(project=project).first()

        target = existing or Directorio(project=project)
        _apply_non_empty(
            target,
            project=project,
            project_code=parse_str(g(row, "codigo de proyecto", "código de proyecto", "projectCode")),
            system_type=parse_str(g(row, "tipo de sistema sistema", "tipo de sistema", "systemType")),
            maint_contact=contact,
            maint_phone=parse_str(g(row, "numero de contacto de mantenimiento", "numero mantenimiento", "maintPhone")),
            maint_contact_2=parse_str(g(row, "2° nombre de contacto de mantenimiento", "contacto 2", "maintContact2")),
            maint_phone_2=parse_str(g(row, "2° numero de contacto de mantenimiento", "numero 2", "maintPhone2")),
            maint_email=parse_str(g(row, "correo de mantenimiento", "email mantenimiento", "maintEmail")),
            internal_pm=parse_str(g(row, "contacto interno pm", "pm interno", "internalPm")),
            internal_phone=parse_str(g(row, "numero de interno", "numero interno", "internalPhone")),
            client_name=parse_str(g(row, "nombre del cliente", "cliente", "clientName")),
            client_company=parse_str(g(row, "empresa del cliente", "empresa", "clientCompany")),
            client_phone=parse_str(g(row, "numero cliente", "telefono cliente", "clientPhone")),
            client_email=parse_str(g(row, "correo del cliente", "email cliente", "clientEmail")),
            category=parse_str(g(row, "categoría", "categoria", "category")) or "Mantenimiento",
        )
        if existing:
            updated += 1
        else:
            db.session.add(target)
            created += 1
    log_change("importar", "directorio", f"{created} nuevos, {updated} actualizados")
    db.session.commit()
    return jsonify(ok=True, created=created, updated=updated)


# ──────────────────────────────────────────────────────────
#  MANTENIMIENTO — upsert por (project, fecha_programada, tipo)
# ──────────────────────────────────────────────────────────
@bp.route("/mantenimiento", methods=["POST"])
@jwt_required()
@admin_required
def import_mantenimiento():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower().strip(): n for n, h in enumerate(headers) if h}

    def g(row, *keys):
        for k in keys:
            n = idx.get(k.lower())
            if n is not None and n < len(row):
                return row[n]
        return None

    created, updated = 0, 0
    for row in rows:
        if not any(row):
            continue
        project = parse_str(g(row, "proyecto", "project"))
        if not project:
            continue
        fecha = parse_date(g(row, "fecha programada", "fechaProgramada"))
        tipo = parse_str(g(row, "tipo"))

        existing = Mantenimiento.query.filter_by(
            project=project, fecha_programada=fecha, tipo=tipo
        ).first()
        target = existing or Mantenimiento(project=project, estado="Programado")
        _apply_non_empty(
            target,
            project=project,
            code=parse_str(g(row, "codigo", "código", "code")),
            tipo=tipo,
            estado=parse_str(g(row, "estado", "status")) or target.estado,
            fecha_programada=fecha,
            fecha_ejecutada=parse_date(g(row, "fecha ejecutada", "fechaEjecutada")),
            cuadrilla=parse_str(g(row, "cuadrilla")),
            responsable=parse_str(g(row, "responsable")),
            descripcion=parse_str(g(row, "descripcion", "descripción")),
            resultados=parse_str(g(row, "resultados")),
        )
        if existing:
            updated += 1
        else:
            db.session.add(target)
            created += 1
    log_change("importar", "mantenimiento", f"{created} nuevos, {updated} actualizados")
    db.session.commit()
    return jsonify(ok=True, created=created, updated=updated)


# ──────────────────────────────────────────────────────────
#  ERRORES — upsert por (brand, code)
# ──────────────────────────────────────────────────────────
@bp.route("/errores", methods=["POST"])
@jwt_required()
@admin_required
def import_errores():
    f = request.files.get("file")
    if not f:
        return jsonify(error="no_file"), 400
    headers, rows = _rows(f)
    idx = {h.lower(): n for n, h in enumerate(headers)}

    def g(row, *keys):
        for k in keys:
            n = idx.get(k.lower())
            if n is not None and n < len(row):
                return row[n]
        return None

    created, updated = 0, 0
    for row in rows:
        if not any(row):
            continue
        brand = parse_str(g(row, "brand", "marca"))
        code = parse_str(g(row, "code", "codigo"))
        if not brand or not code:
            continue
        brand = brand.upper()

        existing = ErrorCatalog.query.filter_by(brand=brand, code=code).first()
        target = existing or ErrorCatalog(brand=brand, code=code)
        _apply_non_empty(
            target,
            equipment=parse_str(g(row, "equipment", "equipo")),
            classification=parse_str(g(row, "classification", "clasificacion")),
            tipo=parse_str(g(row, "tipo", "type")),
            problem=parse_str(g(row, "problem", "problema", "alarma")),
            cause=parse_str(g(row, "cause", "causa", "causa probable")),
            solution=parse_str(g(row, "solution", "solucion", "solucion posible")),
            impact=parse_str(g(row, "impact", "impacto", "impacto operativo")),
            source_url=parse_str(g(row, "source_url", "url", "fuente url")),
            priority=parse_str(g(row, "priority", "prioridad")),
        )
        if existing:
            updated += 1
        else:
            db.session.add(target)
            created += 1
    log_change("importar", "errores", f"{created} nuevos, {updated} actualizados")
    db.session.commit()
    return jsonify(ok=True, created=created, updated=updated)
