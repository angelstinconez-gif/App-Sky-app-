"""CRUD de Pólizas."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app import db
from app.models.poliza import Poliza
from app.utils.audit import log_change
from app.utils.decorators import role_required
from app.utils.parse import parse_date, parse_int, parse_str

bp = Blueprint("polizas", __name__)

# Flags volátiles para auto-setup una sola vez por instancia
_cobertura_col_ok = False
_monitoreo_marked = False


# Lista de proyectos que deben tener Monitoreo activado.
# Se aplica una sola vez por instancia, SOLO a pólizas que ya existen (no crea nuevas).
_MONITOREO_PLANTAS = [
    "ASUR Merida", "Aeropuerto Internacional de Ciudad Juárez",
    "Aeropuerto Internacional de Culiacán", "Aeropuerto Internacional de Durango",
    "Aeropuerto Internacional de Torreón", "Aeropuerto Internacional de Zacatecas",
    "MERCK", "Trafimar", "EL PALACIO DE HIERRO QRO", "Cafetal 189", "Canela 350",
    "MAESA Nave 2", "MAESA Nave 1", "Surtidora de Lámina",
    "Antea QRO - UP1 Sub#1 1500KVA", "Antea QRO - UP2 Sub#2 1500KVA",
    "HOTEL NAVIVA", "Aquamatic División Del Norte", "Industrias RC", "industrias RC 2",
    "Aquamatic Tezozomoc", "Artículos Higiénicos De México SA DE CV",
    "ASUR Merida COMEDOR", "ASUR Mérida-CREI", "ASUR Oaxaca",
    "FV HUAX SE1 - ASUR HUATULCO", "FV HUAX SE2 - ASUR HUATULCO", "ASUR Tapachula",
    "Fantasías Miguel Cancún", "Fantasías Miguel Tultitlan", "FM_MTY SAN JERONIMO",
    "FM la tijera", "FM Boca del río", "FM MID MTY", "FM Campestre", "FM Arboledas",
    "FM Coacalco", "FM Aguascalientes", "Fantasias Miguel Mariano Escobedo",
    "AXIS Nave Principal", "TALLER FOSTER WHEELER", "FORMETAX FWM",
    "MEDICA SAN ISIDRO", "CMT-ESPECIALIDADES", "FRITOS TOTIS",
    "MEXCOAT LOTE 10", "MEXCOAT LOTE 11", "Congelados Alysa", "Acrilicos Sablón",
    "Telas Bayo", "IPASA BOLSAS ARTESANALES", "HOLOGIC COSTA RICA", "Autolomas SEAT",
    "Mil Cumbres", "Roberto Aguilar Gasolinera", "Hector Flores",
    "Claudia Monroy - Tiro al pichón 200", "Pablo Favela - Piamonte 1",
    "Sofía Perochena - Calle del parque 30", "RANCHO LA CAMPANADA", "EUROVALLE",
    "Nuvoil Grande", "Nuvoil Chico", "P18-0327", "P18-4212", "P18-2101",
    "AGROBAL_ORDEÑA", "AGROBAL_ESTABLO", "BIDASOA", "Guillermo Ballesteros",
    "CENTRUM PARK EDIFICIO C", "CENTRUM PARK EDIFICIO B2", "CENTRUM PARK EDIFICIO D",
    "CENTRUM PARK EDIFICIO E", "CENTRUM PARK EDIFICIO B1", "CENTRUM PARK EDIFICIO HVAC",
    "Trimex Larry", "CENTRO MEDICO TOLUCA", "Hector Flores-club de golf",
    "Texturizados", "CLARIMEX", "272 Ixtepec", "838 Cunduacan",
    "P196 Plaza Chedraui Aguascalientes Colosio", "Vidanta",
]


def _ensure_cobertura_col():
    global _cobertura_col_ok
    if _cobertura_col_ok:
        return
    _cobertura_col_ok = True
    try:
        from sqlalchemy import inspect, text
        insp = inspect(db.engine)
        if not insp.has_table("polizas"):
            return
        cols = {c["name"] for c in insp.get_columns("polizas")}
        for col, ddl in [
            ("cobertura", "ALTER TABLE polizas ADD COLUMN cobertura VARCHAR(30)"),
            ("monitoreo", "ALTER TABLE polizas ADD COLUMN monitoreo BOOLEAN DEFAULT FALSE"),
        ]:
            if col not in cols:
                try:
                    with db.engine.begin() as conn:
                        conn.execute(text(ddl))
                    print(f"➕ Columna polizas.{col} creada")
                except Exception as e:
                    print(f"⚠️  No se pudo crear polizas.{col}: {e}")
    except Exception as e:
        print(f"⚠️  ensure_cobertura_col falló: {e}")


def _auto_marcar_monitoreo():
    """Marca con monitoreo=True las pólizas de la lista hardcoded.

    REGLAS DE NEGOCIO:
      - Solo MARCA (añade) las pólizas de la lista que aún no estén marcadas.
      - NUNCA desmarca. Las marcas manuales del usuario se respetan SIEMPRE.
      - Si el usuario quiere desmarcar una planta, debe hacerlo manualmente
        desde el checkbox de la página Pólizas.
      - Una vez por instancia (flag volátil).
      - Idempotente: si ya está todo marcado, no hace nada."""
    global _monitoreo_marked
    if _monitoreo_marked:
        return
    _monitoreo_marked = True
    try:
        def _norm(s): return (s or "").strip().lower()
        objetivos = {_norm(p) for p in _MONITOREO_PLANTAS}
        marcadas = 0
        all_pol = Poliza.query.all()
        for p in all_pol:
            key = _norm(p.project)
            if key in objetivos and not getattr(p, "monitoreo", False):
                p.monitoreo = True
                marcadas += 1
        if marcadas:
            db.session.commit()
            print(f"👁️  Auto-marcado Monitoreo: +{marcadas} nuevas (no se tocaron las ya existentes)")
    except Exception as e:
        db.session.rollback()
        print(f"⚠️  auto_marcar_monitoreo falló: {e}")


def _tipo_desde_codigo(code):
    """Deriva el tipo de póliza desde el código.
    - -FV-  → PV
    - -BT-  → BESS
    - -HB-  → Híbrido
    Devuelve None si el código no aplica.
    """
    if not code:
        return None
    c = code.upper()
    if "-FV" in c:
        return "PV"
    if "-HB" in c:
        return "Híbrido"
    if "-BT" in c:
        return "BESS"
    return None


@bp.route("/auto-clasificar", methods=["POST"])
@jwt_required()
@role_required("admin")
def auto_clasificar():
    """Recorre TODAS las pólizas y aplica el tipo según el código.

    Reglas:
      -FV → PV
      -BT → BESS
      -HB → Híbrido

    Sólo modifica pólizas cuyo tipo actual difiera. Devuelve resumen.
    """
    data = request.get_json(silent=True) or {}
    sobrescribir = bool(data.get("sobrescribir", True))  # por default sí sobrescribe
    only_empty = bool(data.get("soloVacios", False))

    polizas = Poliza.query.all()
    cambios = []
    sin_cambio = 0
    sin_codigo = 0

    for p in polizas:
        nuevo = _tipo_desde_codigo(p.code)
        if not nuevo:
            sin_codigo += 1
            continue
        actual = (p.poliza or "").strip()
        # Decidir si actualizar
        if only_empty and actual:
            sin_cambio += 1
            continue
        if not sobrescribir and actual:
            sin_cambio += 1
            continue
        # Compara case-insensitive ignorando acentos básicos
        if actual.lower() == nuevo.lower():
            sin_cambio += 1
            continue
        cambios.append({
            "id": p.id, "project": p.project, "code": p.code,
            "antes": actual or None, "nuevo": nuevo,
        })
        p.poliza = nuevo

    db.session.commit()
    return jsonify(
        ok=True,
        totalPolizas=len(polizas),
        cambios=len(cambios),
        sinCambio=sin_cambio,
        sinCodigo=sin_codigo,
        detalle=cambios[:40],   # primeros 40 para no inflar
    )


@bp.route("/marcar-pv", methods=["POST"])
@jwt_required()
@role_required("admin")
def marcar_pv():
    """Marca como tipo PV un lote de pólizas específicas (por id o por nombre).

    Body: { polizaIds: [...] } o { projects: ['Nombre A', ...] }
    """
    data = request.get_json(silent=True) or {}
    poliza_ids = data.get("polizaIds") or []
    projects = data.get("projects") or []
    cambios = 0
    for pid in poliza_ids:
        try:
            p = db.session.get(Poliza, int(pid))
            if p:
                p.poliza = "PV"
                cambios += 1
        except Exception:
            pass
    for name in projects:
        if not name: continue
        pols = Poliza.query.filter(Poliza.project.ilike(f"%{name}%")).all()
        for p in pols:
            p.poliza = "PV"
            cambios += 1
    db.session.commit()
    return jsonify(ok=True, cambios=cambios)


@bp.route("", methods=["GET"])
@jwt_required()
def list_polizas():
    _ensure_cobertura_col()
    _auto_marcar_monitoreo()
    args = request.args
    query = Poliza.query
    if args.get("grupo"):
        query = query.filter(Poliza.grupo == args["grupo"])
    if args.get("zona"):
        query = query.filter(Poliza.zona == args["zona"])
    if args.get("status"):
        query = query.filter(Poliza.status == args["status"])
    if args.get("cobertura"):
        query = query.filter(Poliza.cobertura == args["cobertura"])
    if args.get("q"):
        like = f"%{args['q']}%"
        query = query.filter(or_(
            Poliza.project.ilike(like),
            Poliza.code.ilike(like),
            Poliza.grupo.ilike(like),
            Poliza.platform.ilike(like),
            Poliza.zona.ilike(like),
            Poliza.cuadrilla.ilike(like),
            Poliza.poliza.ilike(like),
            Poliza.cobertura.ilike(like),
            Poliza.tarifa.ilike(like),
        ))
    items = query.order_by(Poliza.item.asc().nullslast(), Poliza.id.asc()).all()
    return jsonify([i.to_dict() for i in items])


@bp.route("", methods=["POST"])
@jwt_required()
@role_required("admin")
def create_poliza():
    data = request.get_json(silent=True) or {}
    if not data.get("project"):
        return jsonify(error="missing_project"), 400
    p = Poliza(project=parse_str(data["project"]))
    _apply(p, data)
    db.session.add(p)
    db.session.flush()
    log_change("polizas", "crear", p.project, new=p.to_dict())
    db.session.commit()
    return jsonify(p.to_dict()), 201


@bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_poliza(item_id):
    p = db.session.get(Poliza, item_id)
    if not p:
        return jsonify(error="not_found"), 404
    old = p.to_dict()
    _apply(p, request.get_json(silent=True) or {})
    log_change("polizas", "editar", p.project, old=old, new=p.to_dict())
    db.session.commit()
    return jsonify(p.to_dict())


@bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_poliza(item_id):
    p = db.session.get(Poliza, item_id)
    if not p:
        return jsonify(error="not_found"), 404
    log_change("polizas", "eliminar", p.project, old=p.to_dict())
    db.session.delete(p)
    db.session.commit()
    return jsonify(ok=True)


def _apply(p: Poliza, data: dict):
    p.item = parse_int(data.get("item"))
    p.grupo = parse_str(data.get("grupo"))
    p.code = parse_str(data.get("code"))
    p.project = parse_str(data.get("project")) or p.project
    p.tarifa = parse_str(data.get("tarifa"))
    p.platform = parse_str(data.get("platform"))
    p.panels = parse_str(data.get("panels"))
    p.inv = parse_str(data.get("inv"))
    p.sys_start = parse_date(data.get("sysStart"))
    p.pol_start = parse_date(data.get("polStart"))
    p.pol_end = parse_date(data.get("polEnd"))
    p.status = parse_str(data.get("status"))
    p.poliza = parse_str(data.get("poliza"))
    p.cobertura = parse_str(data.get("cobertura"))
    if "monitoreo" in data:
        p.monitoreo = bool(data.get("monitoreo"))
    p.zona = parse_str(data.get("zona"))
    p.cuadrilla = parse_str(data.get("cuadrilla"))


@bp.route("/zonas", methods=["GET"])
@jwt_required()
def list_zonas():
    """Devuelve la lista única de zonas presentes en Pólizas."""
    rows = (
        db.session.query(Poliza.zona)
        .filter(Poliza.zona.isnot(None))
        .filter(Poliza.zona != "")
        .distinct()
        .order_by(Poliza.zona.asc())
        .all()
    )
    return jsonify([r[0] for r in rows])


@bp.route("/plataformas", methods=["GET"])
@jwt_required()
def list_plataformas():
    """Devuelve la lista única de plataformas."""
    rows = (
        db.session.query(Poliza.platform)
        .filter(Poliza.platform.isnot(None))
        .filter(Poliza.platform != "")
        .distinct()
        .order_by(Poliza.platform.asc())
        .all()
    )
    return jsonify([r[0] for r in rows])
