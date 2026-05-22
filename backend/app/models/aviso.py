"""Avisos del día / Mensajes pegados por admins en el Dashboard."""
from datetime import datetime

from app import db


class Aviso(db.Model):
    __tablename__ = "avisos"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text)
    level = db.Column(db.String(20), default="info", index=True)  # info, warning, danger
    posted_by = db.Column(db.String(120))      # nombre del admin que lo publicó
    posted_by_email = db.Column(db.String(180))
    valid_from = db.Column(db.Date, default=lambda: datetime.utcnow().date(), index=True)
    valid_until = db.Column(db.Date, index=True)
    pinned = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def is_active(self):
        today = datetime.utcnow().date()
        if self.valid_from and today < self.valid_from:
            return False
        if self.valid_until and today > self.valid_until:
            return False
        return True

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "level": self.level,
            "postedBy": self.posted_by,
            "postedByEmail": self.posted_by_email,
            "validFrom": self.valid_from.isoformat() if self.valid_from else None,
            "validUntil": self.valid_until.isoformat() if self.valid_until else None,
            "pinned": self.pinned,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "active": self.is_active(),
        }
