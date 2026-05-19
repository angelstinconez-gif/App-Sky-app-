"""Catálogo de errores por fabricante (HUAWEI, SUNGROW, SOLIS, SMA, etc.)."""
from datetime import datetime

from app import db


class ErrorCatalog(db.Model):
    __tablename__ = "errores_catalogo"
    __table_args__ = (
        db.UniqueConstraint("brand", "code", name="uq_brand_code"),
    )

    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(40), nullable=False, index=True)     # HUAWEI, SUNGROW, etc.
    code = db.Column(db.String(20), nullable=False, index=True)
    equipment = db.Column(db.String(120))                            # Inversor SUN2000, etc.
    classification = db.Column(db.String(60))                        # STRING, INVERSOR, etc.
    tipo = db.Column(db.String(60))                                  # DC, AC/Red, Arco, etc.
    problem = db.Column(db.String(200))
    cause = db.Column(db.Text)
    solution = db.Column(db.Text)
    impact = db.Column(db.Text)
    source_url = db.Column(db.String(500))
    priority = db.Column(db.String(20))                              # Critico, Alta, Intermedia, Baja
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def clave(self):
        return f"{self.brand}|{self.code}"

    def to_dict(self):
        return {
            "id": self.id,
            "clave": self.clave,
            "brand": self.brand,
            "code": self.code,
            "equipment": self.equipment,
            "classification": self.classification,
            "tipo": self.tipo,
            "problem": self.problem,
            "cause": self.cause,
            "solution": self.solution,
            "impact": self.impact,
            "sourceUrl": self.source_url,
            "priority": self.priority,
        }
