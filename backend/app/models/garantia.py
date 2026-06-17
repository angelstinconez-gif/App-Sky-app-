"""Garantías de equipos."""
from datetime import datetime

from app import db


class Garantia(db.Model):
    __tablename__ = "garantias"

    id = db.Column(db.Integer, primary_key=True)
    project = db.Column(db.String(200), index=True)
    code = db.Column(db.String(80))
    equipment = db.Column(db.String(120))
    brand = db.Column(db.String(60))
    model = db.Column(db.String(80))
    sn = db.Column(db.String(80))
    error = db.Column(db.String(200))
    supplier = db.Column(db.String(120))
    contact = db.Column(db.String(200))
    ticket = db.Column(db.String(80))
    status = db.Column(db.String(80), index=True)
    upload_date = db.Column(db.Date)
    abierto_por = db.Column(db.String(160))                 # persona que abrió el ticket con el proveedor
    abierto_por_email = db.Column(db.String(180))
    creado_por = db.Column(db.String(160))                  # usuario que SUBIÓ el registro a SkySense
    creado_por_email = db.Column(db.String(180))
    comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def days_open(self):
        """Días desde upload_date (o created_at si no hay) hasta hoy o hasta cierre."""
        start = self.upload_date or (self.created_at.date() if self.created_at else None)
        if not start:
            return None
        # Si el status indica cierre, usar la última actualización como fin
        is_closed = (self.status or "").lower() in ("cerrada", "rechazada", "aprobada")
        end = (self.updated_at.date() if (is_closed and self.updated_at) else datetime.utcnow().date())
        return (end - start).days

    def to_dict(self):
        return {
            "id": self.id,
            "project": self.project,
            "code": self.code,
            "equipment": self.equipment,
            "brand": self.brand,
            "model": self.model,
            "sn": self.sn,
            "error": self.error,
            "supplier": self.supplier,
            "contact": self.contact,
            "ticket": self.ticket,
            "status": self.status,
            "uploadDate": self.upload_date.isoformat() if self.upload_date else None,
            "abiertoPor": self.abierto_por,
            "abiertoPorEmail": self.abierto_por_email,
            "creadoPor": self.creado_por,
            "creadoPorEmail": self.creado_por_email,
            "comments": self.comments,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "days": self.days_open(),
        }
