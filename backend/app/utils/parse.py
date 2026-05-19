"""Parsers tolerantes para JSON de entrada."""
from datetime import date, datetime


def parse_date(value):
    """Acepta ISO yyyy-mm-dd o None/'' y devuelve date o None."""
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def parse_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def parse_str(value, max_len=None):
    if value is None:
        return None
    s = str(value).strip()
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s or None
