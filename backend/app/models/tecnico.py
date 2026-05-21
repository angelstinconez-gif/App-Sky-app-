"""Directorio de técnicos asignables a cuadrillas y tickets."""
from datetime import datetime

from app import db


class Tecnico(db.Model):
    __tablename__ = "tecnicos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(160), nullable=False, index=True)
    telefono = db.Column(db.String(60))
    email = db.Column(db.String(180))
    rol = db.Column(db.String(60), index=True)          # Líder, Técnico, Auxiliar, Electricista...
    cuadrilla_id = db.Column(db.Integer, db.ForeignKey("cuadrillas.id", ondelete="SET NULL"), index=True)
    zona = db.Column(db.String(80), index=True)
    notas = db.Column(db.Text)
    activo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cuadrilla = db.relationship("Cuadrilla", backref=db.backref("tecnicos", lazy=True))

    def to_dict(self):
        return {
            "id": self.id,
            "nombre": self.nombre,
            "telefono": self.telefono,
            "email": self.email,
            "rol": self.rol,
            "cuadrillaId": self.cuadrilla_id,
            "cuadrillaNombre": self.cuadrilla.nombre if self.cuadrilla else None,
            "zona": self.zona,
            "notas": self.notas,
            "activo": self.activo,
        }
