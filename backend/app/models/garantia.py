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
    comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
            "comments": self.comments,
        }
