"""Viáticos asociados a tickets/mantenimientos (gastos de visita)."""
import json
from datetime import datetime

from app import db


# Tarifas estándar (MXN)
TARIFAS = {
    "tecnico": {
        "comida": 170,
        "noche": 2000,
        "coche": 500,
        "camioneta_med": 600,
        "camioneta_gde": 750,
    },
    "administrativo": {
        "comida": 267,
        "noche": 1276,
        "coche": 500,
        "camioneta_med": 600,
        "camioneta_gde": 750,
    },
}


class Viatico(db.Model):
    __tablename__ = "viaticos"

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(20), index=True)         # 't123' o 'M45' (mantto)
    project = db.Column(db.String(200), index=True)
    code = db.Column(db.String(80))
    responsable = db.Column(db.String(160))                  # responsable principal del viático
    responsables_extra = db.Column(db.Text)                  # JSON con IDs/nombres de involucrados
    tipo_persona = db.Column(db.String(20), default="tecnico")  # tecnico | administrativo

    # Comidas (máx 3) y noches
    comidas = db.Column(db.Integer, default=0)
    noches = db.Column(db.Integer, default=0)

    # Vehículo
    tipo_vehiculo = db.Column(db.String(30))                  # coche | camioneta_med | camioneta_gde
    cantidad_vehiculos = db.Column(db.Integer, default=0)
    tag = db.Column(db.String(40), index=True)                # TAG de telepeaje
    placa = db.Column(db.String(40), index=True)              # placa del vehículo

    # Monto (puede ser calculado o manual)
    monto = db.Column(db.Float, default=0.0)
    monto_calculado = db.Column(db.Float, default=0.0)
    moneda = db.Column(db.String(10), default="MXN")
    dias_sitio = db.Column(db.Integer, default=0)

    fecha_salida = db.Column(db.Date, index=True)
    fecha_regreso = db.Column(db.Date)
    estado = db.Column(db.String(40), default="Solicitado", index=True)
    comprobante_url = db.Column(db.String(500))
    notas = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def num_personas(self):
        """Cuenta personas involucradas: responsable principal + extras (mín 1)."""
        n = 1 if self.responsable else 0
        n += len(self._parse_responsables())
        return max(n, 1)  # mínimo una persona

    def calc_monto(self):
        tipo = self.tipo_persona or "tecnico"
        if tipo not in TARIFAS:
            tipo = "tecnico"
        t = TARIFAS[tipo]
        personas = self.num_personas()
        total = 0.0
        # Comidas: cada persona puede consumir hasta `comidas` comidas
        if self.comidas:
            total += min(int(self.comidas), 3) * t["comida"] * personas
        # Noches: cada persona necesita hospedaje
        if self.noches:
            total += int(self.noches) * t["noche"] * personas
        # Vehículos: no se multiplica por personas (es por vehículo)
        if self.tipo_vehiculo and self.cantidad_vehiculos:
            rate = t.get(self.tipo_vehiculo, 0)
            total += int(self.cantidad_vehiculos) * rate
        return round(total, 2)

    def _parse_responsables(self):
        try:
            data = json.loads(self.responsables_extra or "[]")
            return data if isinstance(data, list) else []
        except (ValueError, TypeError):
            return []

    def to_dict(self):
        # Calcular sin mutar el objeto durante la serialización
        calc = self.calc_monto()
        return {
            "id": self.id,
            "ticketId": self.ticket_id,
            "project": self.project,
            "code": self.code,
            "responsable": self.responsable,
            "responsablesExtra": self._parse_responsables(),
            "numPersonas": self.num_personas(),
            "tipoPersona": self.tipo_persona,
            "comidas": self.comidas or 0,
            "noches": self.noches or 0,
            "tipoVehiculo": self.tipo_vehiculo,
            "cantidadVehiculos": self.cantidad_vehiculos or 0,
            "tag": self.tag,
            "placa": self.placa,
            "monto": self.monto or 0,
            "montoCalculado": calc,
            "moneda": self.moneda,
            "diasSitio": self.dias_sitio or 0,
            "fechaSalida": self.fecha_salida.isoformat() if self.fecha_salida else None,
            "fechaRegreso": self.fecha_regreso.isoformat() if self.fecha_regreso else None,
            "estado": self.estado,
            "comprobanteUrl": self.comprobante_url,
            "notas": self.notas,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class PresupuestoViaticos(db.Model):
    """Presupuesto mensual asignado de viáticos (solo admin)."""
    __tablename__ = "presupuesto_viaticos"

    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    month = db.Column(db.Integer, nullable=False, index=True)   # 1..12
    monto = db.Column(db.Float, default=0.0)
    moneda = db.Column(db.String(10), default="MXN")
    notas = db.Column(db.Text)
    created_by = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("year", "month", name="uq_year_month"),)

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "month": self.month,
            "monto": self.monto,
            "moneda": self.moneda,
            "notas": self.notas,
            "createdBy": self.created_by,
        }
