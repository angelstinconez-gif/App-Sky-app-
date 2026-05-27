"""Viáticos asociados a tickets (gastos de visita)."""
from datetime import datetime

from app import db


class Viatico(db.Model):
    __tablename__ = "viaticos"

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(20), index=True)      # 't123' o 'M45' (mantenimiento)
    project = db.Column(db.String(200), index=True)
    code = db.Column(db.String(80))
    responsable = db.Column(db.String(160))
    monto = db.Column(db.Float, default=0.0)
    moneda = db.Column(db.String(10), default="MXN")
    tag_carro = db.Column(db.String(40), index=True)      # placa o TAG del vehículo
    dias_sitio = db.Column(db.Integer, default=0)
    fecha_salida = db.Column(db.Date, index=True)
    fecha_regreso = db.Column(db.Date)
    estado = db.Column(db.String(40), default="Solicitado", index=True)  # Solicitado, Aprobado, Comprobado, Rechazado
    comprobante_url = db.Column(db.String(500))
    notas = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "ticketId": self.ticket_id,
            "project": self.project,
            "code": self.code,
            "responsable": self.responsable,
            "monto": self.monto,
            "moneda": self.moneda,
            "tagCarro": self.tag_carro,
            "diasSitio": self.dias_sitio,
            "fechaSalida": self.fecha_salida.isoformat() if self.fecha_salida else None,
            "fechaRegreso": self.fecha_regreso.isoformat() if self.fecha_regreso else None,
            "estado": self.estado,
            "comprobanteUrl": self.comprobante_url,
            "notas": self.notas,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
