"""Eventos del calendario."""
from datetime import datetime

from app import db


class Evento(db.Model):
    __tablename__ = "eventos"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    event_date = db.Column(db.Date, nullable=False, index=True)
    end_date = db.Column(db.Date)
    event_type = db.Column(db.String(40), index=True)  # mantenimiento, vencimiento, incidencia, ticket, otro
    related_id = db.Column(db.Integer)                 # ID de la entidad relacionada
    related_type = db.Column(db.String(40))            # 'poliza', 'incidencia', 'ticket', etc.
    description = db.Column(db.Text)
    color = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "eventDate": self.event_date.isoformat() if self.event_date else None,
            "endDate": self.end_date.isoformat() if self.end_date else None,
            "eventType": self.event_type,
            "relatedId": self.related_id,
            "relatedType": self.related_type,
            "description": self.description,
            "color": self.color,
        }
