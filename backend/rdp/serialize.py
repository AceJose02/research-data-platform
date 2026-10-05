"""Convert pandas / numpy values into strictly JSON-safe Python values.

Flask's default JSON encoder writes float('nan') and float('inf') as the bare
tokens NaN / Infinity, which are not valid JSON and make browsers' JSON.parse
throw. Everything that leaves the API goes through ``to_jsonable`` first.
"""

from __future__ import annotations

import datetime as dt
import decimal
import math
from typing import Any

import numpy as np
import pandas as pd


def to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(v) for v in value]
    if isinstance(value, np.ndarray):
        return [to_jsonable(v) for v in value.tolist()]
    return scalar(value)


def scalar(value: Any) -> Any:
    """Convert one cell value. Missing / non-finite numbers become None."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        f = float(value)
        return f if math.isfinite(f) else None
    if isinstance(value, decimal.Decimal):
        f = float(value)
        return f if math.isfinite(f) else None
    if isinstance(value, str):
        return value
    # pd.NaT, pd.NA and friends
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, pd.Timedelta):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def rounded(value: Any, digits: int = 4) -> Any:
    v = scalar(value)
    if isinstance(v, float):
        return round(v, digits)
    return v
