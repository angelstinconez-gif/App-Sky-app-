"""App factory — instancia Flask, registra extensiones y blueprints."""
import os

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app(config_class="config.Config"):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    # ── Modelos (importar antes de crear blueprints para que SQLAlchemy los registre) ──
    from app.models import (  # noqa: F401
        user,
        incidencia,
        error_catalog,
        garantia,
        poliza,
        ticket,
        directorio,
        cuadrilla,
        tecnico,
        evento,
        historial,
        mantenimiento,
        notification,
        aviso,
        viatico,
        checklist,
    )

    # ── Blueprints ──
    from app.routes.auth import bp as auth_bp
    from app.routes.users import bp as users_bp
    from app.routes.incidencias import bp as incidencias_bp
    from app.routes.errores import bp as errores_bp
    from app.routes.garantias import bp as garantias_bp
    from app.routes.polizas import bp as polizas_bp
    from app.routes.tickets import bp as tickets_bp
    from app.routes.directorio import bp as directorio_bp
    from app.routes.cuadrillas import bp as cuadrillas_bp
    from app.routes.eventos import bp as eventos_bp
    from app.routes.historial import bp as historial_bp
    from app.routes.mantenimiento import bp as mantenimiento_bp
    from app.routes.dashboard import bp as dashboard_bp
    from app.routes.importar import bp as importar_bp
    from app.routes.notifications import bp as notifications_bp
    from app.routes.assignees import bp as assignees_bp
    from app.routes.tecnicos import bp as tecnicos_bp
    from app.routes.avisos import bp as avisos_bp
    from app.routes.reportes import bp as reportes_bp
    from app.routes.viaticos import bp as viaticos_bp
    from app.routes.checklists import bp as checklists_bp

    app.register_blueprint(auth_bp,         url_prefix="/api/auth")
    app.register_blueprint(users_bp,        url_prefix="/api/users")
    app.register_blueprint(incidencias_bp,  url_prefix="/api/incidencias")
    app.register_blueprint(errores_bp,      url_prefix="/api/errores")
    app.register_blueprint(garantias_bp,    url_prefix="/api/garantias")
    app.register_blueprint(polizas_bp,      url_prefix="/api/polizas")
    app.register_blueprint(tickets_bp,      url_prefix="/api/tickets")
    app.register_blueprint(directorio_bp,   url_prefix="/api/directorio")
    app.register_blueprint(cuadrillas_bp,   url_prefix="/api/cuadrillas")
    app.register_blueprint(eventos_bp,      url_prefix="/api/eventos")
    app.register_blueprint(historial_bp,    url_prefix="/api/historial")
    app.register_blueprint(mantenimiento_bp,url_prefix="/api/mantenimiento")
    app.register_blueprint(dashboard_bp,    url_prefix="/api/dashboard")
    app.register_blueprint(importar_bp,     url_prefix="/api/importar")
    app.register_blueprint(notifications_bp,url_prefix="/api/notifications")
    app.register_blueprint(assignees_bp,    url_prefix="/api/assignees")
    app.register_blueprint(tecnicos_bp,     url_prefix="/api/tecnicos")
    app.register_blueprint(avisos_bp,       url_prefix="/api/avisos")
    app.register_blueprint(reportes_bp,     url_prefix="/api/reportes")
    app.register_blueprint(viaticos_bp,     url_prefix="/api/viaticos")
    app.register_blueprint(checklists_bp,   url_prefix="/api/checklists")

    # ── CLI: seed ──
    from app.seeds.seed_cli import register_seed_cli
    register_seed_cli(app)

    # ── Healthcheck ──
    @app.route("/api/health")
    def health():
        return jsonify(status="ok", service="skypv-monitor")

    @app.route("/")
    def root():
        return jsonify(
            service="SKY PV Monitor API",
            version="1.0.0",
            endpoints="/api/*",
            health="/api/health",
        )

    # ── Manejador global de errores → JSON ──
    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="not_found", message=str(e)), 404

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify(error="bad_request", message=str(e)), 400

    @app.errorhandler(500)
    def internal(e):
        import traceback
        tb = traceback.format_exc()
        app.logger.error("Internal error: %s\n%s", e, tb)
        # En desarrollo (DEBUG=1) devolvemos el mensaje real para depurar.
        show = app.config.get("DEBUG") or os.environ.get("FLASK_DEBUG") == "1"
        return jsonify(
            error="internal_error",
            message=(str(e) if show else "Error interno"),
        ), 500

    @app.errorhandler(Exception)
    def unhandled(e):
        import traceback
        tb = traceback.format_exc()
        app.logger.error("Unhandled exception: %s\n%s", e, tb)
        return jsonify(error="server_error", message=str(e)), 500

    # ── JWT: respuestas JSON ──
    @jwt.unauthorized_loader
    def _missing_token(msg):
        return jsonify(error="missing_token", message=msg), 401

    @jwt.invalid_token_loader
    def _invalid_token(msg):
        return jsonify(error="invalid_token", message=msg), 401

    @jwt.expired_token_loader
    def _expired_token(jwt_header, jwt_payload):
        return jsonify(error="token_expired", message="Token expirado"), 401

    return app
