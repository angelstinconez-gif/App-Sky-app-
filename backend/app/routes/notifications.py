"""Endpoints para suscribirse a notificaciones y enviarlas."""
import os

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models.notification import NotificationSubscription
from app.utils.audit import log_change
from app.utils.notify import notify_event

bp = Blueprint("notifications", __name__)


@bp.route("/vapid-public-key", methods=["GET"])
def vapid_public_key():
    """Devuelve la clave pública VAPID para que el navegador se suscriba a push."""
    return jsonify(publicKey=os.environ.get("VAPID_PUBLIC_KEY", ""))


@bp.route("/subscribe/push", methods=["POST"])
@jwt_required()
def subscribe_push():
    """Suscribe al usuario actual a notificaciones Web Push."""
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())

    endpoint = data.get("endpoint")
    keys = data.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return jsonify(error="missing_fields", message="endpoint, p256dh y auth requeridos"), 400

    # Si ya existe esta suscripción exacta, sólo la reactivamos
    sub = NotificationSubscription.query.filter_by(user_id=user_id, channel="push", endpoint=endpoint).first()
    if not sub:
        sub = NotificationSubscription(
            user_id=user_id, channel="push", endpoint=endpoint, p256dh=p256dh, auth_key=auth
        )
        db.session.add(sub)
    sub.active = True
    sub.p256dh = p256dh
    sub.auth_key = auth
    db.session.commit()
    return jsonify(ok=True, id=sub.id)


@bp.route("/subscribe/whatsapp", methods=["POST"])
@jwt_required()
def subscribe_whatsapp():
    """Registra un número de WhatsApp para el usuario actual."""
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    phone = (data.get("phone") or "").strip()
    if not phone:
        return jsonify(error="missing_phone"), 400

    sub = NotificationSubscription.query.filter_by(user_id=user_id, channel="whatsapp").first()
    if not sub:
        sub = NotificationSubscription(user_id=user_id, channel="whatsapp", phone=phone)
        db.session.add(sub)
    sub.phone = phone
    sub.active = True
    db.session.commit()
    return jsonify(ok=True, id=sub.id)


@bp.route("/subscriptions", methods=["GET"])
@jwt_required()
def my_subscriptions():
    user_id = int(get_jwt_identity())
    subs = NotificationSubscription.query.filter_by(user_id=user_id).all()
    return jsonify([s.to_dict() for s in subs])


@bp.route("/subscriptions/<int:sid>", methods=["DELETE"])
@jwt_required()
def unsubscribe(sid):
    user_id = int(get_jwt_identity())
    sub = NotificationSubscription.query.filter_by(id=sid, user_id=user_id).first()
    if not sub:
        return jsonify(error="not_found"), 404
    db.session.delete(sub)
    db.session.commit()
    return jsonify(ok=True)


@bp.route("/test", methods=["POST"])
@jwt_required()
def test_notification():
    """Envía una notificación de prueba al usuario actual."""
    user_id = int(get_jwt_identity())
    sent = notify_event(
        event_type="test",
        title="🔔 Notificación de prueba",
        body="Si recibes este mensaje, tus notificaciones están configuradas correctamente.",
        user_ids=[user_id],
    )
    return jsonify(ok=True, sent=sent)
