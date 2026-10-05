"""Read uploaded files into clean DataFrames.

Handles the things that commonly break naive ``pd.read_csv`` calls on real
research data: non-UTF-8 encodings (Excel's Windows-1252 exports), semicolon or
tab delimiters, stray whitespace, blank rows, ``Unnamed: 7`` filler columns, and
Excel workbooks with more than one sheet.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from .errors import unprocessable

EXCEL_ENGINES = {".xlsx": "openpyxl", ".xlsm": "openpyxl", ".xls": "xlrd"}
CSV_ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")
SNIFF_BYTES = 64 * 1024
PROBE_ROWS = 10_000
_LEADING_ZERO = re.compile(r"^0\d+$")


def is_excel(ext: str) -> bool:
    return ext in EXCEL_ENGINES


def list_sheets(path: Path, ext: str) -> list[str]:
    if not is_excel(ext):
        return []
    try:
        with pd.ExcelFile(path, engine=EXCEL_ENGINES[ext]) as book:
            return [str(name) for name in book.sheet_names]
    except Exception as exc:  # noqa: BLE001 - surface a readable message
        raise unprocessable(f"This doesn't look like a valid Excel file ({_short(exc)}).")


def read_dataset(path: Path, ext: str, sheet: Optional[str] = None) -> tuple[pd.DataFrame, list[str], Optional[str]]:
    """Return (frame, sheet_names, active_sheet)."""
    if is_excel(ext):
        sheets = list_sheets(path, ext)
        if not sheets:
            raise unprocessable("The workbook has no sheets.")
        if sheet is not None and sheet not in sheets:
            raise unprocessable(f'The workbook has no sheet named "{sheet}".')
        active = sheet if sheet is not None else sheets[0]
        try:
            frame = _read_sheet(path, ext, active)
        except Exception as exc:  # noqa: BLE001
            raise unprocessable(f'Couldn\'t read sheet "{active}" ({_short(exc)}).')
        frame = clean_frame(frame)
        if frame.empty and sheet is None:
            # The first sheet is often a cover page; fall back to the first sheet with data.
            for candidate in sheets[1:]:
                other = clean_frame(_read_sheet(path, ext, candidate))
                if not other.empty:
                    frame, active = other, candidate
                    break
        if frame.empty:
            raise unprocessable(f'Sheet "{active}" has no data.')
        return frame, sheets, active

    frame = clean_frame(_read_delimited(path, ext))
    if frame.empty:
        raise unprocessable("The file has a header row but no data rows.")
    return frame, [], None


def _read_sheet(path: Path, ext: str, sheet: str) -> pd.DataFrame:
    """Read one worksheet without letting pandas guess types from text.

    ``pd.read_excel`` silently turns text cells that look like numbers into
    numbers, so a ZIP code stored as the text "02139" would come back as 2139.0.
    Reading with ``dtype=object`` keeps every cell as Excel stored it; types are
    then restored column by column, except for columns of leading-zero codes.
    """
    raw = pd.read_excel(path, sheet_name=sheet, engine=EXCEL_ENGINES[ext], dtype=object)
    columns = {
        col: raw[col] if _has_leading_zero_text(raw[col]) else raw[col].infer_objects()
        for col in raw.columns
    }
    return pd.DataFrame(columns, index=raw.index)


def _has_leading_zero_text(series: pd.Series) -> bool:
    """True if the column holds text codes such as "02139" or "007"."""
    values = series.dropna()
    text = values[values.map(lambda v: isinstance(v, str))]
    return bool(not text.empty and text.str.strip().str.match(_LEADING_ZERO).any())


def _read_delimited(path: Path, ext: str) -> pd.DataFrame:
    head = path.read_bytes()[:SNIFF_BYTES]
    if not head.strip():
        raise unprocessable("The file is empty.")

    last_error: Optional[Exception] = None
    for encoding in CSV_ENCODINGS:
        try:
            sample = head.decode(encoding)
        except UnicodeDecodeError as exc:
            # A multi-byte character may be cut off at the sample boundary; only
            # give up on this encoding if the error is not at the very end.
            if exc.start < len(head) - 4:
                last_error = exc
                continue
            sample = head[: exc.start].decode(encoding)

        sep = "\t" if ext == ".tsv" else _sniff_delimiter(sample)
        options = dict(sep=sep, encoding=encoding, skipinitialspace=True)
        try:
            # Codes like ZIP "02139" or ID "007" would lose their leading zeros if
            # parsed as numbers. Probe a sample as text to find such columns, then
            # keep only those as strings in the full read.
            probe = pd.read_csv(path, dtype=str, nrows=PROBE_ROWS, **options)
            as_text = {
                col: str
                for col in probe.columns
                if probe[col].dropna().str.match(_LEADING_ZERO).any()
            }
            return pd.read_csv(path, dtype=as_text or None, low_memory=False, **options)
        except UnicodeDecodeError as exc:
            last_error = exc
            continue
        except pd.errors.EmptyDataError:
            raise unprocessable("The file is empty.")
        except pd.errors.ParserError as exc:
            raise unprocessable(
                "Some rows have a different number of fields than the header "
                f"({_short(exc)}). Check for unquoted commas or a stray line break."
            )
    raise unprocessable(f"Couldn't detect the text encoding of this file ({_short(last_error)}).")


def _sniff_delimiter(sample: str) -> str:
    lines = [line for line in sample.splitlines() if line.strip()][:50]
    if not lines:
        return ","
    try:
        dialect = csv.Sniffer().sniff("\n".join(lines), delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame.columns = _clean_column_names(frame.columns)

    for col in frame.columns:
        series = frame[col]
        if pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series):
            try:
                stripped = series.str.strip()
            except AttributeError:
                continue  # object column with no strings (e.g. Excel time values)
            series = stripped.where(stripped.notna(), series)
            series = series.mask(series.eq("").fillna(False).astype(bool))
            frame[col] = series

    frame = frame.dropna(how="all")
    empty_filler = [
        c for c in frame.columns if c.startswith("Unnamed: ") and frame[c].isna().all()
    ]
    frame = frame.drop(columns=empty_filler)
    return frame.reset_index(drop=True)


def _clean_column_names(columns) -> list[str]:
    names: list[str] = []
    seen: dict[str, int] = {}
    for i, raw in enumerate(columns):
        name = "" if raw is None or (isinstance(raw, float) and np.isnan(raw)) else str(raw).strip()
        if not name:
            name = f"column_{i + 1}"
        base = name
        if name in seen:
            seen[base] += 1
            name = f"{base} ({seen[base]})"
            while name in seen:
                seen[base] += 1
                name = f"{base} ({seen[base]})"
        seen.setdefault(name, 1)
        names.append(name)
    return names


def _short(exc: Optional[Exception], limit: int = 160) -> str:
    text = str(exc) if exc else "unknown error"
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
