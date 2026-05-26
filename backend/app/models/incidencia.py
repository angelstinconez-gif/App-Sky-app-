"""Incidencias del sistema PV."""
from datetime import datetime

from app import db


class Incidencia(db.Model):
    __tablename__ = "incidencias"

    id = db.Column(db.Integer, primary_key=True)
    platform = db.Column(db.String(60), index=True)
    num = db.Column(db.Integer)
    site = db.Column(db.String(200), nullable=False, index=True)
    client = db.Column(db.String(120), index=True)
    code = db.Column(db.String(80), index=True)
    priority = db.Column(db.String(20), index=True)
    notes = db.Column(db.Text)
    inc_date = db.Column(db.Date, index=True)
    err_code = db.Column(db.String(20))
    classification = db.Column(db.String(60))
    equipment = db.Column(db.String(120))
    problem = db.Column(db.String(120))
    cause = db.Column(db.Text)
    solution = db.Column(db.Text)
    ticket_alta = db.Column(db.String(10))
    ticket_date = db.Column(db.Date)
    responsible = db.Column(db.String(120))
    comments = db.Column(db.Text)
    last_mod = db.Column(db.Date)
    status = db.Column(db.String(20), default="abierta", index=True)
    closed_at = db.Column(db.DateTime)
    closed_by = db.Column(db.String(120))
    closed_by_email = db.Column(db.String(180))
    close_result = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def days_open(self):
        if not self.inc_date:
            return None
        end = self.closed_at.date() if self.closed_at else datetime.utcnow().date()
        return (end - self.inc_date).days

    def to_dict(self):
        return {
            "id": self.id,
            "platform": self.platform,
            "num": self.num,
            "site": self.site,
            "client": self.client,
            "code": self.code,
            "priority": self.priority,
            "notes": self.notes,
            "incDate": self.inc_date.isoformat() if self.inc_date else None,
            "errCode": self.err_code,
            "classification": self.classification,
            "equipment": self.equipment,
            "problem": self.problem,
            "cause": self.cause,
            "solution": self.solution,
            "ticketAlta": self.ticket_alta,
            "ticketDate": self.ticket_date.isoformat() if self.ticket_date else None,
            "responsible": self.responsible,
            "comments": self.comments,
            "lastMod": self.last_mod.isoformat() if self.last_mod else None,
            "status": self.status,
            "closedAt": self.closed_at.isoformat() if self.closed_at else None,
            "closedBy": self.closed_by,
            "closeResult": self.close_result,
            "days": self.days_open(),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
