"""Directorio de contactos por proyecto."""
from datetime import datetime

from app import db


class Directorio(db.Model):
    __tablename__ = "directorio"

    id = db.Column(db.Integer, primary_key=True)

    # Identificación del proyecto (vincula con Polizas.code)
    project = db.Column(db.String(200), nullable=False, index=True)
    project_code = db.Column(db.String(80), index=True)
    system_type = db.Column(db.String(40))                # PV, BESS, Híbrido

    # Contacto de mantenimiento en sitio (principal)
    maint_contact = db.Column(db.String(160))
    maint_phone = db.Column(db.String(60))

    # Contacto de mantenimiento alterno
    maint_contact_2 = db.Column(db.String(160))
    maint_phone_2 = db.Column(db.String(60))
    maint_email = db.Column(db.String(180))

    # Contacto interno PM (Project Manager)
    internal_pm = db.Column(db.String(160))
    internal_phone = db.Column(db.String(60))

    # Datos del cliente / empresa
    client_name = db.Column(db.String(160))
    client_company = db.Column(db.String(160), index=True)
    client_phone = db.Column(db.String(60))
    client_email = db.Column(db.String(180))

    # Compatibilidad / categorización
    category = db.Column(db.String(80), index=True)       # Cliente, Proveedor, Técnico, Interno
    notes = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        # Mantiene compatibilidad con el frontend: name/role/company/email/phone
        primary_name = self.maint_contact or self.client_name or self.internal_pm or self.project
        primary_phone = self.maint_phone or self.client_phone or self.internal_phone
        primary_email = self.maint_email or self.client_email
        return {
            "id": self.id,
            "name": primary_name,
            "project": self.project,
            "projectCode": self.project_code,
            "systemType": self.system_type,
            "company": self.client_company or self.client_name,
            "role": self.category or "Mantenimiento",
            "email": primary_email,
            "phone": primary_phone,
            "maintContact": self.maint_contact,
            "maintPhone": self.maint_phone,
            "maintContact2": self.maint_contact_2,
            "maintPhone2": self.maint_phone_2,
            "maintEmail": self.maint_email,
            "internalPm": self.internal_pm,
            "internalPhone": self.internal_phone,
            "clientName": self.client_name,
            "clientCompany": self.client_company,
            "clientPhone": self.client_phone,
            "clientEmail": self.client_email,
            "category": self.category,
            "notes": self.notes,
        }
