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
        """Recrea/altera tablas para igualar el esquema actual sin perder datos cuando es posible."""
        from sqlalchemy import inspect, text
        from app.models.notification import NotificationSubscription, NotificationLog

        with app.app_context():
            insp = inspect(db.engine)
            tables_to_recreate = []
            altered = 0

            # directorio — recreación total (cambio masivo de esquema)
            if insp.has_table("directorio"):
                cols = {c["name"] for c in insp.get_columns("directorio")}
                if "client_company" not in cols or "maint_contact_2" not in cols:
                    tables_to_recreate.append(Directorio.__table__)

            # errores_catalogo — recreación total
            if insp.has_table("errores_catalogo"):
                cols = {c["name"] for c in insp.get_columns("errores_catalogo")}
                if "equipment" not in cols or "source_url" not in cols:
                    tables_to_recreate.append(ErrorCatalog.__table__)

            # incidencias — sólo añadir columna 'equipment' si falta (preservando datos)
            if insp.has_table("incidencias"):
                cols = {c["name"] for c in insp.get_columns("incidencias")}
                if "equipment" not in cols:
                    with db.engine.begin() as conn:
                        conn.execute(text("ALTER TABLE incidencias ADD COLUMN equipment VARCHAR(120)"))
                    altered += 1
                    click.echo("➕ Añadida columna 'equipment' a incidencias")

            # notification_log — añadir 'read_at' para el buzón in-app
            if insp.has_table("notification_log"):
                cols = {c["name"] for c in insp.get_columns("notification_log")}
                if "read_at" not in cols:
                    with db.engine.begin() as conn:
                        conn.execute(text("ALTER TABLE notification_log ADD COLUMN read_at TIMESTAMP"))
                    altered += 1
                    click.echo("➕ Añadida columna 'read_at' a notification_log")

            # cuadrillas — añadir 'lider_id' (FK a tecnicos)
            if insp.has_table("cuadrillas"):
                cols = {c["name"] for c in insp.get_columns("cuadrillas")}
                if "lider_id" not in cols:
                    with db.engine.begin() as conn:
                        conn.execute(text("ALTER TABLE cuadrillas ADD COLUMN lider_id INTEGER"))
                    altered += 1
                    click.echo("➕ Añadida columna 'lider_id' a cuadrillas")

            # tecnicos — tabla nueva
            from app.models.tecnico import Tecnico as _Tecnico
            if not insp.has_table("tecnicos"):
                _Tecnico.__table__.create(db.engine)
                click.echo("➕ Creada: tecnicos")

            # Recrear tablas que cambiaron mucho
            for t in tables_to_recreate:
                click.echo(f"🔄 Recreando tabla: {t.name}")
                t.drop(db.engine)
                t.create(db.engine)

            # Tablas nuevas
            if not insp.has_table("notification_subscriptions"):
                NotificationSubscription.__table__.create(db.engine)
                click.echo("➕ Creada: notification_subscriptions")
            if not insp.has_table("notification_log"):
                NotificationLog.__table__.create(db.engine)
                click.echo("➕ Creada: notification_log")

            if not tables_to_recreate and not altered:
                click.echo("✅ Esquema ya está al día.")
            else:
                click.echo(f"✅ {len(tables_to_recreate)} recreada(s), {altered} alterada(s).")

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

            if replace_errors and FULL_ERRORES:
                ErrorCatalog.query.delete()
                db.session.commit()

            for e in FULL_ERRORES:
                if ErrorCatalog.query.filter_by(brand=e["brand"], code=e["code"]).first():
                    continue
                db.session.add(ErrorCatalog(
                    brand=e["brand"], code=e["code"],
                    equipment=e.get("equipment"),
                    classification=e.get("classification"),
                    tipo=e.get("tipo"), problem=e.get("problem"),
                    cause=e.get("cause"), solution=e.get("solution"),
                    impact=e.get("impact"), source_url=e.get("source_url"),
                    priority=e.get("priority"),
                ))
            db.session.commit()
            click.echo(f"✅ Errores: {ErrorCatalog.query.count()}")

            # Pólizas: combina demo + catálogo completo (247 plantas del Excel)
            try:
                from app.seeds.polizas_full import FULL_POLIZAS
            except ImportError:
                FULL_POLIZAS = []
            all_polizas = (FULL_POLIZAS or []) + SEED_POLIZAS  # primero los del Excel

            for p in all_polizas:
                key_code = p.get("code")
                key_proj = p.get("project")
                existing = None
                if key_code:
                    existing = Poliza.query.filter_by(code=key_code).first()
                if not existing and key_proj:
                    existing = Poliza.query.filter_by(project=key_proj).first()

                if existing:
                    # UPSERT — actualiza campos vacíos sin sobrescribir info válida
                    if p.get("grupo") and not existing.grupo: existing.grupo = p["grupo"]
                    if p.get("tarifa") and not existing.tarifa: existing.tarifa = p["tarifa"]
                    if p.get("platform") and not existing.platform: existing.platform = p["platform"]
                    if p.get("sysStart") and not existing.sys_start: existing.sys_start = parse_date(p["sysStart"])
                    if p.get("polStart") and not existing.pol_start: existing.pol_start = parse_date(p["polStart"])
                    if p.get("polEnd") and not existing.pol_end: existing.pol_end = parse_date(p["polEnd"])
                    if p.get("status") and not existing.status: existing.status = p["status"]
                    if p.get("zona") and not existing.zona: existing.zona = p["zona"]
                    if p.get("cuadrilla") and not existing.cuadrilla: existing.cuadrilla = p["cuadrilla"]
                    if p.get("poliza") and not existing.poliza: existing.poliza = p["poliza"]
                    continue

                db.session.add(Poliza(
                    item=p.get("item"), grupo=p.get("grupo"), code=p.get("code"),
                    project=p["project"], tarifa=p.get("tarifa"),
                    platform=p.get("platform"), panels=p.get("panels"), inv=p.get("inv"),
                    sys_start=parse_date(p.get("sysStart")),
                    pol_start=parse_date(p.get("polStart")),
                    pol_end=parse_date(p.get("polEnd")),
                    status=p.get("status"), poliza=p.get("poliza"),
                    zona=p.get("zona"), cuadrilla=p.get("cuadrilla"),
                ))
            db.session.commit()
            click.echo(f"✅ Pólizas (con plantas del Excel): {Poliza.query.count()}")

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

            for d in FULL_DIRECTORIO:
                exists = Directorio.query.filter_by(
                    project=d["project"], maint_contact=d.get("maint_contact")
                ).first()
                if exists:
                    continue
                db.session.add(Directorio(
                    project=d["project"],
                    project_code=d.get("project_code"),
                    system_type=d.get("system_type"),
                    maint_contact=d.get("maint_contact"),
                    maint_phone=d.get("maint_phone"),
                    maint_contact_2=d.get("maint_contact_2"),
                    maint_phone_2=d.get("maint_phone_2"),
                    maint_email=d.get("maint_email"),
                    internal_pm=d.get("internal_pm"),
                    internal_phone=d.get("internal_phone"),
                    client_name=d.get("client_name"),
                    client_email=d.get("client_email"),
                    client_phone=d.get("client_phone"),
                    category="Cliente" if d.get("client_name") else "Mantenimiento",
                ))
            db.session.commit()
            click.echo(f"✅ Directorio: {Directorio.query.count()}")

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
