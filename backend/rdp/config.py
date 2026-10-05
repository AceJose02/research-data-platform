"""Runtime configuration, read from environment variables with safe defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    host: str = field(default_factory=lambda: os.environ.get("RDP_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: _env_int("RDP_PORT", 5000))
    debug: bool = field(default_factory=lambda: _env_bool("FLASK_DEBUG", False))

    # Where uploaded datasets are stored. Each dataset gets its own folder.
    data_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("RDP_DATA_DIR", BACKEND_DIR / "data"))
    )
    samples_dir: Path = field(default_factory=lambda: BACKEND_DIR / "samples")

    # Serve the built frontend (frontend/dist) from Flask when it exists, so the
    # whole app can run on one port in production.
    static_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get("RDP_STATIC_DIR", PROJECT_DIR / "frontend" / "dist")
        )
    )

    max_upload_mb: int = field(default_factory=lambda: _env_int("RDP_MAX_UPLOAD_MB", 50))
    # Datasets untouched for this long are deleted from disk.
    dataset_ttl_hours: int = field(default_factory=lambda: _env_int("RDP_DATASET_TTL_HOURS", 24))
    # How many parsed datasets to keep in memory at once (least recently used are evicted
    # and transparently re-read from disk on the next request).
    cache_size: int = field(default_factory=lambda: _env_int("RDP_CACHE_SIZE", 8))

    cors_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "RDP_CORS_ORIGINS",
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        )
    )

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


ALLOWED_EXTENSIONS = {".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".xls"}

SAMPLES = {
    "wellbeing-survey": {
        "file": "research_dataset.csv",
        "title": "Wellbeing survey",
        "description": "400 adults across six Tennessee cities: sleep, exercise, stress, income, and a 0-100 wellbeing index. CSV.",
    },
    "employee-directory": {
        "file": "employee_data.xlsx",
        "title": "Employee directory",
        "description": "160 employees with salaries, managers, and 1,185 quarterly reviews. Excel workbook with three sheets, one built from live formulas.",
    },
}
