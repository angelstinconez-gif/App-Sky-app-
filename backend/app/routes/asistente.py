"""Endpoints del Asistente IA conversacional.

Provider por defecto: Google Gemini (gemini-2.5-flash, free tier).
Se puede cambiar via env: AI_PROVIDER=gemini|openai|anthropic + AI_API_KEY.
"""
import json
import os
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db
from app.models.user import User
from app.models.ai_chat import AIConversation
from app.utils.decorators import role_required
from app.utils.ai_tools import (
    TOOLS_REGISTRY, TOOLS_SCHEMA_GEMINI, ejecutar_tool, PERMISOS,
)

bp = Blueprint("asistente", __name__)


SYSTEM_PROMPT = """Eres "SkyBot", el asistente de SKY SENSE, una app de monitoreo de plantas fotovoltaicas y BESS.

Reglas IMPORTANTES:
1. Eres un asistente PROFESIONAL pero cálido. Respondes en español.
2. Tienes acceso a TOOLS para consultar y modificar la base de datos. ÚSALAS siempre que la pregunta lo requiera; no inventes datos.
3. Antes de ejecutar una tool de ESCRITURA (crear/cerrar/registrar), CONFIRMA con el usuario los datos exactos.
4. Después de ejecutar tools, RESUME los resultados en español natural; no muestres el JSON crudo a menos que el usuario lo pida.
5. Si una tool te devuelve un error de permisos, dile al usuario que su rol no tiene esa capacidad.
6. Si el usuario pide algo que ninguna tool puede hacer, dilo claramente.
7. Sé conciso. Usa listas o tablas markdown cuando ayuden.

Datos del usuario actual: {user_info}
Fecha de hoy: {today}
"""


def _provider():
    return (os.environ.get("AI_PROVIDER") or "gemini").lower()


def _api_key():
    # Strip whitespace/newlines — Render a veces los inyecta al pegar
    raw = (
        os.environ.get("AI_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("XAI_API_KEY")
        or os.environ.get("GROK_API_KEY")
        or ""
    )
    return raw.strip().strip('"').strip("'")


def _model_name():
    default = {
        "gemini": "gemini-2.5-flash",
        "grok": "grok-3-mini",
        "openai": "gpt-4o-mini",
        "anthropic": "claude-3-5-haiku-20241022",
    }.get(_provider(), "gemini-2.5-flash")
    return os.environ.get("AI_MODEL") or default


# ── Conversión de schema OpenAI → Gemini ────────────────────────────

def _build_gemini_tools():
    return [{"function_declarations": TOOLS_SCHEMA_GEMINI}]


def _gemini_call(messages, system_prompt):
    """Llama a Gemini con function calling.

    messages: lista en formato interno [{role, content, tool_calls?, tool_response?}]
    Devuelve: {text, tool_calls: [{name, args}]} o {error}
    """
    try:
        import requests
    except ImportError:
        return {"error": "Falta 'requests'. Instala con: pip install requests"}

    key = _api_key()
    if not key:
        return {
            "error": "Falta AI_API_KEY. Configura tu API Key de Gemini en variables de entorno. "
            "Obtén una gratis en https://aistudio.google.com/apikey"
        }

    # Convertir mensajes internos al formato Gemini
    contents = []
    for m in messages:
        if m["role"] == "user":
            contents.append({"role": "user", "parts": [{"text": m["content"]}]})
        elif m["role"] == "assistant":
            parts = []
            if m.get("content"):
                parts.append({"text": m["content"]})
            for tc in (m.get("tool_calls") or []):
                parts.append({"functionCall": {"name": tc["name"], "args": tc.get("args") or {}}})
            if parts:
                contents.append({"role": "model", "parts": parts})
        elif m["role"] == "tool":
            contents.append({"role": "user", "parts": [{
                "functionResponse": {
                    "name": m["name"],
                    "response": {"result": m["content"]},
                },
            }]})

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "tools": _build_gemini_tools(),
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1500,
        },
    }

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{_model_name()}:generateContent?key={key}"
    )
    try:
        r = requests.post(url, json=payload, timeout=45)
    except Exception as e:
        return {"error": f"Error de red al contactar Gemini: {e}"}

    if r.status_code != 200:
        try:
            err = r.json().get("error", {}).get("message", r.text)
        except Exception:
            err = r.text
        # Diagnóstico extra para errores comunes
        key_preview = f"{key[:6]}...{key[-4:]} ({len(key)} chars)" if key else "vacía"
        hint = ""
        if r.status_code == 400 and "API key" in str(err):
            hint = (
                f"\n\n🔍 La clave actual es: {key_preview}. "
                "Verifica que sea correcta en https://aistudio.google.com/apikey "
                "y que esté pegada SIN espacios en Render."
            )
        elif r.status_code == 429:
            hint = "\n\n⏱️ Alcanzaste el límite de 1500 mensajes/día del free tier."
        elif r.status_code == 403:
            hint = "\n\n🔒 La clave existe pero no tiene permiso para este modelo o proyecto."
        return {"error": f"Gemini respondió {r.status_code}: {err}{hint}"}

    data = r.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return {"error": "Gemini no devolvió respuesta", "raw": data}

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = []
    tool_calls = []
    for p in parts:
        if "text" in p:
            text_chunks.append(p["text"])
        if "functionCall" in p:
            fc = p["functionCall"]
            tool_calls.append({"name": fc.get("name"), "args": fc.get("args") or {}})

    return {
        "text": "\n".join(text_chunks).strip(),
        "tool_calls": tool_calls,
        "usage": data.get("usageMetadata", {}),
    }


# ── Llamada a Grok (xAI) — compatible con formato OpenAI ────────────

def _build_openai_tools():
    """Convierte el schema de Gemini al formato OpenAI/Grok."""
    return [
        {"type": "function", "function": t}
        for t in TOOLS_SCHEMA_GEMINI
    ]


def _grok_call(messages, system_prompt):
    """Llama a Grok (xAI) con function calling.
    La API es compatible con OpenAI, así que usamos su formato.
    """
    try:
        import requests
    except ImportError:
        return {"error": "Falta 'requests'. Instala con: pip install requests"}

    key = _api_key()
    if not key:
        return {
            "error": "Falta AI_API_KEY. Obtén una en https://console.x.ai/ "
            "y configúrala en Render."
        }

    # Convertir mensajes internos al formato OpenAI
    oai_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        if m["role"] == "user":
            oai_messages.append({"role": "user", "content": m["content"]})
        elif m["role"] == "assistant":
            msg = {"role": "assistant", "content": m.get("content") or ""}
            if m.get("tool_calls"):
                msg["tool_calls"] = [
                    {
                        "id": tc.get("id") or f"call_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc.get("args") or {}, ensure_ascii=False),
                        },
                    }
                    for i, tc in enumerate(m["tool_calls"])
                ]
            oai_messages.append(msg)
        elif m["role"] == "tool":
            oai_messages.append({
                "role": "tool",
                "tool_call_id": m.get("tool_call_id") or f"call_{m.get('name', 'x')}",
                "name": m.get("name"),
                "content": json.dumps(m["content"], ensure_ascii=False, default=str),
            })

    payload = {
        "model": _model_name(),
        "messages": oai_messages,
        "tools": _build_openai_tools(),
        "tool_choice": "auto",
        "temperature": 0.3,
        "max_tokens": 1500,
    }

    try:
        r = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
    except Exception as e:
        return {"error": f"Error de red al contactar Grok: {e}"}

    if r.status_code != 200:
        try:
            err_data = r.json()
            err = err_data.get("error", {}).get("message") or err_data.get("message") or r.text
        except Exception:
            err = r.text
        key_preview = f"{key[:8]}...{key[-4:]} ({len(key)} chars)" if key else "vacía"
        hint = ""
        if r.status_code == 401:
            hint = (
                f"\n\n🔍 La clave actual es: {key_preview}. "
                "Verifícala en https://console.x.ai/ — debe empezar con 'xai-'."
            )
        elif r.status_code == 429:
            hint = "\n\n⏱️ Alcanzaste el límite de Grok. Espera unos minutos."
        return {"error": f"Grok respondió {r.status_code}: {err}{hint}"}

    data = r.json()
    choices = data.get("choices", [])
    if not choices:
        return {"error": "Grok no devolvió respuesta", "raw": data}

    msg = choices[0].get("message", {})
    text = msg.get("content") or ""
    raw_tcs = msg.get("tool_calls") or []
    tool_calls = []
    for tc in raw_tcs:
        fn = tc.get("function", {})
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except (ValueError, TypeError):
            args = {}
        tool_calls.append({
            "id": tc.get("id"),
            "name": fn.get("name"),
            "args": args,
        })

    return {
        "text": text.strip() if text else "",
        "tool_calls": tool_calls,
        "usage": data.get("usage", {}),
    }


# ── Endpoint principal ──────────────────────────────────────────────

@bp.route("/chat", methods=["POST"])
@jwt_required()
def chat():
    """Mensaje del usuario → respuesta del asistente.

    Request: { conversationId?: int, message: str }
    Response: {
      conversationId, reply: str,
      toolCalls: [{name, args, result}],
      messages: [...]  (historial completo)
    }
    """
    body = request.get_json(silent=True) or {}
    user_msg = (body.get("message") or "").strip()
    if not user_msg:
        return jsonify(error="empty_message", message="Mensaje vacío"), 400

    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify(error="user_not_found"), 404

    # Solo admin (siempre) o usuarios con ai_enabled=True
    if not user.can_use_ai:
        return jsonify(
            error="ai_disabled",
            message="No tienes permiso para usar el asistente IA. "
                    "Pídele a un administrador que te habilite en Usuarios."
        ), 403

    role = (user.role or "viewer").lower()

    # Recupera o crea conversación
    conv_id = body.get("conversationId")
    if conv_id:
        conv = db.session.get(AIConversation, int(conv_id))
        if not conv or conv.user_id != user.id:
            return jsonify(error="not_found"), 404
    else:
        conv = AIConversation(
            user_id=user.id,
            user_email=user.email,
            user_role=role,
            messages="[]",
            tool_calls_log="[]",
            title=user_msg[:80],
        )
        db.session.add(conv)
        db.session.flush()

    history = conv.messages_list()
    tool_log = conv.tool_log_list()

    history.append({"role": "user", "content": user_msg})

    system_prompt = SYSTEM_PROMPT.format(
        user_info=f"{user.name or user.email} (rol: {role})",
        today=datetime.utcnow().strftime("%Y-%m-%d"),
    )

    final_text = ""
    tool_results_summary = []
    MAX_TOOL_ROUNDS = 4

    for round_idx in range(MAX_TOOL_ROUNDS):
        prov = _provider()
        if prov == "gemini":
            resp = _gemini_call(history, system_prompt)
        elif prov in ("grok", "xai"):
            resp = _grok_call(history, system_prompt)
        else:
            resp = {"error": f"Provider '{prov}' no implementado. Usa AI_PROVIDER=gemini o grok."}

        if "error" in resp:
            final_text = f"⚠️ {resp['error']}"
            history.append({"role": "assistant", "content": final_text})
            break

        text = resp.get("text") or ""
        tcs = resp.get("tool_calls") or []

        if not tcs:
            final_text = text or "(sin respuesta)"
            history.append({"role": "assistant", "content": final_text})
            break

        # El modelo quiere ejecutar tools — registra el turno
        history.append({
            "role": "assistant",
            "content": text,
            "tool_calls": tcs,
        })

        # Ejecuta cada tool y agrega los resultados como mensajes "tool"
        for tc in tcs:
            name = tc.get("name")
            args = tc.get("args") or {}
            result = ejecutar_tool(name, args, role, user.name or user.email)
            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "tool": name,
                "args": args,
                "result_preview": str(result)[:300],
                "user": user.email,
                "role": role,
            }
            tool_log.append(log_entry)
            tool_results_summary.append({"name": name, "args": args, "result": result})

            history.append({
                "role": "tool",
                "name": name,
                "content": result,
            })

        # Si fue la última vuelta y aún hubo tools, fuerza un texto cierre
        if round_idx == MAX_TOOL_ROUNDS - 1:
            final_text = text or "He ejecutado las acciones solicitadas. ¿Necesitas algo más?"
            history.append({"role": "assistant", "content": final_text})

    # Persiste
    conv.messages = json.dumps(history, ensure_ascii=False, default=str)
    conv.tool_calls_log = json.dumps(tool_log[-100:], ensure_ascii=False, default=str)
    conv.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify(
        conversationId=conv.id,
        reply=final_text,
        toolCalls=tool_results_summary,
        messages=history,
        title=conv.title,
    )


@bp.route("/conversaciones", methods=["GET"])
@jwt_required()
def list_conversations():
    user_id = int(get_jwt_identity())
    items = AIConversation.query.filter_by(user_id=user_id) \
        .order_by(AIConversation.updated_at.desc()).limit(30).all()
    return jsonify([{
        "id": c.id,
        "title": c.title,
        "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
    } for c in items])


@bp.route("/conversaciones/<int:cid>", methods=["GET"])
@jwt_required()
def get_conversation(cid):
    user_id = int(get_jwt_identity())
    c = db.session.get(AIConversation, cid)
    if not c or c.user_id != user_id:
        return jsonify(error="not_found"), 404
    return jsonify(c.to_dict())


@bp.route("/conversaciones/<int:cid>", methods=["DELETE"])
@jwt_required()
def delete_conversation(cid):
    user_id = int(get_jwt_identity())
    c = db.session.get(AIConversation, cid)
    if not c or c.user_id != user_id:
        return jsonify(error="not_found"), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)


@bp.route("/bitacora", methods=["GET"])
@role_required("admin")
def bitacora_global():
    """Para admin: ver todas las tools que han ejecutado los usuarios."""
    items = AIConversation.query.order_by(AIConversation.updated_at.desc()).limit(50).all()
    all_logs = []
    for c in items:
        for log in c.tool_log_list():
            all_logs.append({**log, "conversationId": c.id, "userEmail": c.user_email})
    all_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return jsonify(all_logs[:200])


@bp.route("/status", methods=["GET"])
@jwt_required()
def status():
    """Indica si el asistente está disponible (API key configurada + usuario con permiso)."""
    has_key = bool(_api_key())
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    allowed = bool(user and user.can_use_ai)

    if not allowed:
        msg = "No tienes permiso para usar el asistente. Pídele a un admin que te habilite."
    elif not has_key:
        msg = "Falta configurar AI_API_KEY en el servidor"
    else:
        msg = "Asistente listo"

    return jsonify(
        available=(has_key and allowed),
        allowed=allowed,
        configured=has_key,
        provider=_provider(),
        model=_model_name(),
        toolsCount=len(TOOLS_REGISTRY),
        message=msg,
    )
