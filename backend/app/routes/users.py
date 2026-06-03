"""CRUD de usuarios — sólo admin."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models.user import User
from app.utils.audit import log_change
from app.utils.decorators import admin_required
from app.utils.parse import parse_str

bp = Blueprint("users", __name__)

# Roles válidos del sistema
VALID_ROLES = ("admin", "operator", "mantenimiento", "tecnico", "viewer")


@bp.route("", methods=["GET"])
@jwt_required()
@admin_required
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users])


@bp.route("", methods=["POST"])
@jwt_required()
@admin_required
def create_user():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = parse_str(data.get("name"))
    role = data.get("role") or "operator"

    if role not in VALID_ROLES:
        return jsonify(error="invalid_role",
                       message=f"Rol no válido. Permitidos: {', '.join(VALID_ROLES)}"), 400
    if not email or not password or not name:
        return jsonify(error="missing_fields", message="email, password y name son obligatorios"), 400
    if len(password) < 6:
        return jsonify(error="weak_password", message="Mínimo 6 caracteres"), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="duplicate_email", message="Ya existe ese correo"), 409

    user = User(
        email=email,
        name=name,
        role=role,
        initials=parse_str(data.get("initials")),
        active=bool(data.get("active", True)),
    )
    user.set_password(password)
    db.session.add(user)
    log_change("usuarios", "crear", f"Usuario creado: {email} ({role})", new=user.to_dict())
    db.session.commit()
    return jsonify(user.to_dict()), 201


@bp.route("/<int:user_id>", methods=["PUT"])
@jwt_required()
@admin_required
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error="not_found"), 404

    data = request.get_json(silent=True) or {}
    old = user.to_dict()
    if "name" in data:
        user.name = parse_str(data["name"]) or user.name
    if "email" in data:
        new_email = (data["email"] or "").strip().lower()
        if new_email and new_email != user.email:
            if User.query.filter_by(email=new_email).first():
                return jsonify(error="duplicate_email"), 409
            user.email = new_email
    if "role" in data and data["role"] in VALID_ROLES:
        user.role = data["role"]
    if "active" in data:
        user.active = bool(data["active"])
    if "initials" in data:
        user.initials = parse_str(data["initials"])
    if data.get("password"):
        if len(data["password"]) < 6:
            return jsonify(error="weak_password"), 400
        user.set_password(data["password"])

    log_change("usuarios", "editar", f"Usuario editado: {user.email}", old=old, new=user.to_dict())
    db.session.commit()
    return jsonify(user.to_dict())


@bp.route("/<int:user_id>", methods=["DELETE"])
@jwt_required()
@admin_required
def delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error="not_found"), 404
    if User.query.filter_by(role="admin", active=True).count() <= 1 and user.role == "admin":
        return jsonify(error="last_admin", message="No puedes eliminar al último admin"), 400
    log_change("usuarios", "eliminar", f"Usuario eliminado: {user.email}", old=user.to_dict())
    db.session.delete(user)
    db.session.commit()
    return jsonify(ok=True)
