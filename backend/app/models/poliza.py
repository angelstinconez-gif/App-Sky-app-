"""Pólizas de mantenimiento."""
from datetime import datetime, date

from app import db


class Poliza(db.Model):
    __tablename__ = "polizas"

    id = db.Column(db.Integer, primary_key=True)
    item = db.Column(db.Integer)
    grupo = db.Column(db.String(120), index=True)
    code = db.Column(db.String(80), unique=True, index=True)
    project = db.Column(db.String(200), nullable=False, index=True)
    tarifa = db.Column(db.String(40))
    platform = db.Column(db.String(60))
    panels = db.Column(db.String(20))
    inv = db.Column(db.String(20))
    sys_start = db.Column(db.Date)
    pol_start = db.Column(db.Date)
    pol_end = db.Column(db.Date)
    status = db.Column(db.String(40), index=True)   # Vigente / Vencida
    poliza = db.Column(db.String(120))              # Tipo de sistema: PV, BESS, Híbrido
    cobertura = db.Column(db.String(30), index=True)  # Tipo de Póliza: Completo / Eléctrico / Mantenimiento / Operación
    monitoreo = db.Column(db.Boolean, default=False, index=True)  # Si tiene Monitoreo activo (aparece en Revisión SFV)
    zona = db.Column(db.String(80), index=True)
    cuadrilla = db.Column(db.String(80))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def tiene_operacion(self):
        """True si la cobertura incluye Operación (Completo o Operación)."""
        c = (self.cobertura or "").strip().lower()
        return c in ("completo", "operación", "operacion")

    def computed_status(self):
        """Recalcula vigente/vencida según pol_end vs hoy."""
        if not self.pol_end:
            return self.status or ""
        return "Vigente" if self.pol_end >= date.today() else "Vencida"

    def to_dict(self):
        return {
            "id": self.id,
            "item": self.item,
            "grupo": self.grupo,
            "code": self.code,
            "project": self.project,
            "tarifa": self.tarifa,
            "platform": self.platform,
            "panels": self.panels,
            "inv": self.inv,
            "sysStart": self.sys_start.isoformat() if self.sys_start else None,
            "polStart": self.pol_start.isoformat() if self.pol_start else None,
            "polEnd": self.pol_end.isoformat() if self.pol_end else None,
            "status": self.computed_status(),
            "poliza": self.poliza,
            "cobertura": self.cobertura,
            "monitoreo": bool(self.monitoreo),
            "tieneOperacion": self.tiene_operacion,
            "zona": self.zona,
            "cuadrilla": self.cuadrilla,
        }
