"""Registros de mantenimiento."""
import json
from datetime import datetime

from app import db


class Mantenimiento(db.Model):
    __tablename__ = "mantenimientos"

    id = db.Column(db.Integer, primary_key=True)
    project = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(80))
    tipo = db.Column(db.String(60))                # Preventivo, Correctivo, Limpieza
    fecha_programada = db.Column(db.Date, index=True)
    fecha_ejecutada = db.Column(db.Date)           # (compat) — equivale a fecha_fin_ejecucion
    fecha_inicio_ejecucion = db.Column(db.Date)    # cuando arrancó la ejecución real
    fecha_fin_ejecucion = db.Column(db.Date)       # cuando terminó la ejecución
    estado = db.Column(db.String(40), default="Programado", index=True)  # Programado, En curso, Completado
    cuadrilla = db.Column(db.String(80))           # nombre de la cuadrilla (compat)
    cuadrilla_id = db.Column(db.Integer, index=True)    # id de la cuadrilla (nueva)
    responsable = db.Column(db.String(120))
    tecnicos_ids = db.Column(db.Text)              # JSON: [id1, id2,...]
    descripcion = db.Column(db.Text)
    resultados = db.Column(db.Text)
    duracion_horas = db.Column(db.Float)            # duración estimada/real en horas
    requiere_viaticos = db.Column(db.Boolean, default=False)
    viatico_id = db.Column(db.Integer)              # id del viático auto-creado (si requiere)
    poliza_id = db.Column(db.Integer, db.ForeignKey("polizas.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    poliza = db.relationship("Poliza", backref=db.backref("mantenimientos", lazy=True))

    def _tecnicos_parsed(self):
        if not self.tecnicos_ids:
            return []
        try:
            data = json.loads(self.tecnicos_ids)
            if isinstance(data, list):
                return [int(x) for x in data if str(x).lstrip("-").isdigit()]
        except (ValueError, TypeError):
            pass
        return []

    def dias_en_ejecucion(self):
        """Días que lleva en ejecución.

        - Si tiene inicio Y fin: días de duración total (fin - inicio).
        - Si tiene solo inicio: días que LLEVA en ejecución (hoy - inicio).
        - Si no tiene inicio: None.
        """
        ini = self.fecha_inicio_ejecucion
        if not ini:
            return None
        fin = self.fecha_fin_ejecucion or self.fecha_ejecutada
        if fin:
            return max(0, (fin - ini).days)
        # En curso → días desde inicio hasta hoy
        return max(0, (datetime.utcnow().date() - ini).days)

    def en_curso(self):
        return bool(self.fecha_inicio_ejecucion and not (self.fecha_fin_ejecucion or self.fecha_ejecutada))

    def to_dict(self):
        ids = self._tecnicos_parsed()
        nombres = []
        try:
            if ids:
                from app.models.tecnico import Tecnico
                for t in Tecnico.query.filter(Tecnico.id.in_(ids)).all():
                    nombres.append({"id": t.id, "nombre": t.nombre, "telefono": t.telefono, "rol": t.rol})
        except Exception:
            pass
        return {
            "id": self.id,
            "project": self.project,
            "code": self.code,
            "tipo": self.tipo,
            "fechaProgramada": self.fecha_programada.isoformat() if self.fecha_programada else None,
            "fechaEjecutada": self.fecha_ejecutada.isoformat() if self.fecha_ejecutada else None,
            "fechaInicioEjecucion": self.fecha_inicio_ejecucion.isoformat() if self.fecha_inicio_ejecucion else None,
            "fechaFinEjecucion": self.fecha_fin_ejecucion.isoformat() if self.fecha_fin_ejecucion else None,
            "diasEnEjecucion": self.dias_en_ejecucion(),
            "enCurso": self.en_curso(),
            "estado": self.estado,
            "cuadrilla": self.cuadrilla,
            "cuadrillaId": self.cuadrilla_id,
            "responsable": self.responsable,
            "tecnicosIds": ids,
            "tecnicosData": nombres,
            "descripcion": self.descripcion,
            "resultados": self.resultados,
            "duracionHoras": self.duracion_horas,
            "requiereViaticos": bool(self.requiere_viaticos),
            "viaticoId": self.viatico_id,
            "polizaId": self.poliza_id,
        }
