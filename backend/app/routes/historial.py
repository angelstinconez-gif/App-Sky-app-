"""Historial / Audit log — sólo lectura para admin."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.models.historial import Historial
from app.utils.decorators import admin_required

bp = Blueprint("historial", __name__)


@bp.route("", methods=["GET"])
@jwt_required()
@admin_required
def list_historial():
    args = request.args
    section = args.get("section")
    user_email = args.get("user")
    limit = min(int(args.get("limit", 200)), 1000)

    query = Historial.query
    if section:
        query = query.filter(Historial.section == section)
    if user_email:
        query = query.filter(Historial.user_email == user_email)

    items = query.order_by(Historial.timestamp.desc()).limit(limit).all()
    return jsonify([i.to_dict() for i in items])
