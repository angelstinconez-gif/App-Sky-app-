"""Lista combinada de usuarios + cuadrillas para campos 'asignado a'."""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.models.user import User
from app.models.cuadrilla import Cuadrilla

bp = Blueprint("assignees", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
def list_assignees():
    """Devuelve usuarios activos + cuadrillas, etiquetados con su tipo."""
    users = User.query.filter_by(active=True).order_by(User.name).all()
    cuads = Cuadrilla.query.order_by(Cuadrilla.zona, Cuadrilla.nombre).all()

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

    return jsonify(out)
