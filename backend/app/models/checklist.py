"""Checklist post-venta C&I llenado en sitio durante visitas de revisión."""
import json
from datetime import datetime

from app import db


class Checklist(db.Model):
    __tablename__ = "checklists"

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, index=True)             # ticket relacionado (sin FK estricta)
    project = db.Column(db.String(200), index=True)
    code = db.Column(db.String(80))

    # ── Información general ──
    cliente = db.Column(db.String(200))
    distribuidor = db.Column(db.String(120))
    pais = db.Column(db.String(60), default="México")
    modelo = db.Column(db.String(120))
    sn_inversor = db.Column(db.String(120))
    sn_logger = db.Column(db.String(120))
    capacidad_kw = db.Column(db.Float)
    datos_panel = db.Column(db.Text)
    config_panel = db.Column(db.Text)
    alarmas = db.Column(db.Text)
    descripcion_falla = db.Column(db.Text)

    # ── Mediciones (JSON con la matriz MPPT 1-10 × String 1-2) ──
    mediciones_dc = db.Column(db.Text)           # JSON: {"voc": {...}, "isc": {...}, "pe": {...}}
    mediciones_ac = db.Column(db.Text)           # JSON: {"L1-L2": "230", ...}
    frecuencia_hz = db.Column(db.String(20))

    # ── Inversor ──
    continuidad_check = db.Column(db.String(10))  # SI/NO
    continuidad_serie = db.Column(db.String(60))

    # ── Evidencias ──
    fotos = db.Column(db.Text)                    # JSON: [{"tipo": "placa", "url": "..."}]
    videos = db.Column(db.Text)                   # JSON: [{"url": "..."}]

    # ── Resultado ──
    resultado = db.Column(db.String(40), default="En proceso")  # En proceso, OK, Requiere intervención
    observaciones = db.Column(db.Text)
    tecnico = db.Column(db.String(160))
    fecha_visita = db.Column(db.Date, default=lambda: datetime.utcnow().date())
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def _json(self, attr):
        try:
            return json.loads(getattr(self, attr) or "{}")
        except (ValueError, TypeError):
            return {}

    def to_dict(self):
        return {
            "id": self.id,
            "ticketId": self.ticket_id,
            "project": self.project,
            "code": self.code,
            "cliente": self.cliente,
            "distribuidor": self.distribuidor,
            "pais": self.pais,
            "modelo": self.modelo,
            "snInversor": self.sn_inversor,
            "snLogger": self.sn_logger,
            "capacidadKw": self.capacidad_kw,
            "datosPanel": self.datos_panel,
            "configPanel": self.config_panel,
            "alarmas": self.alarmas,
            "descripcionFalla": self.descripcion_falla,
            "medicionesDc": self._json("mediciones_dc"),
            "medicionesAc": self._json("mediciones_ac"),
            "frecuenciaHz": self.frecuencia_hz,
            "continuidadCheck": self.continuidad_check,
            "continuidadSerie": self.continuidad_serie,
            "fotos": self._json("fotos"),
            "videos": self._json("videos"),
            "resultado": self.resultado,
            "observaciones": self.observaciones,
            "tecnico": self.tecnico,
            "fechaVisita": self.fecha_visita.isoformat() if self.fecha_visita else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
