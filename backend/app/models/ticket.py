"""Tickets de servicio."""
from datetime import datetime

from app import db


class Ticket(db.Model):
    __tablename__ = "tickets"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    site = db.Column(db.String(200), index=True)
    client = db.Column(db.String(120))
    project_code = db.Column(db.String(80))
    priority = db.Column(db.String(20), index=True)
    status = db.Column(db.String(40), index=True, default="Abierto")  # Abierto, En proceso, Cerrado
    assigned_to = db.Column(db.String(120))
    open_date = db.Column(db.Date)
    due_date = db.Column(db.Date)
    close_date = db.Column(db.Date)
    description = db.Column(db.Text)
    result = db.Column(db.Text)
    closed_by = db.Column(db.String(120))
    closed_by_email = db.Column(db.String(180))
    incidencia_id = db.Column(db.Integer, db.ForeignKey("incidencias.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    incidencia = db.relationship("Incidencia", backref=db.backref("tickets", lazy=True))

    def days_open(self):
        if not self.open_date:
            return None
        end = self.close_date or datetime.utcnow().date()
        return (end - self.open_date).days

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "site": self.site,
            "client": self.client,
            "projectCode": self.project_code,
            "priority": self.priority,
            "status": self.status,
            "assignedTo": self.assigned_to,
            "openDate": self.open_date.isoformat() if self.open_date else None,
            "dueDate": self.due_date.isoformat() if self.due_date else None,
            "closeDate": self.close_date.isoformat() if self.close_date else None,
            "description": self.description,
            "result": self.result,
            "closedBy": self.closed_by,
            "incidenciaId": self.incidencia_id,
            "days": self.days_open(),
        }
