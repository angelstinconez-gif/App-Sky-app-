"""Notificaciones (Web Push y WhatsApp)."""
from datetime import datetime

from app import db


class NotificationSubscription(db.Model):
    """Suscripción para recibir notificaciones de cada usuario."""

    __tablename__ = "notification_subscriptions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = db.Column(db.String(20), nullable=False, index=True)  # 'push', 'whatsapp', 'email'

    # Para push (Web Push API)
    endpoint = db.Column(db.Text)
    p256dh = db.Column(db.String(255))
    auth_key = db.Column(db.String(255))

    # Para WhatsApp / SMS
    phone = db.Column(db.String(60))

    # Para email
    email = db.Column(db.String(180))

    # Preferencias de eventos a recibir
    event_types = db.Column(db.String(500), default="mantenimiento_programado,mantenimiento_vencido,incidencia_critica")

    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_sent = db.Column(db.DateTime)

    user = db.relationship("User", backref=db.backref("subscriptions", lazy=True, cascade="all, delete-orphan"))

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "channel": self.channel,
            "phone": self.phone,
            "email": self.email,
            "eventTypes": (self.event_types or "").split(","),
            "active": self.active,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class NotificationLog(db.Model):
    """Bitácora de notificaciones enviadas (para evitar duplicados y auditar)."""

    __tablename__ = "notification_log"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    channel = db.Column(db.String(20), index=True)
    event_type = db.Column(db.String(60), index=True)
    title = db.Column(db.String(200))
    body = db.Column(db.Text)
    related_type = db.Column(db.String(40))
    related_id = db.Column(db.Integer)
    success = db.Column(db.Boolean, default=False)
    error_message = db.Column(db.Text)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
