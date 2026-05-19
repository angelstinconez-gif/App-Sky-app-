"""Envío de notificaciones por WhatsApp (Twilio) y Web Push."""
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
        # Si el endpoint ya no es válido, marcamos la suscripción como inactiva
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
    from_ = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")  # sandbox por defecto

    if not sid or not token:
        return False, "Twilio no configurado (TWILIO_ACCOUNT_SID/TOKEN faltantes)"

    try:
        from twilio.rest import Client
    except ImportError:
        return False, "twilio no instalado"

    # Normalizar número
    p = str(phone).strip().replace(" ", "").replace("-", "")
    if not p.startswith("+"):
        # Asumir México si no tiene prefijo
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
def notify_event(event_type: str, title: str, body: str, related_type: str = None, related_id: int = None, user_ids: list = None):
    """
    Envía notificación a todos los suscriptores de un evento.
    Si user_ids está dado, sólo a esos usuarios.
    """
    query = NotificationSubscription.query.filter_by(active=True)
    if user_ids:
        query = query.filter(NotificationSubscription.user_id.in_(user_ids))
    subs = query.all()

    # Filtrar por tipo de evento
    subs = [s for s in subs if not s.event_types or event_type in s.event_types]

    sent = 0
    for s in subs:
        ok, err = False, "canal desconocido"
        if s.channel == "push" and s.endpoint:
            ok, err = send_web_push(s, title, body, {"type": event_type, "id": related_id})
        elif s.channel == "whatsapp" and s.phone:
            text = f"*{title}*\n{body}"
            ok, err = send_whatsapp(s.phone, text)

        log = NotificationLog(
            user_id=s.user_id,
            channel=s.channel,
            event_type=event_type,
            title=title,
            body=body,
            related_type=related_type,
            related_id=related_id,
            success=ok,
            error_message=err if not ok else None,
        )
        db.session.add(log)
        if ok:
            s.last_sent = datetime.utcnow()
            sent += 1

    db.session.commit()
    return sent
