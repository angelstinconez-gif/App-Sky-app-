"""Helper para registrar cambios en el historial."""
import json

from flask_jwt_extended import get_jwt, verify_jwt_in_request

from app import db
from app.models.historial import Historial


def log_change(section: str, action: str, detail: str = "", old=None, new=None):
    """Registra una entrada de historial. No falla si no hay usuario autenticado."""
    user_email = user_name = None
    try:
        verify_jwt_in_request(optional=True)
        claims = get_jwt() or {}
        user_email = claims.get("email")
        user_name = claims.get("name")
    except Exception:
        pass

    entry = Historial(
        section=section,
        action=action,
        detail=detail or "",
        old_data=json.dumps(old, default=str) if old is not None else None,
        new_data=json.dumps(new, default=str) if new is not None else None,
        user_email=user_email,
        user_name=user_name,
    )
    db.session.add(entry)
    # No hace commit — el caller controla la transacción
