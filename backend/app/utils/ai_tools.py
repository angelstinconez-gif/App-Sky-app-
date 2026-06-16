"""Catálogo de TOOLS que el asistente IA puede usar.

Cada tool valida el rol del usuario antes de ejecutar. Las tools internamente
llaman a los modelos ORM (no hacen SQL directo). Si una tool falla, el LLM
ve el error y le explica al usuario.
"""
from datetime import datetime, date

from app import db
from app.models.incidencia import Incidencia
from app.models.ticket import Ticket
from app.models.garantia import Garantia
from app.models.poliza import Poliza
from app.models.directorio import Directorio
from app.models.mantenimiento import Mantenimiento
from app.models.viatico import Viatico
from app.models.revision_semanal import RevisionSemanal, ESTADOS_REVISION


# Roles que pueden ejecutar cada tool (puede leer / puede escribir)
PERMISOS = {
    "buscar_global":           {"leer": ["admin", "operator", "mantenimiento", "tecnico", "viewer"]},
    "kpis_dashboard":          {"leer": ["admin", "operator", "mantenimiento", "tecnico", "viewer"]},
    "listar_incidencias":      {"leer": ["admin", "operator", "mantenimiento", "tecnico", "viewer"]},
    "listar_tickets":          {"leer": ["admin", "operator", "mantenimiento", "tecnico", "viewer"]},
    "listar_garantias":        {"leer": ["admin", "mantenimiento"]},
    "listar_mantto":           {"leer": ["admin", "mantenimiento", "tecnico"]},
    "ver_planta":              {"leer": ["admin", "operator", "mantenimiento", "tecnico"]},
    "revisiones_dia":          {"leer": ["admin", "operator", "mantenimiento", "tecnico"]},
    "crear_ticket":            {"escribir": ["admin", "operator", "mantenimiento"]},
    "crear_incidencia":        {"escribir": ["admin", "operator"]},
    "cerrar_ticket":           {"escribir": ["admin", "operator", "mantenimiento"]},
    "cerrar_incidencia":       {"escribir": ["admin", "operator"]},
    "registrar_revision":      {"escribir": ["admin", "operator", "mantenimiento", "tecnico"]},
    "actualizar_garantia":     {"escribir": ["admin", "mantenimiento"]},
}


def _check_permiso(tool_name, role, accion="leer"):
    perms = PERMISOS.get(tool_name, {}).get(accion, [])
    if role not in perms:
        raise PermissionError(
            f"Tu rol '{role}' no tiene permiso para {accion} '{tool_name}'. "
            f"Permitido: {', '.join(perms) or 'nadie'}"
        )


def _short(d, keys):
    """Reduce un to_dict a las keys importantes para no inflar el contexto."""
    if not d:
        return None
    return {k: d.get(k) for k in keys if d.get(k) not in (None, "", [], {})}


# ── TOOLS DE LECTURA ──────────────────────────────────────

def buscar_global(role, query):
    _check_permiso("buscar_global", role)
    # Reutiliza la lógica de routes/search.py simplificada
    from sqlalchemy import or_
    like = f"%{query}%"
    out = {}
    if role in PERMISOS["listar_tickets"]["leer"]:
        out["tickets"] = [
            _short(t.to_dict(), ["id", "title", "site", "client", "status", "priority", "assignedTo"])
            for t in Ticket.query.filter(or_(
                Ticket.title.ilike(like),
                Ticket.site.ilike(like),
                Ticket.client.ilike(like),
            )).limit(8).all()
        ]
    if role in PERMISOS["listar_incidencias"]["leer"]:
        out["incidencias"] = [
            _short(i.to_dict(), ["id", "site", "client", "problem", "errCode", "status", "priority"])
            for i in Incidencia.query.filter(or_(
                Incidencia.site.ilike(like),
                Incidencia.problem.ilike(like),
                Incidencia.code.ilike(like),
            )).limit(8).all()
        ]
    return out


def kpis_dashboard(role):
    _check_permiso("kpis_dashboard", role)
    today = date.today()
    return {
        "incidencias": {
            "total": Incidencia.query.count(),
            "abiertas": Incidencia.query.filter(Incidencia.status == "abierta").count(),
            "criticas": Incidencia.query.filter(Incidencia.priority == "Critico").count(),
        },
        "tickets": {
            "total": Ticket.query.count(),
            "abiertos": Ticket.query.filter(Ticket.status != "Cerrado").count(),
            "vencidos": Ticket.query.filter(
                Ticket.status != "Cerrado",
                Ticket.due_date < today,
            ).count(),
        },
        "garantias": {
            "total": Garantia.query.count(),
            "abiertas": Garantia.query.filter(
                ~Garantia.status.in_(["Cerrada", "Rechazada", "Aprobada"])
            ).count(),
        },
        "polizas": {
            "total": Poliza.query.count(),
            "vigentes": Poliza.query.filter(Poliza.pol_end >= today).count(),
            "vencidas": Poliza.query.filter(Poliza.pol_end < today).count(),
        },
    }


def listar_incidencias(role, estado=None, prioridad=None, proyecto=None, limit=20):
    _check_permiso("listar_incidencias", role)
    q = Incidencia.query
    if estado:
        q = q.filter(Incidencia.status == estado)
    if prioridad:
        q = q.filter(Incidencia.priority == prioridad)
    if proyecto:
        q = q.filter(Incidencia.site.ilike(f"%{proyecto}%"))
    items = q.order_by(Incidencia.inc_date.desc().nullslast()).limit(min(limit, 30)).all()
    return [_short(i.to_dict(), [
        "id", "site", "client", "platform", "problem", "errCode",
        "priority", "status", "incDate", "responsible"
    ]) for i in items]


def listar_tickets(role, estado=None, prioridad=None, proyecto=None, asignado=None, limit=20):
    _check_permiso("listar_tickets", role)
    q = Ticket.query
    if estado:
        q = q.filter(Ticket.status == estado)
    if prioridad:
        q = q.filter(Ticket.priority == prioridad)
    if proyecto:
        q = q.filter(Ticket.site.ilike(f"%{proyecto}%"))
    if asignado:
        q = q.filter(Ticket.assigned_to.ilike(f"%{asignado}%"))
    items = q.order_by(Ticket.id.desc()).limit(min(limit, 30)).all()
    return [_short(t.to_dict(), [
        "id", "title", "site", "client", "priority", "status",
        "assignedTo", "openDate", "dueDate"
    ]) for t in items]


def listar_garantias(role, estado=None, limit=20):
    _check_permiso("listar_garantias", role)
    q = Garantia.query
    if estado:
        q = q.filter(Garantia.status == estado)
    items = q.order_by(Garantia.id.desc()).limit(min(limit, 30)).all()
    return [_short(g.to_dict(), [
        "id", "project", "equipment", "brand", "model", "sn",
        "error", "supplier", "status", "abiertoPor", "days"
    ]) for g in items]


def listar_mantto(role, estado=None, proyecto=None, limit=20):
    _check_permiso("listar_mantto", role)
    q = Mantenimiento.query
    if estado:
        q = q.filter(Mantenimiento.estado == estado)
    if proyecto:
        q = q.filter(Mantenimiento.project.ilike(f"%{proyecto}%"))
    items = q.order_by(Mantenimiento.fecha_programada.desc().nullslast()).limit(min(limit, 30)).all()
    return [_short(m.to_dict(), [
        "id", "project", "tipo", "estado", "fechaProgramada",
        "fechaFinProgramada", "cuadrilla", "responsable", "diasEnSitio"
    ]) for m in items]


def ver_planta(role, proyecto):
    _check_permiso("ver_planta", role)
    if not proyecto:
        return {"error": "Falta el nombre del proyecto"}
    p = Poliza.query.filter(Poliza.project.ilike(f"%{proyecto}%")).first()
    if not p:
        return {"error": f"No encontré la planta '{proyecto}'"}
    incs_abiertas = Incidencia.query.filter(
        Incidencia.site.ilike(f"%{p.project}%"),
        Incidencia.status == "abierta",
    ).count()
    tickets_abiertos = Ticket.query.filter(
        Ticket.site.ilike(f"%{p.project}%"),
        Ticket.status != "Cerrado",
    ).count()
    return {
        "planta": _short(p.to_dict(), ["id", "project", "code", "grupo", "platform", "zona", "polEnd", "poliza"]),
        "incidenciasAbiertas": incs_abiertas,
        "ticketsAbiertos": tickets_abiertos,
    }


def revisiones_dia(role, fecha=None):
    _check_permiso("revisiones_dia", role)
    if fecha:
        try:
            d = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            d = date.today()
    else:
        d = date.today()
    revs = RevisionSemanal.query.filter_by(fecha=d).all()
    by_estado = {}
    for r in revs:
        by_estado[r.estado] = by_estado.get(r.estado, 0) + 1
    return {
        "fecha": d.isoformat(),
        "totalRevisadas": len(revs),
        "porEstado": by_estado,
        "muestrasOK": [r.project for r in revs if r.estado == "OK"][:5],
        "muestrasConProblema": [
            {"project": r.project, "estado": r.estado, "incidenciaId": r.incidencia_id}
            for r in revs if r.estado != "OK"
        ][:10],
    }


# ── TOOLS DE ESCRITURA ────────────────────────────────────

def crear_ticket(role, user_name, title, proyecto, prioridad="Intermedia",
                 asignado=None, descripcion=None, fecha_compromiso=None):
    _check_permiso("crear_ticket", role, "escribir")
    if not title or not proyecto:
        return {"error": "Faltan 'title' y 'proyecto'"}
    t = Ticket(
        title=title,
        site=proyecto,
        priority=prioridad,
        status="Abierto",
        assigned_to=asignado,
        description=descripcion,
        open_date=date.today(),
    )
    if fecha_compromiso:
        try:
            t.due_date = datetime.strptime(fecha_compromiso, "%Y-%m-%d").date()
        except ValueError:
            pass
    # heredar datos de la póliza si existe
    pol = Poliza.query.filter(Poliza.project.ilike(f"%{proyecto}%")).first()
    if pol:
        t.client = pol.grupo
        t.project_code = pol.code
    db.session.add(t)
    db.session.flush()
    db.session.commit()
    return {"creado": True, "id": t.id, "title": t.title, "site": t.site}


def crear_incidencia(role, user_name, proyecto, problema, prioridad="Intermedia",
                     codigo_error=None, plataforma=None, notas=None):
    _check_permiso("crear_incidencia", role, "escribir")
    if not proyecto or not problema:
        return {"error": "Faltan 'proyecto' y 'problema'"}
    inc = Incidencia(
        site=proyecto,
        problem=problema,
        priority=prioridad,
        err_code=codigo_error,
        platform=plataforma,
        notes=notas,
        status="abierta",
        inc_date=date.today(),
        responsible=user_name,
    )
    pol = Poliza.query.filter(Poliza.project.ilike(f"%{proyecto}%")).first()
    if pol:
        inc.client = pol.grupo
        inc.code = pol.code
        if pol.platform and not plataforma:
            inc.platform = pol.platform
    db.session.add(inc)
    db.session.flush()
    db.session.commit()
    return {"creado": True, "id": inc.id, "site": inc.site, "problem": inc.problem}


def cerrar_ticket(role, user_name, ticket_id, resultado=None):
    _check_permiso("cerrar_ticket", role, "escribir")
    t = db.session.get(Ticket, int(ticket_id))
    if not t:
        return {"error": f"Ticket #{ticket_id} no encontrado"}
    t.status = "Cerrado"
    t.close_date = date.today()
    t.result = resultado or "Cerrado por asistente IA"
    t.closed_by = user_name
    db.session.commit()
    return {"cerrado": True, "id": t.id}


def cerrar_incidencia(role, user_name, incidencia_id, resultado=None):
    _check_permiso("cerrar_incidencia", role, "escribir")
    inc = db.session.get(Incidencia, int(incidencia_id))
    if not inc:
        return {"error": f"Incidencia #{incidencia_id} no encontrada"}
    inc.status = "cerrada"
    inc.closed_at = datetime.utcnow()
    inc.close_result = resultado
    inc.closed_by = user_name
    db.session.commit()
    return {"cerrada": True, "id": inc.id}


def registrar_revision(role, user_name, proyecto, estado, observaciones=None,
                       generar_incidencia=False):
    _check_permiso("registrar_revision", role, "escribir")
    if estado not in ESTADOS_REVISION:
        return {"error": f"Estado inválido. Usa: {', '.join(ESTADOS_REVISION)}"}
    pol = Poliza.query.filter(Poliza.project.ilike(f"%{proyecto}%")).first()
    if not pol:
        return {"error": f"Proyecto '{proyecto}' no existe en pólizas"}
    today = date.today()
    iso = today.isocalendar()
    existing = RevisionSemanal.query.filter_by(project=pol.project, fecha=today).first()
    target = existing or RevisionSemanal(project=pol.project)
    target.fecha = today
    target.year = iso[0]
    target.week = iso[1]
    target.code = pol.code
    target.poliza_id = pol.id
    target.estado = estado
    target.observaciones = observaciones
    target.revisado_por = user_name
    target.fecha_revision = today

    inc_id = None
    if estado != "OK" and generar_incidencia and not target.incidencia_id:
        inc = Incidencia(
            site=pol.project, code=pol.code,
            priority="Alta" if estado == "Sin comunicación" else ("Critico" if estado == "Falla" else "Intermedia"),
            problem=f"Detectado en revisión diaria: {estado}",
            notes=observaciones or "",
            inc_date=today,
            status="abierta",
            responsible=user_name,
            client=pol.grupo,
            platform=pol.platform,
        )
        db.session.add(inc)
        db.session.flush()
        target.incidencia_id = inc.id
        inc_id = inc.id
    if not existing:
        db.session.add(target)
    db.session.commit()
    return {"guardado": True, "estado": estado, "incidenciaCreada": inc_id}


# ── DISPATCHER ────────────────────────────────────────────

TOOLS_REGISTRY = {
    "buscar_global":       buscar_global,
    "kpis_dashboard":      kpis_dashboard,
    "listar_incidencias":  listar_incidencias,
    "listar_tickets":      listar_tickets,
    "listar_garantias":    listar_garantias,
    "listar_mantto":       listar_mantto,
    "ver_planta":          ver_planta,
    "revisiones_dia":      revisiones_dia,
    "crear_ticket":        crear_ticket,
    "crear_incidencia":    crear_incidencia,
    "cerrar_ticket":       cerrar_ticket,
    "cerrar_incidencia":   cerrar_incidencia,
    "registrar_revision":  registrar_revision,
}


def ejecutar_tool(name, args, role, user_name):
    """Ejecuta una tool con manejo de errores y check de permisos."""
    fn = TOOLS_REGISTRY.get(name)
    if not fn:
        return {"error": f"Tool '{name}' no existe"}
    try:
        import inspect
        sig = inspect.signature(fn)
        params = sig.parameters
        kwargs = {}
        if "role" in params: kwargs["role"] = role
        if "user_name" in params: kwargs["user_name"] = user_name
        # Pasar solo args que la función acepta
        for k, v in (args or {}).items():
            if k in params:
                kwargs[k] = v
        return fn(**kwargs)
    except PermissionError as e:
        return {"error": str(e), "tipo": "permiso"}
    except Exception as e:
        db.session.rollback()
        return {"error": str(e), "tipo": "ejecucion"}


# ── DESCRIPCIONES DE TOOLS PARA EL LLM ────────────────────

TOOLS_SCHEMA_GEMINI = [
    {
        "name": "buscar_global",
        "description": "Búsqueda libre en tickets e incidencias por texto. Útil cuando el usuario menciona un nombre de planta o un problema sin saber dónde está.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "texto a buscar"}},
            "required": ["query"],
        },
    },
    {
        "name": "kpis_dashboard",
        "description": "Devuelve KPIs globales: conteos de incidencias, tickets, garantías y pólizas. Úsalo para preguntas tipo '¿cómo va todo?' o resúmenes.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "listar_incidencias",
        "description": "Lista incidencias con filtros opcionales (estado, prioridad, proyecto). Máximo 30 resultados.",
        "parameters": {
            "type": "object",
            "properties": {
                "estado": {"type": "string", "description": "abierta | cerrada"},
                "prioridad": {"type": "string", "description": "Critico | Alta | Intermedia | Baja"},
                "proyecto": {"type": "string", "description": "filtro parcial por nombre del proyecto"},
                "limit": {"type": "integer", "description": "máximo de resultados (default 20)"},
            },
        },
    },
    {
        "name": "listar_tickets",
        "description": "Lista tickets con filtros opcionales.",
        "parameters": {
            "type": "object",
            "properties": {
                "estado": {"type": "string", "description": "Abierto | En proceso | Cerrado"},
                "prioridad": {"type": "string"},
                "proyecto": {"type": "string"},
                "asignado": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "listar_garantias",
        "description": "Lista garantías. Solo admin y mantenimiento.",
        "parameters": {
            "type": "object",
            "properties": {
                "estado": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "listar_mantto",
        "description": "Lista mantenimientos.",
        "parameters": {
            "type": "object",
            "properties": {
                "estado": {"type": "string", "description": "Programado | En curso | Completado | Cancelado"},
                "proyecto": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "ver_planta",
        "description": "Detalle de una planta específica: datos de póliza + conteo de incidencias y tickets abiertos.",
        "parameters": {
            "type": "object",
            "properties": {"proyecto": {"type": "string", "description": "nombre del proyecto"}},
            "required": ["proyecto"],
        },
    },
    {
        "name": "revisiones_dia",
        "description": "Resumen de revisiones diarias SFV del día indicado (default hoy).",
        "parameters": {
            "type": "object",
            "properties": {"fecha": {"type": "string", "description": "YYYY-MM-DD"}},
        },
    },
    {
        "name": "crear_ticket",
        "description": "Crea un ticket nuevo. CONFIRMA con el usuario antes de llamar esta tool.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "proyecto": {"type": "string"},
                "prioridad": {"type": "string"},
                "asignado": {"type": "string"},
                "descripcion": {"type": "string"},
                "fecha_compromiso": {"type": "string", "description": "YYYY-MM-DD"},
            },
            "required": ["title", "proyecto"],
        },
    },
    {
        "name": "crear_incidencia",
        "description": "Crea una incidencia nueva. CONFIRMA con el usuario antes de llamar esta tool.",
        "parameters": {
            "type": "object",
            "properties": {
                "proyecto": {"type": "string"},
                "problema": {"type": "string"},
                "prioridad": {"type": "string"},
                "codigo_error": {"type": "string"},
                "plataforma": {"type": "string"},
                "notas": {"type": "string"},
            },
            "required": ["proyecto", "problema"],
        },
    },
    {
        "name": "cerrar_ticket",
        "description": "Cierra un ticket. CONFIRMA con el usuario antes de llamar.",
        "parameters": {
            "type": "object",
            "properties": {
                "ticket_id": {"type": "integer"},
                "resultado": {"type": "string"},
            },
            "required": ["ticket_id"],
        },
    },
    {
        "name": "cerrar_incidencia",
        "description": "Cierra una incidencia. CONFIRMA con el usuario antes de llamar.",
        "parameters": {
            "type": "object",
            "properties": {
                "incidencia_id": {"type": "integer"},
                "resultado": {"type": "string"},
            },
            "required": ["incidencia_id"],
        },
    },
    {
        "name": "registrar_revision",
        "description": "Registra revisión diaria de una planta SFV. CONFIRMA antes de llamar.",
        "parameters": {
            "type": "object",
            "properties": {
                "proyecto": {"type": "string"},
                "estado": {"type": "string", "description": "OK | Sin comunicación | Falla | Falta de datos"},
                "observaciones": {"type": "string"},
                "generar_incidencia": {"type": "boolean"},
            },
            "required": ["proyecto", "estado"],
        },
    },
]
