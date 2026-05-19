"""KPIs y gráficos del Dashboard."""
from collections import Counter
from datetime import date, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db
from app.models.incidencia import Incidencia
from app.models.ticket import Ticket
from app.models.garantia import Garantia
from app.models.poliza import Poliza

bp = Blueprint("dashboard", __name__)


@bp.route("/kpis", methods=["GET"])
@jwt_required()
def kpis():
    total_inc = Incidencia.query.count()
    abiertas = Incidencia.query.filter_by(status="abierta").count()
    criticas = Incidencia.query.filter_by(priority="Critico", status="abierta").count()
    altas = Incidencia.query.filter_by(priority="Alta", status="abierta").count()

    total_tkt = Ticket.query.count()
    tkt_abiertos = Ticket.query.filter(Ticket.status != "Cerrado").count()
    tkt_cerrados = Ticket.query.filter(Ticket.status == "Cerrado").count()

    polizas_total = Poliza.query.count()
    polizas_vigentes = sum(1 for p in Poliza.query.all() if p.computed_status() == "Vigente")
    polizas_vencidas = polizas_total - polizas_vigentes

    soon = date.today() + timedelta(days=30)
    pol_vencen_pronto = Poliza.query.filter(
        Poliza.pol_end != None, Poliza.pol_end >= date.today(), Poliza.pol_end <= soon
    ).count()

    garantias_abiertas = Garantia.query.filter(Garantia.status.ilike("%espera%")).count()

    return jsonify(
        incidencias={
            "total": total_inc,
            "abiertas": abiertas,
            "criticas": criticas,
            "altas": altas,
        },
        tickets={
            "total": total_tkt,
            "abiertos": tkt_abiertos,
            "cerrados": tkt_cerrados,
        },
        polizas={
            "total": polizas_total,
            "vigentes": polizas_vigentes,
            "vencidas": polizas_vencidas,
            "vencenPronto": pol_vencen_pronto,
        },
        garantias={"abiertas": garantias_abiertas},
    )


@bp.route("/charts", methods=["GET"])
@jwt_required()
def charts():
    incs = Incidencia.query.all()

    by_priority = Counter(i.priority or "Sin prioridad" for i in incs)
    by_platform = Counter(i.platform or "Otros" for i in incs)
    by_classification = Counter(i.classification or "Sin clasificar" for i in incs)
    by_status = Counter(i.status or "abierta" for i in incs)

    # Incidencias por mes (últimos 12)
    today = date.today()
    months = []
    counts = []
    for offset in range(11, -1, -1):
        year = today.year + (today.month - 1 - offset) // 12
        month = (today.month - 1 - offset) % 12 + 1
        months.append(f"{year}-{month:02d}")
        c = sum(
            1
            for i in incs
            if i.inc_date and i.inc_date.year == year and i.inc_date.month == month
        )
        counts.append(c)

    return jsonify(
        byPriority=dict(by_priority),
        byPlatform=dict(by_platform),
        byClassification=dict(by_classification),
        byStatus=dict(by_status),
        timeline={"labels": months, "data": counts},
    )
