"""Revisión diaria de plantas SFV activas (PV en garantía).

Nombre histórico (revision_semanal) por compatibilidad con tablas ya creadas;
la lógica actual maneja revisiones por DÍA (no semana).
"""
from datetime import datetime

from app import db


# Estados de la revisión
ESTADOS_REVISION = ["OK", "Sin comunicación", "Falla", "Falta de datos"]


class RevisionSemanal(db.Model):
    __tablename__ = "revisiones_semanales"

    id = db.Column(db.Integer, primary_key=True)
    # Planta evaluada
    project = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(80), index=True)
    poliza_id = db.Column(db.Integer, index=True)

    # Periodo: DÍA y (legado) semana ISO
    fecha = db.Column(db.Date, index=True)         # día de la revisión (nuevo, prioritario)
    year = db.Column(db.Integer, index=True)       # año ISO (compat / legado)
    week = db.Column(db.Integer, index=True)       # semana ISO (compat / legado)

    # Estado
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

    # No usamos UniqueConstraint en (project, fecha) porque registros viejos pueden
    # tener fecha=NULL. Hacemos la unicidad lógicamente en código.

    def to_dict(self):
        # Día efectivo: prioriza `fecha`, si no, deriva de year/week (lunes ISO) como compat
        from datetime import date as _date, timedelta
        dia = self.fecha
        if not dia and self.year and self.week:
            try:
                # Lunes ISO de esa semana
                jan4 = _date(self.year, 1, 4)
                jan4_weekday = jan4.isoweekday()
                week1_monday = jan4 - timedelta(days=jan4_weekday - 1)
                dia = week1_monday + timedelta(weeks=self.week - 1)
            except Exception:
                dia = None
        return {
            "id": self.id,
            "project": self.project,
            "code": self.code,
            "polizaId": self.poliza_id,
            "fecha": dia.isoformat() if dia else None,
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
