"""Data loading helpers."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.config import DATA_DIR, UPLOAD_DIR
from app.data.validators import DataValidationError, load_ohlcv_csv


def resolve_dataset_path(dataset_id: str) -> Path:
    """Resolve a dataset id to a file path under data/ or uploads/."""
    candidates = [
        DATA_DIR / dataset_id,
        UPLOAD_DIR / dataset_id,
        DATA_DIR / f"{dataset_id}.csv",
        UPLOAD_DIR / f"{dataset_id}.csv",
        Path(dataset_id),
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return path
    raise DataValidationError([f"Dataset not found: {dataset_id}"])


def load_dataset(dataset_id: str) -> pd.DataFrame:
    """Load a validated OHLCV dataset by id or filename."""
    path = resolve_dataset_path(dataset_id)
    return load_ohlcv_csv(path)


def list_available_datasets() -> list[dict[str, str]]:
    """List sample and uploaded datasets."""
    items: list[dict[str, str]] = []
    for folder, source in ((DATA_DIR, "sample"), (UPLOAD_DIR, "upload")):
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.csv")):
            items.append(
                {
                    "id": path.name,
                    "name": path.name,
                    "source": source,
                    "path": str(path),
                }
            )
    return items
