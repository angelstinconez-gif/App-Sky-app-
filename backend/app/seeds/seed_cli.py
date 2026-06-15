"""Comandos CLI Flask: init-db, upgrade-schema, create-admin, seed-all, dedupe."""
import os

import click

from app import db
from app.models.user import User
from app.models.error_catalog import ErrorCatalog
from app.models.poliza import Poliza
from app.models.incidencia import Incidencia
from app.models.garantia import Garantia
from app.models.directorio import Directorio
from app.models.ticket import Ticket
from app.seeds.seed_data import (
    DEFAULT_USERS,
    SEED_POLIZAS,
    SEED_INCIDENCIAS,
    SEED_GARANTIAS,
)
from app.utils.parse import parse_date


def register_seed_cli(app):
    @app.cli.command("init-db")
    def init_db():
        with app.app_context():
            db.create_all()
        click.echo("✅ Base de datos inicializada.")

    @app.cli.command("upgrade-schema")
    def upgrade_schema():
        """Recrea/altera tablas para igualar el esquema actual. Cada paso es independiente."""
        from sqlalchemy import inspect, text
        from app.models.notification import NotificationSubscription, NotificationLog

        def _try(label, fn):
            try:
                fn()
            except Exception as e:
                click.echo(f"  ⚠️  {label} falló: {e}")

        with app.app_context():
            insp = inspect(db.engine)

            # ── ALTER TABLE (añadir columnas sin perder datos) ──
            def _add_col(table, col, ddl):
                if not insp.has_table(table):
                    return
                cols = {c["name"] for c in insp.get_columns(table)}
                if col not in cols:
                    with db.engine.begin() as conn:
                        conn.execute(text(ddl))
                    click.echo(f"  ➕ {table}.{col}")

            _try("incidencias.equipment", lambda: _add_col(
                "incidencias", "equipment",
                "ALTER TABLE incidencias ADD COLUMN equipment VARCHAR(120)"
            ))
            _try("errores_catalogo.es_general", lambda: _add_col(
                "errores_catalogo", "es_general",
                "ALTER TABLE errores_catalogo ADD COLUMN es_general BOOLEAN DEFAULT FALSE"
            ))
            _try("errores_catalogo.manual", lambda: _add_col(
                "errores_catalogo", "manual",
                "ALTER TABLE errores_catalogo ADD COLUMN manual BOOLEAN DEFAULT FALSE"
            ))
            _try("notification_log.read_at", lambda: _add_col(
                "notification_log", "read_at",
                "ALTER TABLE notification_log ADD COLUMN read_at TIMESTAMP"
            ))
            _try("cuadrillas.lider_id", lambda: _add_col(
                "cuadrillas", "lider_id",
                "ALTER TABLE cuadrillas ADD COLUMN lider_id INTEGER"
            ))
            _try("mantenimientos.cuadrilla_id", lambda: _add_col(
                "mantenimientos", "cuadrilla_id",
                "ALTER TABLE mantenimientos ADD COLUMN cuadrilla_id INTEGER"
            ))
            _try("mantenimientos.tecnicos_ids", lambda: _add_col(
                "mantenimientos", "tecnicos_ids",
                "ALTER TABLE mantenimientos ADD COLUMN tecnicos_ids TEXT"
            ))
            _try("mantenimientos.fecha_inicio_ejecucion", lambda: _add_col(
                "mantenimientos", "fecha_inicio_ejecucion",
                "ALTER TABLE mantenimientos ADD COLUMN fecha_inicio_ejecucion DATE"
            ))
            _try("mantenimientos.fecha_fin_ejecucion", lambda: _add_col(
                "mantenimientos", "fecha_fin_ejecucion",
                "ALTER TABLE mantenimientos ADD COLUMN fecha_fin_ejecucion DATE"
            ))
            _try("mantenimientos.fecha_fin_programada", lambda: _add_col(
                "mantenimientos", "fecha_fin_programada",
                "ALTER TABLE mantenimientos ADD COLUMN fecha_fin_programada DATE"
            ))
            _try("mantenimientos.duracion_horas", lambda: _add_col(
                "mantenimientos", "duracion_horas",
                "ALTER TABLE mantenimientos ADD COLUMN duracion_horas FLOAT"
            ))
            _try("mantenimientos.requiere_viaticos", lambda: _add_col(
                "mantenimientos", "requiere_viaticos",
                "ALTER TABLE mantenimientos ADD COLUMN requiere_viaticos BOOLEAN DEFAULT FALSE"
            ))
            _try("mantenimientos.viatico_id", lambda: _add_col(
                "mantenimientos", "viatico_id",
                "ALTER TABLE mantenimientos ADD COLUMN viatico_id INTEGER"
            ))
            _try("garantias.abierto_por", lambda: _add_col(
                "garantias", "abierto_por",
                "ALTER TABLE garantias ADD COLUMN abierto_por VARCHAR(160)"
            ))
            _try("garantias.abierto_por_email", lambda: _add_col(
                "garantias", "abierto_por_email",
                "ALTER TABLE garantias ADD COLUMN abierto_por_email VARCHAR(180)"
            ))

            # Viáticos: columnas nuevas
            for col_name, ddl in [
                ("responsables_extra", "ALTER TABLE viaticos ADD COLUMN responsables_extra TEXT"),
                ("tipo_persona",       "ALTER TABLE viaticos ADD COLUMN tipo_persona VARCHAR(20)"),
                ("comidas",            "ALTER TABLE viaticos ADD COLUMN comidas INTEGER DEFAULT 0"),
                ("noches",             "ALTER TABLE viaticos ADD COLUMN noches INTEGER DEFAULT 0"),
                ("tipo_vehiculo",      "ALTER TABLE viaticos ADD COLUMN tipo_vehiculo VARCHAR(30)"),
                ("cantidad_vehiculos", "ALTER TABLE viaticos ADD COLUMN cantidad_vehiculos INTEGER DEFAULT 0"),
                ("tag",                "ALTER TABLE viaticos ADD COLUMN tag VARCHAR(40)"),
                ("placa",              "ALTER TABLE viaticos ADD COLUMN placa VARCHAR(40)"),
                ("monto_calculado",    "ALTER TABLE viaticos ADD COLUMN monto_calculado FLOAT DEFAULT 0"),
            ]:
                _try(f"viaticos.{col_name}", lambda c=col_name, d=ddl: _add_col("viaticos", c, d))

            # viaticos.ticket_id: convertir a VARCHAR(20) si es INTEGER
            def _convert_viatico_ticket():
                if not insp.has_table("viaticos"):
                    return
                for c in insp.get_columns("viaticos"):
                    if c["name"] == "ticket_id" and "INT" in str(c["type"]).upper():
                        with db.engine.begin() as conn:
                            try:
                                conn.execute(text("ALTER TABLE viaticos ALTER COLUMN ticket_id TYPE VARCHAR(20)"))
                            except Exception:
                                # SQLite no soporta ALTER TYPE — recrear columna
                                conn.execute(text("ALTER TABLE viaticos ADD COLUMN ticket_id_new VARCHAR(20)"))
                                conn.execute(text("UPDATE viaticos SET ticket_id_new = CAST(ticket_id AS TEXT)"))
                        click.echo("  ➕ viaticos.ticket_id convertido a VARCHAR")
                        break
            _try("viaticos.ticket_id type", _convert_viatico_ticket)

            # ── Recrear tablas con cambio masivo de esquema ──
            def _maybe_recreate(model, key_cols):
                if not insp.has_table(model.__tablename__):
                    return
                cols = {c["name"] for c in insp.get_columns(model.__tablename__)}
                if any(c not in cols for c in key_cols):
                    click.echo(f"  🔄 Recreando {model.__tablename__}")
                    model.__table__.drop(db.engine)
                    model.__table__.create(db.engine)

            _try("directorio recreate", lambda: _maybe_recreate(
                Directorio, ["client_company", "maint_contact_2"]
            ))
            # NUNCA recrear errores_catalogo (borraría datos del usuario).
            # En su lugar, añadir columnas faltantes vía ALTER.
            for col, ddl in [
                ("equipment",      "ALTER TABLE errores_catalogo ADD COLUMN equipment VARCHAR(120)"),
                ("classification", "ALTER TABLE errores_catalogo ADD COLUMN classification VARCHAR(60)"),
                ("tipo",           "ALTER TABLE errores_catalogo ADD COLUMN tipo VARCHAR(60)"),
                ("impact",         "ALTER TABLE errores_catalogo ADD COLUMN impact TEXT"),
                ("source_url",     "ALTER TABLE errores_catalogo ADD COLUMN source_url VARCHAR(500)"),
            ]:
                _try(f"errores_catalogo.{col}", lambda c=col, d=ddl: _add_col("errores_catalogo", c, d))

            # ── Crear tablas nuevas ──
            def _create_if_missing(model):
                if not insp.has_table(model.__tablename__):
                    model.__table__.create(db.engine)
                    click.echo(f"  ➕ Creada: {model.__tablename__}")

            from app.models.tecnico import Tecnico as _Tecnico
            from app.models.aviso import Aviso as _Aviso
            from app.models.viatico import Viatico as _Viatico
            from app.models.checklist import Checklist as _Checklist
            from app.models.leccion import Leccion as _Leccion
            from app.models.analisis import AnalisisPlanta as _Analisis
            _try("crear tecnicos", lambda: _create_if_missing(_Tecnico))
            _try("crear avisos", lambda: _create_if_missing(_Aviso))
            _try("crear viaticos", lambda: _create_if_missing(_Viatico))
            from app.models.viatico import PresupuestoViaticos as _Pres
            _try("crear presupuesto_viaticos", lambda: _create_if_missing(_Pres))
            _try("crear checklists", lambda: _create_if_missing(_Checklist))
            _try("crear lecciones", lambda: _create_if_missing(_Leccion))
            _try("crear analisis_plantas", lambda: _create_if_missing(_Analisis))
            _try("crear notification_subscriptions", lambda: _create_if_missing(NotificationSubscription))
            _try("crear notification_log", lambda: _create_if_missing(NotificationLog))

            click.echo("✅ upgrade-schema completado.")

    @app.cli.command("create-admin")
    def create_admin():
        with app.app_context():
            email = os.environ.get("ADMIN_EMAIL", "admin@skyenergy.mx").lower()
            password = os.environ.get("ADMIN_PASSWORD", "Sky@Admin2025")
            name = os.environ.get("ADMIN_NAME", "Administrador SKY")
            if User.query.filter_by(email=email).first():
                click.echo(f"ℹ️  Admin {email} ya existe.")
                return
            u = User(email=email, name=name, role="admin", initials="AD", active=True)
            u.set_password(password)
            db.session.add(u)
            db.session.commit()
            click.echo(f"✅ Admin creado: {email}")

    @app.cli.command("seed-all")
    @click.option("--replace-errors", is_flag=True)
    def seed_all(replace_errors):
        with app.app_context():
            for u in DEFAULT_USERS:
                if User.query.filter_by(email=u["email"]).first():
                    continue
                user = User(email=u["email"], name=u["name"], role=u["role"],
                            initials=u.get("initials"), active=True)
                user.set_password(u["password"])
                db.session.add(user)
            db.session.commit()
            click.echo(f"✅ Usuarios: {User.query.count()}")

            try:
                from app.seeds.errores_full import FULL_ERRORES
            except ImportError:
                FULL_ERRORES = []

            # Errores: UPSERT con protección de datos manuales del usuario.
            # Regla: si ErrorCatalog.manual==True, el seed NUNCA lo toca.
            #        Sólo se actualizan los códigos del Excel oficial.
            created_e, updated_e, preservados = 0, 0, 0
            for e in FULL_ERRORES:
                existing = ErrorCatalog.query.filter_by(brand=e["brand"], code=e["code"]).first()
                if existing:
                    # Si el usuario lo creó/modificó a mano, NO TOCAR
                    if existing.manual:
                        preservados += 1
                        continue
                    # Sólo actualiza códigos NO manuales
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
                    updated_e += 1
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
                        manual=False,  # del Excel oficial, no manual
                    ))
                    created_e += 1
            db.session.commit()
            total_e = ErrorCatalog.query.count()
            manuales = ErrorCatalog.query.filter_by(manual=True).count()
            click.echo(f"✅ Errores: {total_e} total ({created_e} nuevos del Excel, {updated_e} oficiales actualizados, {preservados} oficiales preservados por manual=True, {manuales} creados por usuario INTACTOS)")

            # Pólizas: combina catálogo completo (244 plantas del Excel) + demo
            FULL_POLIZAS = []
            try:
                from app.seeds.polizas_full import FULL_POLIZAS as _FP
                FULL_POLIZAS = list(_FP)
                click.echo(f"   📦 polizas_full.py cargado: {len(FULL_POLIZAS)} plantas")
            except Exception as e:
                click.echo(f"   ⚠️  No se pudo cargar polizas_full.py: {e}")

            all_polizas = FULL_POLIZAS + SEED_POLIZAS
            created_p, updated_p, errors_p = 0, 0, 0

            for p in all_polizas:
                try:
                    key_code = p.get("code")
                    key_proj = p.get("project")
                    if not key_code and not key_proj:
                        continue

                    existing = None
                    if key_code:
                        existing = Poliza.query.filter_by(code=key_code).first()
                    if not existing and key_proj:
                        existing = Poliza.query.filter_by(project=key_proj).first()

                    if existing:
                        # UPSERT — fechas/plataforma/poliza/zona/status del Excel oficial SOBRESCRIBEN
                        if p.get("sysStart"): existing.sys_start = parse_date(p["sysStart"])
                        if p.get("polStart"): existing.pol_start = parse_date(p["polStart"])
                        if p.get("polEnd"):   existing.pol_end = parse_date(p["polEnd"])
                        if p.get("platform"): existing.platform = p["platform"]
                        if p.get("poliza"):   existing.poliza = p["poliza"]
                        if p.get("status"):   existing.status = p["status"]
                        if p.get("zona"):     existing.zona = p["zona"]
                        if p.get("code") and not existing.code:    existing.code = p["code"]
                        if p.get("project") and not existing.project: existing.project = p["project"]
                        # Estos preservan info ya capturada por usuario
                        if p.get("grupo") and not existing.grupo:     existing.grupo = p["grupo"]
                        if p.get("tarifa") and not existing.tarifa:   existing.tarifa = p["tarifa"]
                        if p.get("cuadrilla") and not existing.cuadrilla: existing.cuadrilla = p["cuadrilla"]
                        updated_p += 1
                    else:
                        db.session.add(Poliza(
                            item=p.get("item") if isinstance(p.get("item"), (int, float)) else None,
                            grupo=p.get("grupo"), code=p.get("code"),
                            project=p.get("project") or "—",
                            tarifa=p.get("tarifa"),
                            platform=p.get("platform"),
                            panels=p.get("panels"), inv=p.get("inv"),
                            sys_start=parse_date(p.get("sysStart")),
                            pol_start=parse_date(p.get("polStart")),
                            pol_end=parse_date(p.get("polEnd")),
                            status=p.get("status"), poliza=p.get("poliza"),
                            zona=p.get("zona"), cuadrilla=p.get("cuadrilla"),
                        ))
                        created_p += 1
                except Exception as e:
                    errors_p += 1
                    click.echo(f"   ⚠️  Error en planta {p.get('code') or p.get('project')}: {e}")

            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                click.echo(f"   ⚠️  Commit pólizas falló: {e}")

            total_p = Poliza.query.count()
            click.echo(f"✅ Pólizas: {total_p} total ({created_p} creadas, {updated_p} actualizadas, {errors_p} con error)")

            for i in SEED_INCIDENCIAS:
                db.session.add(Incidencia(
                    platform=i.get("platform"), num=i.get("num"),
                    site=i["site"], client=i.get("client"), code=i.get("code"),
                    priority=i.get("priority"), notes=i.get("notes"),
                    inc_date=parse_date(i.get("incDate")),
                    err_code=i.get("errCode"),
                    classification=i.get("classification"),
                    equipment=i.get("equipment"),
                    problem=i.get("problem"), cause=i.get("cause"),
                    solution=i.get("solution"),
                    ticket_alta=i.get("ticketAlta"),
                    ticket_date=parse_date(i.get("ticketDate")),
                    status="abierta",
                ))
            db.session.commit()
            click.echo(f"✅ Incidencias: {Incidencia.query.count()}")

            for g in SEED_GARANTIAS:
                db.session.add(Garantia(
                    project=g["project"], equipment=g.get("equipment"),
                    brand=g.get("brand"), model=g.get("model"), sn=g.get("sn"),
                    error=g.get("error"), supplier=g.get("supplier"),
                    contact=g.get("contact"), ticket=g.get("ticket"),
                    status=g.get("status"),
                    upload_date=parse_date(g.get("uploadDate")),
                ))
            db.session.commit()
            click.echo(f"✅ Garantías: {Garantia.query.count()}")

            try:
                from app.seeds.directorio_full import FULL_DIRECTORIO
            except ImportError:
                FULL_DIRECTORIO = []

            # Directorio — UPSERT por (project + maint_contact).
            # Actualiza SIEMPRE los campos del Excel (project_code, system_type, etc.)
            # cuando los traemos del archivo, ya que es la fuente autoritativa.
            created_d, updated_d = 0, 0
            for d in FULL_DIRECTORIO:
                key_contact = d.get("maint_contact")
                existing = Directorio.query.filter_by(
                    project=d["project"], maint_contact=key_contact
                ).first()
                # Si no hay contacto en el Excel, también busca sólo por proyecto
                if not existing and not key_contact:
                    existing = Directorio.query.filter_by(project=d["project"]).first()

                target = existing or Directorio(project=d["project"])
                # Estos campos vienen del Excel → sobrescribir si tienen valor
                for src, attr in [
                    ("project_code", "project_code"),
                    ("system_type", "system_type"),
                    ("maint_contact", "maint_contact"),
                    ("maint_phone", "maint_phone"),
                    ("maint_contact_2", "maint_contact_2"),
                    ("maint_phone_2", "maint_phone_2"),
                    ("maint_email", "maint_email"),
                    ("internal_pm", "internal_pm"),
                    ("internal_phone", "internal_phone"),
                    ("client_name", "client_name"),
                    ("client_email", "client_email"),
                    ("client_phone", "client_phone"),
                ]:
                    if d.get(src):
                        setattr(target, attr, d[src])
                if not target.category:
                    target.category = "Cliente" if d.get("client_name") else "Mantenimiento"

                if existing:
                    updated_d += 1
                else:
                    db.session.add(target)
                    created_d += 1
            db.session.commit()
            click.echo(f"✅ Directorio: {Directorio.query.count()} total ({created_d} nuevos, {updated_d} actualizados)")

            # ── Análisis de plantas (energía garantizada mensual) ──
            try:
                import json as _json
                from app.models.analisis import AnalisisPlanta
                from app.seeds.analisis_full import FULL_ANALISIS
                created_a, updated_a = 0, 0
                for p in FULL_ANALISIS:
                    name = p.get("project")
                    if not name:
                        continue
                    existing = AnalisisPlanta.query.filter_by(project=name).first()
                    target = existing or AnalisisPlanta(project=name)
                    if p.get("potencia_kwp") is not None: target.potencia_kwp = p["potencia_kwp"]
                    if p.get("generado_kwh") is not None: target.generado_kwh = p["generado_kwh"]
                    if p.get("garantizado"):
                        target.garantizado = _json.dumps(p["garantizado"], ensure_ascii=False)
                    if p.get("cumple_mayo"): target.cumple_mayo = p["cumple_mayo"]
                    if p.get("proveedor"): target.proveedor = p["proveedor"]
                    if p.get("seguimiento"): target.seguimiento = p["seguimiento"]
                    if p.get("fallas"): target.fallas = p["fallas"]
                    if p.get("responsable"): target.responsable = p["responsable"]
                    if p.get("propuesta"): target.propuesta = p["propuesta"]
                    if p.get("marca_inversor"): target.marca_inversor = p["marca_inversor"]
                    if p.get("num_inversores") is not None: target.num_inversores = int(p["num_inversores"])
                    if existing:
                        updated_a += 1
                    else:
                        db.session.add(target)
                        created_a += 1
                db.session.commit()
                click.echo(f"✅ Análisis de plantas: {AnalisisPlanta.query.count()} total ({created_a} nuevas, {updated_a} actualizadas)")
            except Exception as e:
                click.echo(f"⚠️  Análisis no cargado: {e}")

            click.echo("\n🎉 Seeding completo.")

    # ──────────────────────────────────────────────────────────
    #  flask dedupe — elimina duplicados manteniendo el id más bajo
    # ──────────────────────────────────────────────────────────
    @app.cli.command("dedupe")
    def dedupe():
        """Elimina filas duplicadas en pólizas, directorio, incidencias, tickets y garantías."""
        with app.app_context():
            total = 0

            def _norm(s):
                return (s or "").strip().lower() if isinstance(s, str) else s

            # ── Pólizas: por code (no nulo); secundario por project ──
            seen_code, seen_proj, to_del = set(), set(), []
            for p in Poliza.query.order_by(Poliza.id.asc()).all():
                c = _norm(p.code)
                pr = _norm(p.project)
                if c and c in seen_code:
                    to_del.append(p)
                elif not c and pr and pr in seen_proj:
                    to_del.append(p)
                else:
                    if c: seen_code.add(c)
                    if pr: seen_proj.add(pr)
            for p in to_del:
                db.session.delete(p)
            click.echo(f"  Pólizas: -{len(to_del)}")
            total += len(to_del)

            # ── Directorio: por (project, maint_contact) ──
            seen, to_del = set(), []
            for d in Directorio.query.order_by(Directorio.id.asc()).all():
                k = (_norm(d.project), _norm(d.maint_contact))
                if k in seen:
                    to_del.append(d)
                else:
                    seen.add(k)
            for d in to_del:
                db.session.delete(d)
            click.echo(f"  Directorio: -{len(to_del)}")
            total += len(to_del)

            # ── Incidencias: por (site, code, err_code, inc_date) ──
            seen, to_del = set(), []
            for i in Incidencia.query.order_by(Incidencia.id.asc()).all():
                k = (_norm(i.site), _norm(i.code), _norm(i.err_code), i.inc_date)
                if k in seen:
                    to_del.append(i)
                else:
                    seen.add(k)
            for i in to_del:
                db.session.delete(i)
            click.echo(f"  Incidencias: -{len(to_del)}")
            total += len(to_del)

            # ── Tickets: por (title, site, open_date) ──
            seen, to_del = set(), []
            for t in Ticket.query.order_by(Ticket.id.asc()).all():
                k = (_norm(t.title), _norm(t.site), t.open_date)
                if k in seen:
                    to_del.append(t)
                else:
                    seen.add(k)
            for t in to_del:
                db.session.delete(t)
            click.echo(f"  Tickets: -{len(to_del)}")
            total += len(to_del)

            # ── Garantías: por (project, ticket, error) ──
            seen, to_del = set(), []
            for g in Garantia.query.order_by(Garantia.id.asc()).all():
                k = (_norm(g.project), _norm(g.ticket), _norm(g.error))
                if k in seen:
                    to_del.append(g)
                else:
                    seen.add(k)
            for g in to_del:
                db.session.delete(g)
            click.echo(f"  Garantías: -{len(to_del)}")
            total += len(to_del)

            db.session.commit()
            click.echo(f"\n✅ {total} duplicados eliminados.")
