"""Registros de mantenimiento."""
from datetime import datetime

from app import db


class Mantenimiento(db.Model):
    __tablename__ = "mantenimientos"

    id = db.Column(db.Integer, primary_key=True)
    project = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(80))
    tipo = db.Column(db.String(60))                # Preventivo, Correctivo, Limpieza
    fecha_programada = db.Column(db.Date, index=True)
    fecha_ejecutada = db.Column(db.Date)
    estado = db.Column(db.String(40), default="Programado", index=True)  # Programado, En curso, Completado
    cuadrilla = db.Column(db.String(80))
    responsable = db.Column(db.String(120))
    descripcion = db.Column(db.Text)
    resultados = db.Column(db.Text)
    poliza_id = db.Column(db.Integer, db.ForeignKey("polizas.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    poliza = db.relationship("Poliza", backref=db.backref("mantenimientos", lazy=True))

    def to_dict(self):
        return {
            "id": self.id,
            "project": self.project,
            "code": self.code,
            "tipo": self.tipo,
            "fechaProgramada": self.fecha_programada.isoformat() if self.fecha_programada else None,
            "fechaEjecutada": self.fecha_ejecutada.isoformat() if self.fecha_ejecutada else None,
            "estado": self.estado,
            "cuadrilla": self.cuadrilla,
            "responsable": self.responsable,
            "descripcion": self.descripcion,
            "resultados": self.resultados,
            "polizaId": self.poliza_id,
        }
