"""Revisión semanal de plantas SFV activas (PV en garantía)."""
from datetime import datetime

from app import db


# Estados de la revisión semanal
ESTADOS_REVISION = ["OK", "Sin comunicación", "Falla", "Falta de datos"]


class RevisionSemanal(db.Model):
    __tablename__ = "revisiones_semanales"

    id = db.Column(db.Integer, primary_key=True)
    # Planta evaluada
    project = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(80), index=True)
    poliza_id = db.Column(db.Integer, index=True)

    # Periodo (semana ISO)
    year = db.Column(db.Integer, nullable=False, index=True)
    week = db.Column(db.Integer, nullable=False, index=True)

    # Estado de la revisión
    estado = db.Column(db.String(40), nullable=False, default="OK", index=True)
    observaciones = db.Column(db.Text)

    # Quien revisó
    revisado_por = db.Column(db.String(160))
    revisado_por_email = db.Column(db.String(180))
    fecha_revision = db.Column(db.Date, default=lambda: datetime.utcnow().date())

    # Incidencia generada si aplica
    incidencia_id = db.Column(db.Integer, index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("project", "year", "week", name="uq_proj_year_week"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "project": self.project,
            "code": self.code,
            "polizaId": self.poliza_id,
            "year": self.year,
            "week": self.week,
            "estado": self.estado,
            "observaciones": self.observaciones,
            "revisadoPor": self.revisado_por,
            "revisadoPorEmail": self.revisado_por_email,
            "fechaRevision": self.fecha_revision.isoformat() if self.fecha_revision else None,
            "incidenciaId": self.incidencia_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
