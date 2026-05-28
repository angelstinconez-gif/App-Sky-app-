"""Análisis de plantas PV: potencia, energía garantizada mensual y cumplimiento."""
import json
from datetime import datetime

from app import db

MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']


class AnalisisPlanta(db.Model):
    __tablename__ = "analisis_plantas"

    id = db.Column(db.Integer, primary_key=True)
    project = db.Column(db.String(200), nullable=False, unique=True, index=True)
    potencia_kwp = db.Column(db.Float)
    generado_kwh = db.Column(db.Float)          # generado total/último periodo
    # 12 meses garantizado (kWh)
    garantizado = db.Column(db.Text)            # JSON: {"enero": 123.4, ...}
    generado_mes = db.Column(db.Text)           # JSON: {"enero": 100, ...} opcional
    cumple_mayo = db.Column(db.String(10))
    proveedor = db.Column(db.String(120))
    seguimiento = db.Column(db.Text)
    fallas = db.Column(db.Text)
    responsable = db.Column(db.String(120))
    propuesta = db.Column(db.Text)
    marca_inversor = db.Column(db.String(80))
    num_inversores = db.Column(db.Integer)
    notas = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def _parse(self, attr):
        try:
            return json.loads(getattr(self, attr) or "{}")
        except (ValueError, TypeError):
            return {}

    def garantizado_mes(self, mes):
        return self._parse("garantizado").get(mes.lower())

    def to_dict(self):
        gar = self._parse("garantizado")
        gen = self._parse("generado_mes")
        # Cumplimiento del mes actual
        from datetime import datetime
        mes_actual = MONTHS[datetime.utcnow().month - 1]
        gar_mes = gar.get(mes_actual)
        gen_mes = gen.get(mes_actual)
        cumple = None
        pct = None
        if gar_mes and gen_mes is not None:
            pct = round((gen_mes / gar_mes) * 100, 1) if gar_mes > 0 else 0
            cumple = "Si" if pct >= 100 else "No"
        return {
            "id": self.id,
            "project": self.project,
            "potenciaKwp": self.potencia_kwp,
            "generadoKwh": self.generado_kwh,
            "garantizado": gar,
            "generadoMes": gen,
            "garantizadoMesActual": gar_mes,
            "generadoMesActual": gen_mes,
            "porcentajeMesActual": pct,
            "cumpleMesActual": cumple,
            "cumpleMayo": self.cumple_mayo,
            "proveedor": self.proveedor,
            "seguimiento": self.seguimiento,
            "fallas": self.fallas,
            "responsable": self.responsable,
            "propuesta": self.propuesta,
            "marcaInversor": self.marca_inversor,
            "numInversores": self.num_inversores,
            "notas": self.notas,
            "mesActual": mes_actual,
        }
