"""Cuadrillas / Equipos de trabajo."""
from datetime import datetime

from app import db


class Cuadrilla(db.Model):
    __tablename__ = "cuadrillas"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(120), nullable=False, index=True)
    zona = db.Column(db.String(80), index=True)
    lider = db.Column(db.String(120))
    miembros = db.Column(db.Text)             # Texto libre o JSON serializado
    telefono = db.Column(db.String(60))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "nombre": self.nombre,
            "zona": self.zona,
            "lider": self.lider,
            "miembros": self.miembros,
            "telefono": self.telefono,
            "notes": self.notes,
        }
