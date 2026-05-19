"""Comandos CLI Flask: flask seed-all, flask init-db, flask create-admin."""
import os

import click

from app import db
from app.models.user import User
from app.models.error_catalog import ErrorCatalog
from app.models.poliza import Poliza
from app.models.incidencia import Incidencia
from app.models.garantia import Garantia
from app.models.directorio import Directorio
from app.seeds.seed_data import (
    DEFAULT_USERS,
    SEED_ERRORES,
    SEED_POLIZAS,
    SEED_INCIDENCIAS,
    SEED_GARANTIAS,
    SEED_DIRECTORIO,
)
from app.utils.parse import parse_date


def register_seed_cli(app):
    @app.cli.command("init-db")
    def init_db():
        """Crea todas las tablas (uso rápido sin migraciones)."""
        with app.app_context():
            db.create_all()
        click.echo("✅ Base de datos inicializada.")

    @app.cli.command("create-admin")
    def create_admin():
        """Crea el usuario admin desde variables de entorno si no existe."""
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
            click.echo(f"✅ Admin creado: {email} / {password}")

    @app.cli.command("seed-all")
    def seed_all():
        """Carga todos los datos iniciales (usuarios, errores, pólizas, incidencias, etc.)."""
        with app.app_context():
            # Usuarios
            for u in DEFAULT_USERS:
                if User.query.filter_by(email=u["email"]).first():
                    continue
                user = User(
                    email=u["email"],
                    name=u["name"],
                    role=u["role"],
                    initials=u.get("initials"),
                    active=True,
                )
                user.set_password(u["password"])
                db.session.add(user)
            db.session.commit()
            click.echo(f"✅ Usuarios: {User.query.count()}")

            # Errores
            for e in SEED_ERRORES:
                if ErrorCatalog.query.filter_by(brand=e["brand"], code=e["code"]).first():
                    continue
                db.session.add(ErrorCatalog(**e))
            db.session.commit()
            click.echo(f"✅ Errores: {ErrorCatalog.query.count()}")

            # Pólizas
            for p in SEED_POLIZAS:
                if p.get("code") and Poliza.query.filter_by(code=p["code"]).first():
                    continue
                db.session.add(
                    Poliza(
                        item=p.get("item"),
                        grupo=p.get("grupo"),
                        code=p.get("code"),
                        project=p["project"],
                        tarifa=p.get("tarifa"),
                        platform=p.get("platform"),
                        panels=p.get("panels"),
                        inv=p.get("inv"),
                        sys_start=parse_date(p.get("sysStart")),
                        pol_start=parse_date(p.get("polStart")),
                        pol_end=parse_date(p.get("polEnd")),
                        status=p.get("status"),
                        poliza=p.get("poliza"),
                        zona=p.get("zona"),
                        cuadrilla=p.get("cuadrilla"),
                    )
                )
            db.session.commit()
            click.echo(f"✅ Pólizas: {Poliza.query.count()}")

            # Incidencias
            for i in SEED_INCIDENCIAS:
                db.session.add(
                    Incidencia(
                        platform=i.get("platform"),
                        num=i.get("num"),
                        site=i["site"],
                        client=i.get("client"),
                        code=i.get("code"),
                        priority=i.get("priority"),
                        notes=i.get("notes"),
                        inc_date=parse_date(i.get("incDate")),
                        err_code=i.get("errCode"),
                        classification=i.get("classification"),
                        problem=i.get("problem"),
                        cause=i.get("cause"),
                        solution=i.get("solution"),
                        ticket_alta=i.get("ticketAlta"),
                        ticket_date=parse_date(i.get("ticketDate")),
                        status="abierta",
                    )
                )
            db.session.commit()
            click.echo(f"✅ Incidencias: {Incidencia.query.count()}")

            # Garantías
            for g in SEED_GARANTIAS:
                db.session.add(
                    Garantia(
                        project=g["project"],
                        equipment=g.get("equipment"),
                        brand=g.get("brand"),
                        model=g.get("model"),
                        sn=g.get("sn"),
                        error=g.get("error"),
                        supplier=g.get("supplier"),
                        contact=g.get("contact"),
                        ticket=g.get("ticket"),
                        status=g.get("status"),
                        upload_date=parse_date(g.get("uploadDate")),
                    )
                )
            db.session.commit()
            click.echo(f"✅ Garantías: {Garantia.query.count()}")

            # Directorio
            for d in SEED_DIRECTORIO:
                if Directorio.query.filter_by(name=d["name"]).first():
                    continue
                db.session.add(Directorio(**d))
            db.session.commit()
            click.echo(f"✅ Directorio: {Directorio.query.count()}")

            click.echo("\n🎉 Seeding completo.\n")
            click.echo("Usuarios de prueba:")
            for u in DEFAULT_USERS:
                click.echo(f"  • {u['email']:35} {u['password']:20} ({u['role']})")
