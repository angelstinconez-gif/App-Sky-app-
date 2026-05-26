"""Lecciones aprendidas — soluciones registradas al cerrar incidencias."""
from datetime import datetime

from app import db


class Leccion(db.Model):
    __tablename__ = "lecciones"

    id = db.Column(db.Integer, primary_key=True)
    incidencia_id = db.Column(db.Integer, index=True)        # incidencia origen (si vino de cierre)
    ticket_id = db.Column(db.Integer, index=True)            # ticket origen (si vino de cierre)
    project = db.Column(db.String(200), index=True)
    platform = db.Column(db.String(60), index=True)
    err_code = db.Column(db.String(40), index=True)
    classification = db.Column(db.String(60), index=True)
    equipment = db.Column(db.String(120))
    problem = db.Column(db.String(300))
    cause = db.Column(db.Text)
    solution = db.Column(db.Text, nullable=False)
    recommendation = db.Column(db.Text)
    tags = db.Column(db.String(300))                          # tags separados por coma
    autor = db.Column(db.String(160))
    autor_email = db.Column(db.String(180))
    rating = db.Column(db.Integer)                            # 1-5 utilidad
    source = db.Column(db.String(40), default="incidencia")   # incidencia | ticket | manual
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "incidenciaId": self.incidencia_id,
            "ticketId": self.ticket_id,
            "project": self.project,
            "platform": self.platform,
            "errCode": self.err_code,
            "classification": self.classification,
            "equipment": self.equipment,
            "problem": self.problem,
            "cause": self.cause,
            "solution": self.solution,
            "recommendation": self.recommendation,
            "tags": self.tags,
            "autor": self.autor,
            "rating": self.rating,
            "source": self.source,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
