"""Infer what each column *means* so it can be summarised and charted correctly.

Kinds
-----
numeric      measurements and counts (including "$52,000", "3,5", "45%")
categorical  a limited set of labels (city, gender, education level)
text         free text or mostly-unique labels (names, emails, IDs)
datetime     dates and timestamps
boolean      yes/no, true/false
empty        no values at all

Two extra flags refine charting:
``discrete``       numeric with only a few whole-number values (a 1-7 Likert
                   scale, days of exercise). Shown as one bar per value rather
                   than a histogram.
``is_identifier``  every value is unique (participant IDs, emails). Not useful
                   to chart or to group by.
"""

from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

NUMERIC_SHARE = 0.95      # share of values that must parse for a text column to count as numeric
DATETIME_SHARE = 0.90
DISCRETE_MAX_UNIQUE = 25
DISCRETE_MAX_RANGE = 100  # a 1-7 scale or a count of days, not totals like payroll
# A label column counts as free text when it's mostly unique. Small files need
# a stricter ratio, otherwise any column with <= 50 values would be "categorical".
TEXT_RULES = ((20, 0.8), (50, 0.5))  # (more than N distinct values, and share unique above R)
IDENTIFIER_MIN_ROWS = 10

_CURRENCY = "$€£¥₹"
_THOUSANDS_COMMA = re.compile(rf"^\(?[-+]?[{_CURRENCY}]?\d{{1,3}}(,\d{{3}})+(\.\d+)?%?\)?$")
_DECIMAL_COMMA = re.compile(rf"^\(?[-+]?[{_CURRENCY}]?\d*,\d+%?\)?$")
_EURO_STYLE = re.compile(rf"^\(?[-+]?[{_CURRENCY}]?\d{{1,3}}(\.\d{{3}})+(,\d+)?%?\)?$")
_LEADING_ZERO_CODE = re.compile(r"^0\d+$")
_STRIP_CHARS = re.compile(rf"[\s{_CURRENCY}%]")
_ID_NAME = re.compile(r"(^|[\s_\-])(id|uuid|key|code)$|^id[\s_\-]|identifier", re.IGNORECASE)
_TRUE = {"true", "yes", "y", "t"}
_FALSE = {"false", "no", "n", "f"}
_DATE_LIKE = re.compile(
    r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$"
    r"|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}( \d{1,2}:\d{2}(:\d{2})?( ?[AaPp][Mm])?)?$"
    r"|^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}$"
    r"|^\d{1,2} [A-Za-z]{3,9}\.? \d{4}$"
)


@dataclass
class ColumnInfo:
    name: str
    kind: str
    values: pd.Series = field(repr=False)  # typed values aligned to the frame index
    valid: int
    missing: int
    unique: int
    discrete: bool = False
    is_identifier: bool = False
    source_dtype: str = ""

    @property
    def missing_pct(self) -> float:
        total = self.valid + self.missing
        return (self.missing / total * 100) if total else 0.0


def profile_column(name: str, raw: pd.Series) -> ColumnInfo:
    source_dtype = str(raw.dtype)
    non_null = raw.dropna()
    valid = int(non_null.shape[0])
    missing = int(raw.shape[0] - valid)

    if valid == 0:
        return ColumnInfo(name, "empty", raw, 0, missing, 0, source_dtype=source_dtype)

    if pd.api.types.is_bool_dtype(raw):
        values = raw.astype("boolean")
        return _make(name, "boolean", values, missing, source_dtype)

    if pd.api.types.is_datetime64_any_dtype(raw):
        values = raw
        if getattr(values.dt, "tz", None) is not None:
            values = values.dt.tz_convert("UTC").dt.tz_localize(None)
        return _make(name, "datetime", values, missing, source_dtype)

    if pd.api.types.is_numeric_dtype(raw):
        values = pd.to_numeric(raw, errors="coerce").astype("float64")
        values = values.where(np.isfinite(values))
        return _numeric_info(name, values, source_dtype)

    # Text / mixed object columns. Work on the distinct values (usually far fewer
    # than rows) and weight every share by how often each value occurs.
    codes, uniques = pd.factorize(non_null, sort=False)
    distinct = pd.Series(uniques, dtype="object").astype(str).str.strip()
    remap, distinct_index = pd.factorize(distinct, sort=False)
    codes = remap[codes]
    distinct = pd.Series(distinct_index, dtype="object")
    weights = np.bincount(codes, minlength=len(distinct))

    def expand(per_distinct: np.ndarray, dtype: str, fill) -> pd.Series:
        out = pd.Series(fill, index=raw.index, dtype=dtype)
        out.loc[non_null.index] = per_distinct[codes]
        return out

    numeric = _coerce_numeric_text(distinct, weights)
    if numeric is not None:
        return _numeric_info(name, expand(numeric, "float64", np.nan), source_dtype)

    lowered = set(distinct.str.lower())
    if len(lowered) <= 2 and lowered <= (_TRUE | _FALSE):
        flags = distinct.str.lower().isin(_TRUE).to_numpy()
        values = pd.Series(pd.NA, index=raw.index, dtype="boolean")
        values.loc[non_null.index] = flags[codes]
        return _make(name, "boolean", values, missing, source_dtype)

    dates = _coerce_datetime_text(distinct, weights)
    if dates is not None:
        values = expand(dates, "datetime64[ns]", pd.NaT)
        return _make(name, "datetime", values, int(values.isna().sum()), source_dtype)

    values = expand(distinct.to_numpy(dtype="object"), "object", np.nan)
    unique = int(len(distinct))
    info = ColumnInfo(name, "categorical", values, valid, missing, unique, source_dtype=source_dtype)
    if unique == valid and valid >= IDENTIFIER_MIN_ROWS:
        info.kind = "text"
        info.is_identifier = True
    elif any(unique > n and unique / valid > ratio for n, ratio in TEXT_RULES):
        info.kind = "text"
    return info


def _make(name: str, kind: str, values: pd.Series, missing: int, source_dtype: str) -> ColumnInfo:
    non_null = values.dropna()
    return ColumnInfo(
        name,
        kind,
        values,
        valid=int(non_null.shape[0]),
        missing=int(missing),
        unique=int(non_null.nunique()),
        source_dtype=source_dtype,
    )


def _numeric_info(name: str, values: pd.Series, source_dtype: str) -> ColumnInfo:
    non_null = values.dropna()
    valid = int(non_null.shape[0])
    unique = int(non_null.nunique())
    info = ColumnInfo(
        name,
        "numeric",
        values,
        valid=valid,
        missing=int(values.shape[0] - valid),
        unique=unique,
        source_dtype=source_dtype,
    )
    if valid == 0:
        info.kind = "empty"
        return info
    arr = non_null.to_numpy()
    whole = bool(np.all(np.mod(arr, 1) == 0))
    span = float(arr.max() - arr.min())
    info.discrete = whole and unique <= DISCRETE_MAX_UNIQUE and span <= DISCRETE_MAX_RANGE
    if whole and unique == valid and valid >= IDENTIFIER_MIN_ROWS:
        ordered = np.sort(non_null.to_numpy())
        consecutive = bool(np.all(np.diff(ordered) == 1))
        info.is_identifier = consecutive or bool(_ID_NAME.search(name))
    return info


def _coerce_numeric_text(distinct: pd.Series, weights: np.ndarray) -> Optional[np.ndarray]:
    """Parse strings like "$52,000", "(1,200)", "3,5" or "45%" as numbers.

    Returns one float per distinct value, or None if the column isn't numeric.
    """
    if distinct.empty:
        return None
    # Codes such as ZIP codes or "007" lose meaning as numbers.
    if distinct.str.match(_LEADING_ZERO_CODE).any():
        return None

    # Fast path: plain numbers stored as text.
    direct = pd.to_numeric(distinct, errors="coerce")
    if direct.notna().all():
        return direct.where(np.isfinite(direct)).to_numpy(dtype="float64")

    cleaned = distinct
    with_comma = distinct[distinct.str.contains(",", regex=False)]
    if not with_comma.empty:
        if with_comma.str.match(_EURO_STYLE).all() and with_comma.str.contains(".", regex=False).any():
            cleaned = distinct.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
        elif with_comma.str.match(_THOUSANDS_COMMA).all():
            cleaned = distinct.str.replace(",", "", regex=False)
        elif with_comma.str.match(_DECIMAL_COMMA).all() and not distinct.str.contains(".", regex=False).any():
            cleaned = distinct.str.replace(",", ".", regex=False)
        else:
            return None

    negative = cleaned.str.match(r"^\(.*\)$").to_numpy(dtype=bool)
    cleaned = cleaned.str.replace(_STRIP_CHARS, "", regex=True).str.strip("()")
    parsed = pd.to_numeric(cleaned, errors="coerce")
    parsed = np.array(parsed.where(np.isfinite(parsed)), dtype="float64")  # writable copy
    ok = ~np.isnan(parsed)
    if weights[ok].sum() < NUMERIC_SHARE * weights.sum():
        return None
    parsed[negative] = -parsed[negative]
    return parsed


def _coerce_datetime_text(distinct: pd.Series, weights: np.ndarray) -> Optional[np.ndarray]:
    """Return one datetime64 per distinct value, or None if these aren't dates."""
    sample = distinct.head(300)
    if sample.str.match(_DATE_LIKE).mean() < DATETIME_SHARE:
        return None
    parsed = None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for fmt in ("ISO8601", "mixed"):
            try:
                # utc=True so mixed offsets ("+02:00", "Z") land on one timeline.
                candidate = pd.to_datetime(distinct, errors="coerce", format=fmt, utc=True)
            except (ValueError, TypeError):
                continue
            ok = candidate.notna().to_numpy()
            if weights[ok].sum() >= DATETIME_SHARE * weights.sum():
                parsed = candidate
                break
    if parsed is None:
        return None
    return parsed.dt.tz_localize(None).to_numpy(dtype="datetime64[ns]")
