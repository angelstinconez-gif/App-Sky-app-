"""Envío de notificaciones por buzón in-app, Web Push (PWA) y WhatsApp (Twilio).

Diseño:
- Toda notificación se registra **siempre** como una fila `NotificationLog`
  con `channel="inbox"` por cada destinatario. Esto alimenta el icono de
  campana en la Topbar — aunque el usuario no haya activado push/WhatsApp.
- Si además tiene suscripciones push o WhatsApp activas, se intentan los
  canales externos y se loguea el resultado.
"""
import json
import os
from datetime import datetime

from app import db
from app.models.notification import NotificationSubscription, NotificationLog


# ──────────────────────────────────────────────────────────────
#  Web Push
# ──────────────────────────────────────────────────────────────
def send_web_push(subscription: NotificationSubscription, title: str, body: str, data: dict = None) -> tuple[bool, str]:
    """Envía notificación Web Push. Devuelve (success, error_msg)."""
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return False, "pywebpush no instalado"

    vapid_private = os.environ.get("VAPID_PRIVATE_KEY")
    vapid_email = os.environ.get("VAPID_EMAIL", "mailto:admin@skyenergy.mx")
    if not vapid_private:
        return False, "VAPID_PRIVATE_KEY no configurada"

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth_key,
                },
            },
            data=json.dumps({"title": title, "body": body, "data": data or {}}),
            vapid_private_key=vapid_private,
            vapid_claims={"sub": vapid_email},
        )
        return True, ""
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            subscription.active = False
            db.session.commit()
        return False, str(e)
    except Exception as e:
        return False, str(e)


# ──────────────────────────────────────────────────────────────
#  WhatsApp via Twilio
# ──────────────────────────────────────────────────────────────
def send_whatsapp(phone: str, message: str) -> tuple[bool, str]:
    """Envía mensaje de WhatsApp usando Twilio. Devuelve (success, error_msg)."""
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_ = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if not sid or not token:
        return False, "Twilio no configurado"

    try:
        from twilio.rest import Client
    except ImportError:
        return False, "twilio no instalado"

    p = str(phone).strip().replace(" ", "").replace("-", "")
    if not p.startswith("+"):
        p = "+52" + p.lstrip("0")
    to = f"whatsapp:{p}"

    try:
        client = Client(sid, token)
        msg = client.messages.create(from_=from_, to=to, body=message)
        return True, msg.sid
    except Exception as e:
        return False, str(e)


# ──────────────────────────────────────────────────────────────
#  Dispatcher de alto nivel
# ──────────────────────────────────────────────────────────────
def _log(user_id, channel, event_type, title, body, related_type, related_id, success, error=None):
    """Inserta una fila en NotificationLog (no hace commit)."""
    log = NotificationLog(
        user_id=user_id,
        channel=channel,
        event_type=event_type,
        title=title,
        body=body,
        related_type=related_type,
        related_id=related_id,
        success=success,
        error_message=error,
    )
    db.session.add(log)
    return log


def notify_admins(event_type: str, title: str, body: str, related_type: str = None, related_id: int = None):
    """Notifica a TODOS los usuarios con rol admin (in-app + push/whatsapp si tienen)."""
    from app.models.user import User
    admin_ids = [u.id for u in User.query.filter_by(role="admin", active=True).all()]
    if not admin_ids:
        return 0
    return notify_event(event_type, title, body, related_type, related_id, user_ids=admin_ids)


def notify_event(event_type: str, title: str, body: str, related_type: str = None, related_id: int = None, user_ids: list = None):
    """Notifica un evento al conjunto de usuarios indicado.

    1. SIEMPRE escribe una fila `inbox` por cada `user_id` (visible en la campana).
    2. Adicionalmente intenta push/WhatsApp si el usuario tiene suscripciones activas
       y el `event_type` está en su lista de preferencias (o la lista está vacía).
    """
    if not user_ids:
        return 0

    sent = 0
    try:
        # 1. Buzón in-app (siempre) — una fila por destinatario
        for uid in user_ids:
            _log(uid, "inbox", event_type, title, body, related_type, related_id, success=True)
            sent += 1

        # 2. Canales externos (push / whatsapp) — solo si están suscritos
        subs = NotificationSubscription.query.filter(
            NotificationSubscription.user_id.in_(user_ids),
            NotificationSubscription.active.is_(True),
        ).all()
        for s in subs:
            # Filtrar por preferencias de eventos (si están definidas)
            if s.event_types:
                allowed = [e.strip() for e in s.event_types.split(",") if e.strip()]
                if allowed and event_type not in allowed:
                    continue

            ok, err = False, "canal desconocido"
            if s.channel == "push" and s.endpoint:
                ok, err = send_web_push(s, title, body, {"type": event_type, "id": related_id})
            elif s.channel == "whatsapp" and s.phone:
                ok, err = send_whatsapp(s.phone, f"*{title}*\n{body}")

            _log(s.user_id, s.channel, event_type, title, body, related_type, related_id, ok, err if not ok else None)
            if ok:
                s.last_sent = datetime.utcnow()

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"⚠️  notify_event falló: {e}")
    return sent
