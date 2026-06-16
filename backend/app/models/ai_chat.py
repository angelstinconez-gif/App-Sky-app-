"""Conversaciones del asistente IA con cada usuario."""
import json
from datetime import datetime

from app import db


class AIConversation(db.Model):
    __tablename__ = "ai_conversations"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, index=True)
    user_email = db.Column(db.String(180), index=True)
    user_role = db.Column(db.String(40))
    messages = db.Column(db.Text)               # JSON: [{role, content, tool_calls?}]
    tool_calls_log = db.Column(db.Text)         # JSON: bitácora de tools ejecutadas
    title = db.Column(db.String(200))           # auto-generado del primer mensaje
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def messages_list(self):
        try:
            return json.loads(self.messages or "[]")
        except (ValueError, TypeError):
            return []

    def tool_log_list(self):
        try:
            return json.loads(self.tool_calls_log or "[]")
        except (ValueError, TypeError):
            return []

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "userEmail": self.user_email,
            "userRole": self.user_role,
            "title": self.title,
            "messages": self.messages_list(),
            "toolLog": self.tool_log_list(),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
