"""Statistics, distributions, group comparisons, and paged row queries."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Optional

import numpy as np
import pandas as pd

from .errors import APIError
from .profiling import ColumnInfo
from .serialize import rounded, scalar

if TYPE_CHECKING:  # pragma: no cover
    from .store import Dataset

MAX_CATEGORIES = 1000
AGGREGATIONS = ("mean", "median", "sum", "min", "max", "count")


# --------------------------------------------------------------------------- #
# Summaries
# --------------------------------------------------------------------------- #
def column_summary(info: ColumnInfo) -> dict:
    """A one-line summary for the codebook listing."""
    values = info.values.dropna()
    if info.kind == "numeric" and not values.empty:
        return {
            "mean": rounded(values.mean()),
            "std": rounded(values.std()) if len(values) > 1 else None,
            "min": rounded(values.min()),
            "max": rounded(values.max()),
        }
    if info.kind in ("categorical", "text") and not values.empty:
        counts = values.value_counts()
        return {
            "mode": scalar(counts.index[0]),
            "mode_pct": rounded(counts.iloc[0] / len(values) * 100, 1),
        }
    if info.kind == "boolean" and not values.empty:
        return {"true_pct": rounded(values.astype(bool).mean() * 100, 1)}
    if info.kind == "datetime" and not values.empty:
        return {"min": scalar(values.min()), "max": scalar(values.max())}
    return {}


def column_meta(info: ColumnInfo) -> dict:
    return {
        "name": info.name,
        "kind": info.kind,
        "discrete": info.discrete,
        "is_identifier": info.is_identifier,
        "valid": info.valid,
        "missing": info.missing,
        "missing_pct": round(info.missing_pct, 2),
        "unique": info.unique,
        "summary": column_summary(info),
    }


def column_stats(info: ColumnInfo) -> dict:
    base = {
        "valid": info.valid,
        "missing": info.missing,
        "missing_pct": round(info.missing_pct, 2),
        "unique": info.unique,
    }
    values = info.values.dropna()
    if values.empty:
        return base

    if info.kind == "numeric":
        n = len(values)
        q1, median, q3 = (float(x) for x in values.quantile([0.25, 0.5, 0.75]))
        std = float(values.std()) if n > 1 else None
        base.update(
            mean=rounded(values.mean()),
            std=rounded(std),
            sem=rounded(std / math.sqrt(n)) if std is not None else None,
            min=rounded(values.min()),
            q1=rounded(q1),
            median=rounded(median),
            q3=rounded(q3),
            max=rounded(values.max()),
            iqr=rounded(q3 - q1),
            range=rounded(values.max() - values.min()),
            sum=rounded(values.sum()),
            skewness=rounded(values.skew()) if n >= 3 else None,
        )
    elif info.kind in ("categorical", "text"):
        counts = values.value_counts()
        lengths = values.astype(str).str.len()
        base.update(
            mode=scalar(counts.index[0]),
            mode_count=int(counts.iloc[0]),
            mode_pct=rounded(counts.iloc[0] / len(values) * 100, 2),
            mean_length=rounded(lengths.mean(), 1),
        )
    elif info.kind == "boolean":
        flags = values.astype(bool)
        true_count = int(flags.sum())
        base.update(
            true_count=true_count,
            false_count=int(len(flags) - true_count),
            true_pct=rounded(true_count / len(flags) * 100, 2),
        )
    elif info.kind == "datetime":
        lo, hi = values.min(), values.max()
        base.update(
            min=scalar(lo),
            max=scalar(hi),
            median=scalar(values.quantile(0.5)),
            span_days=rounded((hi - lo).total_seconds() / 86400, 2),
        )
    return base


# --------------------------------------------------------------------------- #
# Distributions
# --------------------------------------------------------------------------- #
def distribution(info: ColumnInfo, top: Optional[int] = None, bins: Optional[int] = None) -> dict:
    values = info.values.dropna()
    result: dict = {"missing": info.missing, "total": info.valid}

    if values.empty:
        result.update(type="none", items=[], note="This column has no values to chart.")
        return result

    if info.kind == "numeric":
        result["reference"] = {
            "mean": rounded(values.mean()),
            "median": rounded(values.median()),
        }
        if info.discrete and bins is None:
            return {**result, **_discrete(values)}
        return {**result, **_histogram(values, bins)}

    if info.kind == "datetime":
        return {**result, **_timeline(values)}

    if info.is_identifier:
        result.update(
            type="none",
            items=[],
            note="Every value is unique, so there is no distribution to chart. "
            "This looks like an identifier column.",
        )
        return result

    if info.kind == "boolean":
        values = values.astype(bool).map({True: "True", False: "False"})
    return {**result, **_categorical(values, top)}


def _discrete(values: pd.Series) -> dict:
    counts = values.value_counts().sort_index()
    total = int(counts.sum())
    items = [
        {
            "label": _format_number(v),
            "value": rounded(v),
            "count": int(c),
            "pct": round(c / total * 100, 2),
        }
        for v, c in counts.items()
    ]
    return {"type": "discrete", "items": items}


def _histogram(values: pd.Series, bins: Optional[int]) -> dict:
    arr = values.to_numpy(dtype="float64")
    lo, hi = float(arr.min()), float(arr.max())
    if lo == hi:
        edges = np.array([lo - 0.5, hi + 0.5])
    else:
        if bins is None:
            auto = len(np.histogram_bin_edges(arr, bins="auto")) - 1
            target = int(min(max(auto, 5), 30))
        else:
            target = int(min(max(bins, 2), 100))
        edges = _nice_edges(lo, hi, target)

    counts, edges = np.histogram(arr, bins=edges)
    total = int(counts.sum())
    items = []
    for i, count in enumerate(counts):
        start, end = float(edges[i]), float(edges[i + 1])
        items.append(
            {
                "label": f"{_format_number(start)}–{_format_number(end)}",
                "start": rounded(start, 10),
                "end": rounded(end, 10),
                "count": int(count),
                "pct": round(count / total * 100, 2) if total else 0.0,
            }
        )
    return {"type": "histogram", "items": items, "bins": len(items)}


def _nice_edges(lo: float, hi: float, target: int) -> np.ndarray:
    """Round bin edges to 1-2-2.5-5 steps so labels read like 40,000–50,000."""
    raw_step = (hi - lo) / max(target, 1)
    magnitude = 10 ** math.floor(math.log10(raw_step))
    step = magnitude * 10
    for multiple in (1, 2, 2.5, 5, 10):
        if raw_step <= multiple * magnitude:
            step = multiple * magnitude
            break
    start = math.floor(lo / step) * step
    end = math.ceil(hi / step) * step
    if end <= start:
        end = start + step
    count = int(round((end - start) / step))
    edges = np.array([round(start + i * step, 10) for i in range(count + 1)])
    return edges


def _timeline(values: pd.Series) -> dict:
    span_days = (values.max() - values.min()).total_seconds() / 86400
    if span_days <= 62:
        freq, unit = "D", "day"
    elif span_days <= 6 * 366:
        freq, unit = "M", "month"
    else:
        freq, unit = "Y", "year"
    periods = values.dt.to_period(freq)
    counts = periods.value_counts().sort_index()
    full = pd.period_range(counts.index.min(), counts.index.max(), freq=freq)
    counts = counts.reindex(full, fill_value=0)
    total = int(counts.sum())
    items = [
        {"label": str(p), "count": int(c), "pct": round(c / total * 100, 2)}
        for p, c in counts.items()
    ]
    return {"type": "timeline", "unit": unit, "items": items}


def _categorical(values: pd.Series, top: Optional[int]) -> dict:
    counts = values.value_counts()
    total = int(counts.sum())
    limit = MAX_CATEGORIES if not top else min(top, MAX_CATEGORIES)
    shown, rest = counts.iloc[:limit], counts.iloc[limit:]
    items = [
        {"label": str(label), "count": int(c), "pct": round(c / total * 100, 2)}
        for label, c in shown.items()
    ]
    other = None
    if not rest.empty:
        other = {
            "count": int(rest.sum()),
            "categories": int(rest.shape[0]),
            "pct": round(rest.sum() / total * 100, 2),
        }
    return {
        "type": "categorical",
        "items": items,
        "other": other,
        "categories": int(counts.shape[0]),
    }


# --------------------------------------------------------------------------- #
# Group comparison
# --------------------------------------------------------------------------- #
def groupable(info: ColumnInfo) -> bool:
    if info.is_identifier or info.kind in ("empty", "datetime"):
        return False
    if info.kind == "numeric":
        return info.discrete
    return True


def aggregate(
    group: ColumnInfo,
    metric: Optional[ColumnInfo],
    agg: str,
    sort: Optional[str] = None,
    limit: int = 50,
) -> dict:
    if agg not in AGGREGATIONS:
        raise APIError(f"Unknown aggregation “{agg}”. Use one of: {', '.join(AGGREGATIONS)}.")
    if not groupable(group):
        if group.is_identifier:
            reason = "every value is unique, so each group would contain a single row"
        elif group.kind == "numeric":
            reason = "it is a continuous number; pick a column with a few distinct labels"
        else:
            reason = f"{group.kind} columns can't be used as groups"
        raise APIError(f"Can't group by “{group.name}”: {reason}.")
    if agg != "count":
        if metric is None:
            raise APIError("Choose a numeric column to summarise.")
        if metric.kind != "numeric":
            raise APIError(f"“{metric.name}” isn't numeric, so it can only be counted.")

    keys = group.values
    if group.kind == "boolean":
        keys = keys.astype("object").map({True: "True", False: "False"})
    frame = pd.DataFrame({"g": keys})
    if agg != "count":
        frame["m"] = metric.values
    frame = frame.dropna(subset=["g"])

    sizes = frame.groupby("g", sort=False).size()
    total_groups = int(sizes.shape[0])
    truncated = total_groups > limit
    if truncated:
        keep = sizes.sort_values(ascending=False).index[:limit]
        frame = frame[frame["g"].isin(keep)]
        sizes = sizes.loc[keep]

    if agg == "count":
        result = sizes.astype("float64")
        counts = sizes
        overall = float(len(frame))
    else:
        grouped = frame.groupby("g", sort=False)["m"]
        result = grouped.agg(agg)
        counts = grouped.count()
        overall_series = metric.values.dropna()
        overall = float(getattr(overall_series, agg)()) if not overall_series.empty else None

    default_sort = "label" if (group.kind == "numeric" or group.kind == "boolean") else "desc"
    sort = sort or default_sort
    if sort == "label":
        result = result.sort_index(key=_label_sort_key)
    elif sort == "asc":
        result = result.sort_values(ascending=True, na_position="last")
    else:
        result = result.sort_values(ascending=False, na_position="last")

    items = []
    for key, value in result.items():
        label = _format_number(key) if isinstance(key, (int, float, np.number)) else str(key)
        items.append(
            {
                "label": label,
                "value": rounded(value),
                "n": int(counts.get(key, 0)),
                "rows": int(sizes.get(key, 0)),
            }
        )

    return {
        "group_by": group.name,
        "metric": metric.name if metric is not None and agg != "count" else None,
        "agg": agg,
        "sort": sort,
        "overall": rounded(overall),
        "items": items,
        "total_groups": total_groups,
        "truncated": truncated,
        "missing_groups": int(group.missing),
    }


def _label_sort_key(index: pd.Index) -> pd.Index:
    numeric = pd.to_numeric(pd.Series(index, dtype="object"), errors="coerce")
    if numeric.notna().all():
        return pd.Index(numeric)
    return pd.Index([str(v).lower() for v in index])


# --------------------------------------------------------------------------- #
# Rows
# --------------------------------------------------------------------------- #
def query_rows(
    dataset: "Dataset",
    page: int = 1,
    page_size: int = 50,
    sort: Optional[str] = None,
    order: str = "asc",
    q: Optional[str] = None,
) -> dict:
    frame = dataset.frame
    index = frame.index

    if q:
        matches = dataset.search_index().str.contains(q.lower(), regex=False)
        index = index[matches.to_numpy()]

    if sort:
        info = dataset.column(sort)
        key = info.values.loc[index]
        if info.kind in ("categorical", "text"):
            key = key.astype("object").map(lambda v: v.lower() if isinstance(v, str) else v)
        elif info.kind == "boolean":
            key = key.astype("Float64")
        key = key.sort_values(ascending=(order != "desc"), na_position="last", kind="mergesort")
        index = key.index

    total = int(len(index))
    pages = max(1, math.ceil(total / page_size))
    page = min(max(page, 1), pages)
    window = index[(page - 1) * page_size : page * page_size]
    block = frame.loc[window]

    rows = [[scalar(v) for v in row] for row in block.itertuples(index=False, name=None)]
    return {
        "columns": list(frame.columns),
        "rows": rows,
        "row_numbers": [int(i) + 1 for i in window],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "sort": sort,
        "order": order if sort else None,
        "q": q or None,
    }


def _format_number(value) -> str:
    v = float(value)
    if v.is_integer():
        return f"{int(v):,}"
    return f"{v:,.6g}" if abs(v) >= 1e-4 else f"{v:.3g}"
