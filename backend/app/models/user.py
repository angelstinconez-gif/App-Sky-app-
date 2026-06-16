"""Usuario del sistema con autenticación."""
from datetime import datetime

import bcrypt

from app import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(180), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    initials = db.Column(db.String(4))
    role = db.Column(db.String(20), nullable=False, default="operator")
    active = db.Column(db.Boolean, default=True, nullable=False)
    ai_enabled = db.Column(db.Boolean, default=False, nullable=False)
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def can_use_ai(self):
        """Admin siempre tiene acceso; otros solo si ai_enabled=True."""
        return (self.role or "").lower() == "admin" or bool(self.ai_enabled)

    def set_password(self, password: str):
        self.password_hash = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    def check_password(self, password: str) -> bool:
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"), self.password_hash.encode("utf-8")
            )
        except Exception:
            return False

    def to_dict(self, include_email=True):
        d = {
            "id": self.id,
            "name": self.name,
            "initials": self.initials or "".join([w[0] for w in (self.name or "").split()[:2]]).upper(),
            "role": self.role,
            "active": self.active,
            "aiEnabled": bool(self.ai_enabled),
            "canUseAi": self.can_use_ai,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_email:
            d["email"] = self.email
        return d
