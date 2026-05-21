"""Lista combinada de usuarios + cuadrillas + técnicos para campos 'asignado a'."""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.models.user import User
from app.models.cuadrilla import Cuadrilla
from app.models.tecnico import Tecnico

bp = Blueprint("assignees", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_assignees():
    """Devuelve usuarios activos + cuadrillas + técnicos, etiquetados con su tipo."""
    users = User.query.filter_by(active=True).order_by(User.name).all()
    cuads = Cuadrilla.query.order_by(Cuadrilla.zona, Cuadrilla.nombre).all()
    try:
        tecs = Tecnico.query.filter_by(activo=True).order_by(Tecnico.nombre).all()
    except Exception:
        tecs = []  # tabla aún no creada

    out = [{
        "id": f"user-{u.id}",
        "label": u.name,
        "email": u.email,
        "type": "user",
        "role": u.role,
        "value": u.name,
    } for u in users]

    out.extend([{
        "id": f"cuad-{c.id}",
        "label": f"🏗️ {c.nombre}" + (f" ({c.zona})" if c.zona else ""),
        "type": "cuadrilla",
        "zona": c.zona,
        "lider": c.lider,
        "value": c.nombre,
    } for c in cuads])

    out.extend([{
        "id": f"tec-{t.id}",
        "label": f"🧑‍🔧 {t.nombre}" + (f" ({t.rol})" if t.rol else ""),
        "type": "tecnico",
        "rol": t.rol,
        "telefono": t.telefono,
        "zona": t.zona,
        "value": t.nombre,
    } for t in tecs])

    return jsonify(out)
