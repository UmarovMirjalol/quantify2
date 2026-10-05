"""CSV historical data loading and validation."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from pydantic import BaseModel, Field


REQUIRED_COLUMNS = ("date", "open", "high", "low", "close", "volume")


class DataValidationError(Exception):
    """Raised when uploaded market data fails validation."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rows: int = 0
    date_start: str | None = None
    date_end: str | None = None


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def validate_ohlcv_dataframe(df: pd.DataFrame) -> ValidationResult:
    """Validate an OHLCV DataFrame and return structured errors."""
    errors: list[str] = []
    warnings: list[str] = []

    if df is None or df.empty:
        return ValidationResult(valid=False, errors=["Dataset is empty"])

    df = _normalize_columns(df)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        errors.append(f"Missing required columns: {', '.join(missing)}")
        return ValidationResult(valid=False, errors=errors)

    # Dates
    dates = pd.to_datetime(df["date"], errors="coerce", utc=False)
    if dates.isna().any():
        bad = int(dates.isna().sum())
        errors.append(f"Invalid dates found in {bad} row(s)")

    if dates.duplicated().any():
        dup = int(dates.duplicated().sum())
        errors.append(f"Duplicate dates found ({dup} duplicate(s))")

    # Numeric prices
    for col in ("open", "high", "low", "close", "volume"):
        numeric = pd.to_numeric(df[col], errors="coerce")
        if numeric.isna().any():
            n = int(numeric.isna().sum())
            errors.append(f"Non-numeric or missing values in '{col}' ({n} row(s))")
        else:
            if col != "volume" and (numeric <= 0).any():
                errors.append(f"'{col}' contains non-positive prices")
            if col == "volume" and (numeric < 0).any():
                errors.append("'volume' contains negative values")

    if not errors:
        # OHLC consistency
        o = pd.to_numeric(df["open"])
        h = pd.to_numeric(df["high"])
        l = pd.to_numeric(df["low"])
        c = pd.to_numeric(df["close"])
        if ((h < l) | (h < o) | (h < c) | (l > o) | (l > c)).any():
            warnings.append("Some rows have inconsistent OHLC relationships (high/low vs open/close)")

        if not dates.is_monotonic_increasing:
            warnings.append("Data was not sorted by date; it will be sorted ascending")

    date_start = None
    date_end = None
    if not dates.isna().all():
        valid_dates = dates.dropna()
        if not valid_dates.empty:
            date_start = valid_dates.min().strftime("%Y-%m-%d")
            date_end = valid_dates.max().strftime("%Y-%m-%d")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        rows=len(df),
        date_start=date_start,
        date_end=date_end,
    )


def load_ohlcv_csv(path: str | Path) -> pd.DataFrame:
    """Load and validate a CSV file into a clean OHLCV DataFrame indexed by date."""
    path = Path(path)
    if not path.exists():
        raise DataValidationError([f"File not found: {path}"])

    try:
        df = pd.read_csv(path)
    except Exception as exc:  # noqa: BLE001
        raise DataValidationError([f"Failed to parse CSV: {exc}"]) from exc

    result = validate_ohlcv_dataframe(df)
    if not result.valid:
        raise DataValidationError(result.errors)

    df = _normalize_columns(df)
    df["date"] = pd.to_datetime(df["date"])
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.sort_values("date").drop_duplicates(subset=["date"], keep="first")
    df = df.reset_index(drop=True)
    df["date"] = df["date"].dt.tz_localize(None)
    return df[["date", "open", "high", "low", "close", "volume"]]


def load_ohlcv_bytes(content: bytes, filename: str = "upload.csv") -> tuple[pd.DataFrame, ValidationResult]:
    """Load OHLCV data from uploaded bytes."""
    from io import BytesIO

    try:
        df = pd.read_csv(BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        raise DataValidationError([f"Failed to parse CSV '{filename}': {exc}"]) from exc

    result = validate_ohlcv_dataframe(df)
    if not result.valid:
        raise DataValidationError(result.errors)

    df = _normalize_columns(df)
    df["date"] = pd.to_datetime(df["date"])
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.sort_values("date").drop_duplicates(subset=["date"], keep="first")
    df = df.reset_index(drop=True)
    df["date"] = df["date"].dt.tz_localize(None)
    clean = df[["date", "open", "high", "low", "close", "volume"]]
    return clean, result
