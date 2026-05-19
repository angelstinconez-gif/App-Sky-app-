"""Decoradores y helpers de seguridad por rol."""
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request

from app import db
from app.models.user import User


def get_current_user():
    """Devuelve la instancia User actual (None si no auth)."""
    try:
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
        if not claims:
            return None
        user_id = claims.get("sub") or claims.get("user_id")
        if user_id:
            return db.session.get(User, int(user_id))
    except Exception:
        return None
    return None


def role_required(*roles):
    """Sólo permite acceso a usuarios con uno de los roles indicados."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role not in roles:
                return (
                    jsonify(
                        error="forbidden",
                        message=f"Se requiere rol: {', '.join(roles)}",
                    ),
                    403,
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    return role_required("admin")(fn)
