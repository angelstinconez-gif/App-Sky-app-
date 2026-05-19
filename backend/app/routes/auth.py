"""Autenticación: login, refresh, perfil."""
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
)

from app import db
from app.models.user import User
from app.utils.audit import log_change

bp = Blueprint("auth", __name__)


def _tokens_for(user: User):
    additional = {
        "email": user.email,
        "name": user.name,
        "role": user.role,
    }
    access = create_access_token(identity=str(user.id), additional_claims=additional)
    refresh = create_refresh_token(identity=str(user.id), additional_claims=additional)
    return access, refresh


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify(error="missing_fields", message="Email y contraseña requeridos"), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify(error="invalid_credentials", message="Correo o contraseña incorrectos"), 401
    if not user.active:
        return jsonify(error="inactive_user", message="Usuario inactivo"), 403

    user.last_login = datetime.utcnow()
    log_change("sistema", "login", f"Inicio de sesión — {user.name} ({user.role})")
    db.session.commit()

    access, refresh = _tokens_for(user)
    return jsonify(
        accessToken=access,
        refreshToken=refresh,
        user=user.to_dict(),
    )


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user or not user.active:
        return jsonify(error="user_not_found"), 404
    access, _ = _tokens_for(user)
    return jsonify(accessToken=access)


@bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify(error="user_not_found"), 404
    return jsonify(user=user.to_dict())


@bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    # JWT stateless — el cliente descarta tokens; sólo registramos en historial.
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if user:
        log_change("sistema", "logout", f"Cierre de sesión — {user.name}")
        db.session.commit()
    return jsonify(ok=True)


@bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("currentPassword") or ""
    new = data.get("newPassword") or ""
    if len(new) < 6:
        return jsonify(error="weak_password", message="Mínimo 6 caracteres"), 400

    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.check_password(current):
        return jsonify(error="invalid_credentials", message="Contraseña actual incorrecta"), 401

    user.set_password(new)
    log_change("usuarios", "cambio_password", f"{user.email} cambió su contraseña")
    db.session.commit()
    return jsonify(ok=True)
