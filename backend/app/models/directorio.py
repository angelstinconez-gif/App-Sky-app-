"""Directorio de contactos."""
from datetime import datetime

from app import db


class Directorio(db.Model):
    __tablename__ = "directorio"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False, index=True)
    role = db.Column(db.String(120))
    company = db.Column(db.String(160), index=True)
    email = db.Column(db.String(180))
    phone = db.Column(db.String(60))
    category = db.Column(db.String(80), index=True)  # Cliente, Proveedor, Técnico, etc.
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "company": self.company,
            "email": self.email,
            "phone": self.phone,
            "category": self.category,
            "notes": self.notes,
        }
