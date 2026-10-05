"""Dataset storage.

Each upload gets its own random ID and folder::

    data/<id>/source.csv   the original file, saved under a fixed name
    data/<id>/meta.json    original filename, active sheet, timestamps

Parsed datasets are cached in memory (least-recently-used). If the server
restarts or a dataset is evicted, it's transparently re-read from disk.
Folders that haven't been touched within the TTL are deleted.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Callable, Optional

import pandas as pd

from .analysis import column_meta
from .errors import not_found
from .loader import read_dataset
from .profiling import ColumnInfo, profile_column

log = logging.getLogger(__name__)

_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_TOUCH_INTERVAL = 60  # seconds between meta.json mtime refreshes


@dataclass
class Dataset:
    id: str
    name: str
    ext: str
    folder: Path
    sheets: list
    sheet: Optional[str]
    frame: pd.DataFrame = field(repr=False)
    columns: "OrderedDict[str, ColumnInfo]" = field(repr=False)
    created_at: float
    _search: Optional[pd.Series] = field(default=None, repr=False)
    _touched: float = 0.0

    @property
    def source(self) -> Path:
        return self.folder / f"source{self.ext}"

    def column(self, name: Optional[str]) -> ColumnInfo:
        if not name:
            raise not_found("Choose a column.")
        info = self.columns.get(name)
        if info is None:
            raise not_found(f"There's no column named “{name}” in this dataset.")
        return info

    def search_index(self) -> pd.Series:
        """Lower-cased text of each row, built once, for fast substring search."""
        if self._search is None:
            parts = []
            for col in self.frame.columns:
                s = self.frame[col]
                parts.append(s.astype(str).where(s.notna(), "").astype("object"))
            if not parts:
                self._search = pd.Series([], dtype="object")
            else:
                joined = parts[0]
                for part in parts[1:]:
                    joined = joined + "\x1f" + part
                self._search = joined.str.lower()
        return self._search

    def meta(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "format": self.ext.lstrip("."),
            "rows": int(len(self.frame)),
            "column_count": int(len(self.columns)),
            "sheets": self.sheets,
            "sheet": self.sheet,
            "created_at": datetime.fromtimestamp(self.created_at, tz=timezone.utc).isoformat(),
            "columns": [column_meta(info) for info in self.columns.values()],
        }


class DatasetStore:
    def __init__(self, root: Path, cache_size: int = 8, ttl_seconds: int = 24 * 3600):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.cache_size = max(1, cache_size)
        self.ttl_seconds = ttl_seconds
        self._cache: "OrderedDict[str, Dataset]" = OrderedDict()
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ create
    def create(self, original_name: str, ext: str, write: Callable[[Path], None],
               sheet: Optional[str] = None) -> Dataset:
        """Create a dataset. ``write`` saves the file content to the given path."""
        self.cleanup()
        dataset_id = uuid.uuid4().hex
        folder = self.root / dataset_id
        folder.mkdir(parents=True)
        source = folder / f"source{ext}"
        try:
            write(source)
            dataset = self._build(dataset_id, original_name, ext, folder, sheet, time.time())
            self._write_meta(dataset)
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        self._remember(dataset)
        return dataset

    def create_from_stream(self, original_name: str, ext: str, stream: BinaryIO,
                           sheet: Optional[str] = None) -> Dataset:
        def write(path: Path) -> None:
            with path.open("wb") as fh:
                shutil.copyfileobj(stream, fh, length=1024 * 1024)

        return self.create(original_name, ext, write, sheet)

    def create_from_file(self, original_name: str, ext: str, src: Path,
                         sheet: Optional[str] = None) -> Dataset:
        return self.create(original_name, ext, lambda path: shutil.copyfile(src, path), sheet)

    # --------------------------------------------------------------------- read
    def get(self, dataset_id: str) -> Dataset:
        if not isinstance(dataset_id, str) or not _ID_RE.match(dataset_id):
            raise not_found("This dataset doesn't exist or has expired. Upload it again.")
        with self._lock:
            dataset = self._cache.get(dataset_id)
            if dataset is not None:
                self._cache.move_to_end(dataset_id)
        if dataset is None:
            dataset = self._load(dataset_id)
            self._remember(dataset)
        self._touch(dataset)
        return dataset

    def set_sheet(self, dataset_id: str, sheet: str) -> Dataset:
        current = self.get(dataset_id)
        updated = self._build(current.id, current.name, current.ext, current.folder,
                              sheet, current.created_at)
        self._write_meta(updated)
        self._remember(updated)
        return updated

    def delete(self, dataset_id: str) -> None:
        dataset = self.get(dataset_id)
        with self._lock:
            self._cache.pop(dataset.id, None)
        shutil.rmtree(dataset.folder, ignore_errors=True)

    def cleanup(self) -> int:
        """Delete dataset folders that haven't been used within the TTL."""
        if self.ttl_seconds <= 0:
            return 0
        cutoff = time.time() - self.ttl_seconds
        removed = 0
        for folder in self.root.iterdir():
            if not folder.is_dir() or not _ID_RE.match(folder.name):
                continue
            meta = folder / "meta.json"
            stamp = meta.stat().st_mtime if meta.exists() else folder.stat().st_mtime
            if stamp < cutoff:
                with self._lock:
                    self._cache.pop(folder.name, None)
                shutil.rmtree(folder, ignore_errors=True)
                removed += 1
        if removed:
            log.info("Removed %d expired dataset(s)", removed)
        return removed

    # ---------------------------------------------------------------- internals
    def _build(self, dataset_id: str, name: str, ext: str, folder: Path,
               sheet: Optional[str], created_at: float) -> Dataset:
        frame, sheets, active = read_dataset(folder / f"source{ext}", ext, sheet)
        columns: "OrderedDict[str, ColumnInfo]" = OrderedDict(
            (col, profile_column(col, frame[col])) for col in frame.columns
        )
        return Dataset(
            id=dataset_id,
            name=name,
            ext=ext,
            folder=folder,
            sheets=sheets,
            sheet=active,
            frame=frame,
            columns=columns,
            created_at=created_at,
            _touched=time.time(),
        )

    def _load(self, dataset_id: str) -> Dataset:
        folder = self.root / dataset_id
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            raise not_found("This dataset doesn't exist or has expired. Upload it again.")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return self._build(dataset_id, meta["name"], meta["ext"], folder,
                           meta.get("sheet"), float(meta.get("created_at", time.time())))

    def _write_meta(self, dataset: Dataset) -> None:
        meta = {
            "id": dataset.id,
            "name": dataset.name,
            "ext": dataset.ext,
            "sheet": dataset.sheet,
            "created_at": dataset.created_at,
        }
        (dataset.folder / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def _remember(self, dataset: Dataset) -> None:
        with self._lock:
            self._cache[dataset.id] = dataset
            self._cache.move_to_end(dataset.id)
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)

    def _touch(self, dataset: Dataset) -> None:
        now = time.time()
        if now - dataset._touched < _TOUCH_INTERVAL:
            return
        dataset._touched = now
        meta = dataset.folder / "meta.json"
        try:
            meta.touch()
        except OSError:
            pass
