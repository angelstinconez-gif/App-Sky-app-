"""Cuadrillas / Equipos de trabajo."""
import json
from datetime import datetime

from app import db


class Cuadrilla(db.Model):
    __tablename__ = "cuadrillas"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(120), nullable=False, index=True)
    zona = db.Column(db.String(80), index=True)
    lider = db.Column(db.String(120))                     # texto: nombre del líder (compat)
    lider_id = db.Column(db.Integer)                      # id del técnico líder (sin FK estricta)
    miembros = db.Column(db.Text)                         # JSON: [id1, id2,...] o texto libre
    telefono = db.Column(db.String(60))                   # tel del líder (auto-fill)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def _miembros_parsed(self):
        """Devuelve la lista de IDs de técnicos miembros (si miembros es JSON válido)."""
        if not self.miembros:
            return []
        try:
            data = json.loads(self.miembros)
            if isinstance(data, list):
                return [int(x) for x in data if str(x).lstrip("-").isdigit()]
        except (ValueError, TypeError):
            pass
        return []

    def to_dict(self):
        miembro_ids = self._miembros_parsed()
        miembros_data = []
        try:
            from app.models.tecnico import Tecnico  # evitar import circular
            if miembro_ids:
                for t in Tecnico.query.filter(Tecnico.id.in_(miembro_ids)).all():
                    miembros_data.append({
                        "id": t.id, "nombre": t.nombre, "rol": t.rol, "telefono": t.telefono,
                    })
        except Exception:
            # Si la tabla aún no existe (esquema viejo), devolvemos sólo los IDs
            pass

        return {
            "id": self.id,
            "nombre": self.nombre,
            "zona": self.zona,
            "lider": self.lider,
            "liderId": self.lider_id,
            "miembros": self.miembros,        # crudo (compatible)
            "miembrosIds": miembro_ids,       # lista de IDs
            "miembrosData": miembros_data,    # objetos con nombre/rol
            "telefono": self.telefono,
            "notes": self.notes,
        }
