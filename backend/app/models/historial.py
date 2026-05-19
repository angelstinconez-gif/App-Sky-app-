"""Historial de cambios (audit log)."""
from datetime import datetime

from app import db


class Historial(db.Model):
    __tablename__ = "historial"

    id = db.Column(db.Integer, primary_key=True)
    section = db.Column(db.String(60), index=True)     # incidencias, tickets, polizas, etc.
    action = db.Column(db.String(40), index=True)      # crear, editar, eliminar, login, cerrar
    detail = db.Column(db.Text)
    old_data = db.Column(db.Text)                      # JSON serializado del estado anterior
    new_data = db.Column(db.Text)                      # JSON serializado del estado nuevo
    user_email = db.Column(db.String(180), index=True)
    user_name = db.Column(db.String(120))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "section": self.section,
            "action": self.action,
            "detail": self.detail,
            "oldData": self.old_data,
            "newData": self.new_data,
            "userEmail": self.user_email,
            "userName": self.user_name,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
