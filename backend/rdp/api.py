"""HTTP API. Every route lives under /api and returns JSON."""

from __future__ import annotations

from pathlib import PurePath
from typing import Optional

from flask import Blueprint, current_app, jsonify, request

from . import analysis
from .config import ALLOWED_EXTENSIONS, SAMPLES, Settings
from .errors import APIError, not_found
from .serialize import to_jsonable
from .store import DatasetStore

bp = Blueprint("api", __name__, url_prefix="/api")


def _store() -> DatasetStore:
    return current_app.extensions["rdp_store"]


def _settings() -> Settings:
    return current_app.config["RDP_SETTINGS"]


def ok(payload, status: int = 200):
    return jsonify(to_jsonable(payload)), status


def int_arg(name: str, default: Optional[int], lo: int, hi: int) -> Optional[int]:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise APIError(f"“{name}” must be a whole number.")
    if not lo <= value <= hi:
        raise APIError(f"“{name}” must be between {lo} and {hi}.")
    return value


def str_arg(name: str, choices: Optional[tuple] = None) -> Optional[str]:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None
    if choices and raw not in choices:
        raise APIError(f"“{name}” must be one of: {', '.join(choices)}.")
    return raw


# --------------------------------------------------------------------------- #
@bp.get("/health")
def health():
    settings = _settings()
    return ok(
        {
            "status": "ok",
            "max_upload_mb": settings.max_upload_mb,
            "extensions": sorted(ALLOWED_EXTENSIONS),
        }
    )


@bp.get("/samples")
def list_samples():
    settings = _settings()
    samples = [
        {"id": key, "title": info["title"], "description": info["description"], "file": info["file"]}
        for key, info in SAMPLES.items()
        if (settings.samples_dir / info["file"]).exists()
    ]
    return ok({"samples": samples})


@bp.post("/samples/<sample_id>")
def open_sample(sample_id: str):
    info = SAMPLES.get(sample_id)
    path = _settings().samples_dir / info["file"] if info else None
    if not info or not path.exists():
        raise not_found("That sample dataset isn't available.")
    dataset = _store().create_from_file(info["file"], path.suffix.lower(), path)
    return ok(dataset.meta(), 201)


@bp.post("/datasets")
def upload():
    upload_file = request.files.get("file")
    if upload_file is None:
        raise APIError("Attach a file in the “file” field.")
    original = PurePath((upload_file.filename or "").replace("\\", "/")).name.strip()
    if not original:
        raise APIError("The uploaded file has no name.")
    ext = PurePath(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise APIError(
            f"“{ext or original}” files aren't supported. Upload one of: {allowed}. "
            "Google Sheets can be exported as CSV or Excel from File → Download.",
            status=415,
            code="unsupported_type",
        )
    sheet = request.form.get("sheet") or None
    dataset = _store().create_from_stream(original[:200], ext, upload_file.stream, sheet)
    return ok(dataset.meta(), 201)


@bp.get("/datasets/<dataset_id>")
def get_dataset(dataset_id: str):
    return ok(_store().get(dataset_id).meta())


@bp.delete("/datasets/<dataset_id>")
def delete_dataset(dataset_id: str):
    _store().delete(dataset_id)
    return ok({"deleted": dataset_id})


@bp.post("/datasets/<dataset_id>/sheet")
def change_sheet(dataset_id: str):
    body = request.get_json(silent=True) or {}
    sheet = body.get("sheet")
    if not isinstance(sheet, str) or not sheet:
        raise APIError("Send the sheet name as {\"sheet\": \"…\"}.")
    dataset = _store().get(dataset_id)
    if not dataset.sheets:
        raise APIError("Only Excel workbooks have sheets.")
    return ok(_store().set_sheet(dataset_id, sheet).meta())


@bp.get("/datasets/<dataset_id>/rows")
def rows(dataset_id: str):
    dataset = _store().get(dataset_id)
    sort = request.args.get("sort") or None
    if sort is not None:
        dataset.column(sort)  # validates
    q = (request.args.get("q") or "").strip()[:200] or None
    payload = analysis.query_rows(
        dataset,
        page=int_arg("page", 1, 1, 10_000_000),
        page_size=int_arg("page_size", 50, 1, 500),
        sort=sort,
        order=str_arg("order", ("asc", "desc")) or "asc",
        q=q,
    )
    return ok(payload)


@bp.get("/datasets/<dataset_id>/analysis")
def analyse(dataset_id: str):
    dataset = _store().get(dataset_id)
    info = dataset.column(request.args.get("column"))
    top = int_arg("top", 25, 0, analysis.MAX_CATEGORIES)
    bins = int_arg("bins", None, 2, 100)
    return ok(
        {
            "column": info.name,
            "kind": info.kind,
            "discrete": info.discrete,
            "is_identifier": info.is_identifier,
            "stats": analysis.column_stats(info),
            "distribution": analysis.distribution(info, top=top or None, bins=bins),
        }
    )


@bp.get("/datasets/<dataset_id>/aggregate")
def aggregate(dataset_id: str):
    dataset = _store().get(dataset_id)
    group = dataset.column(request.args.get("group_by"))
    agg = str_arg("agg", analysis.AGGREGATIONS) or "mean"
    metric_name = request.args.get("metric") or None
    metric = dataset.column(metric_name) if metric_name and agg != "count" else None
    payload = analysis.aggregate(
        group,
        metric,
        agg,
        sort=str_arg("sort", ("desc", "asc", "label")),
        limit=int_arg("limit", 50, 1, 200),
    )
    return ok(payload)
