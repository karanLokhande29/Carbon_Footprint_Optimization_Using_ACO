"""
carbon.py — FastAPI router for carbon emission analytics endpoints.

Endpoints
---------
GET /carbon              → Aggregated emission summary per model and type
GET /carbon/detail       → Full per-run emission records (paginated)
GET /carbon/epoch/{model}→ Per-epoch emission breakdown for a DL model

Data source
-----------
../carbon_aco_artifacts/emissions.csv  (consolidated, ~219 rows after KNN removal)

Caching
-------
The CSV is read from disk once and cached in module-level state.
Cache is invalidated when the file's mtime changes (safe for re-runs).
"""

from __future__ import annotations

import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("carbon")

router = APIRouter(prefix="/carbon", tags=["Carbon Emissions"])

_EMISSIONS_PATH = (
    Path(__file__).resolve().parent.parent / "carbon_aco_artifacts" / "emissions.csv"
)

# ---------------------------------------------------------------------------
# Disk cache (mtime-invalidated)
# ---------------------------------------------------------------------------
_cache_df:    pd.DataFrame | None = None
_cache_mtime: float = 0.0


def _load_emissions() -> pd.DataFrame:
    """Load (and cache) the consolidated emissions CSV."""
    global _cache_df, _cache_mtime

    if not _EMISSIONS_PATH.exists():
        raise FileNotFoundError(f"emissions.csv not found at {_EMISSIONS_PATH}")

    current_mtime = os.path.getmtime(_EMISSIONS_PATH)
    if _cache_df is not None and current_mtime == _cache_mtime:
        return _cache_df                         # fast path: still fresh

    logger.info("[carbon] (Re)loading emissions.csv from disk …")
    df = pd.read_csv(_EMISSIONS_PATH)
    _cache_df    = df
    _cache_mtime = current_mtime
    return df


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class ModelEmissionSummary(BaseModel):
    model_name:       str
    total_emission_kg: float
    run_count:         int
    avg_duration_s:    float


class EmissionSummaryResponse(BaseModel):
    total_emission_kg_all:  float
    by_model:               list[ModelEmissionSummary]
    by_type: dict[str, float]               # { "deep_learning": ..., "classical": ... }
    record_count:           int
    csv_source:             str


class EmissionDetailRow(BaseModel):
    timestamp:     Optional[str]
    project_name:  Optional[str]
    duration_s:    Optional[float]
    emission_kg:   Optional[float]
    cpu_power_w:   Optional[float]
    gpu_power_w:   Optional[float]
    source_file:   Optional[str]


class EmissionDetailResponse(BaseModel):
    total:  int
    page:   int
    limit:  int
    data:   list[EmissionDetailRow]


class EpochEmissionRow(BaseModel):
    epoch:       int
    emission_kg: float
    duration_s:  float


class EpochEmissionResponse(BaseModel):
    model:          str
    epoch_count:    int
    total_emission: float
    epochs:         list[EpochEmissionRow]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _classify_project(project_name: str) -> str:
    """Map a project_name string to 'deep_learning', 'classical', or 'meta'."""
    n = str(project_name).lower()
    if n.startswith("classical_"):
        return "classical"
    if any(k in n for k in ("resnet", "efficientnet", "vit", "embedding")):
        return "deep_learning"
    return "meta"   # aco_optimization, etc.


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=EmissionSummaryResponse, summary="Aggregated emission summary")
async def get_carbon_summary() -> EmissionSummaryResponse:
    """
    Returns the aggregated carbon emission summary:
    * Total kg CO₂ across all tracked runs
    * Per-model breakdown (summed across all epochs / runs)
    * Per-type breakdown (deep_learning vs classical)
    """
    try:
        df = _load_emissions()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Use 'emissions' column (kg CO₂) and 'duration' column (seconds)
    df = df.copy()
    df["emissions"] = pd.to_numeric(df["emissions"], errors="coerce").fillna(0.0)
    df["duration"]  = pd.to_numeric(df.get("duration",  pd.Series(0.0, index=df.index)), errors="coerce").fillna(0.0)

    # Derive a canonical model name from the project_name field
    # e.g. "resnet50_e12" → "resnet50", "classical_svm" → "svm"
    def _canonical_model(pname: str) -> str:
        pname = str(pname).lower()
        for prefix in ["classical_"]:
            pname = pname.replace(prefix, "")
        # strip trailing _eN, _total, _emissions
        for suffix_marker in ["_e", "_total", "_emission"]:
            idx = pname.find(suffix_marker)
            if idx != -1:
                pname = pname[:idx]
        return pname

    df["canonical_model"] = df["project_name"].apply(_canonical_model)

    # Per-model aggregation
    by_model_df = (
        df.groupby("canonical_model")
        .agg(
            total_emission_kg=("emissions", "sum"),
            run_count=("emissions", "count"),
            avg_duration_s=("duration", "mean"),
        )
        .reset_index()
        .rename(columns={"canonical_model": "model_name"})
        .sort_values("total_emission_kg", ascending=False)
    )

    by_model = [
        ModelEmissionSummary(
            model_name=row["model_name"],
            total_emission_kg=round(float(row["total_emission_kg"]), 10),
            run_count=int(row["run_count"]),
            avg_duration_s=round(float(row["avg_duration_s"]), 3),
        )
        for _, row in by_model_df.iterrows()
    ]

    # By type
    df["type"] = df["project_name"].apply(_classify_project)
    by_type_raw = df.groupby("type")["emissions"].sum().to_dict()
    by_type = {k: round(float(v), 10) for k, v in by_type_raw.items()}

    return EmissionSummaryResponse(
        total_emission_kg_all=round(float(df["emissions"].sum()), 10),
        by_model=by_model,
        by_type=by_type,
        record_count=len(df),
        csv_source=str(_EMISSIONS_PATH),
    )


@router.get("/detail", response_model=EmissionDetailResponse, summary="Full emission records (paginated)")
async def get_carbon_detail(
    page:  int = Query(1,  ge=1,   description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=500, description="Records per page"),
    model: Optional[str] = Query(None, description="Filter by model name substring"),
) -> EmissionDetailResponse:
    """
    Returns the raw per-run emission records from emissions.csv.
    Supports pagination and optional model-name substring filter.
    """
    try:
        df = _load_emissions()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    df = df.copy()
    df["emissions"] = pd.to_numeric(df["emissions"], errors="coerce")
    df["duration"]  = pd.to_numeric(df.get("duration", pd.Series(dtype=float)), errors="coerce")
    df["cpu_power"] = pd.to_numeric(df.get("cpu_power", pd.Series(dtype=float)), errors="coerce")
    df["gpu_power"] = pd.to_numeric(df.get("gpu_power", pd.Series(dtype=float)), errors="coerce")

    if model:
        df = df[df["project_name"].str.contains(model, case=False, na=False)]

    total = len(df)
    start = (page - 1) * limit
    end   = start + limit
    page_df = df.iloc[start:end]

    def _row_to_model(row: pd.Series) -> EmissionDetailRow:
        return EmissionDetailRow(
            timestamp=str(row.get("timestamp", "")) or None,
            project_name=str(row.get("project_name", "")) or None,
            duration_s=row.get("duration") if pd.notna(row.get("duration")) else None,
            emission_kg=row.get("emissions") if pd.notna(row.get("emissions")) else None,
            cpu_power_w=row.get("cpu_power") if pd.notna(row.get("cpu_power")) else None,
            gpu_power_w=row.get("gpu_power") if pd.notna(row.get("gpu_power")) else None,
            source_file=str(row.get("source_file", "")) or None,
        )

    return EmissionDetailResponse(
        total=total,
        page=page,
        limit=limit,
        data=[_row_to_model(row) for _, row in page_df.iterrows()],
    )


@router.get(
    "/epoch/{model_name}",
    response_model=EpochEmissionResponse,
    summary="Per-epoch emission breakdown for a DL model",
)
async def get_epoch_emissions(model_name: str) -> EpochEmissionResponse:
    """
    Returns per-epoch emission data for one of the DL models.
    model_name must be one of: resnet50, efficientnet_b3, vit_tiny
    """
    valid_dl = {"resnet50", "efficientnet_b3", "vit_tiny"}
    if model_name not in valid_dl:
        raise HTTPException(
            status_code=404,
            detail=f"'{model_name}' is not a tracked DL model. Valid: {sorted(valid_dl)}",
        )
    try:
        df = _load_emissions()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    df = df.copy()
    df["emissions"] = pd.to_numeric(df["emissions"], errors="coerce").fillna(0.0)
    df["duration"]  = pd.to_numeric(df.get("duration", pd.Series(0.0, index=df.index)), errors="coerce").fillna(0.0)

    # Match rows like "resnet50_e12", "vit_tiny_e3", etc.
    pattern = rf"^{model_name}_e(\d+)$"
    epoch_df = df[df["project_name"].str.match(pattern, na=False)].copy()

    if epoch_df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No per-epoch records found for model '{model_name}'.",
        )

    epoch_df["epoch_num"] = (
        epoch_df["project_name"]
        .str.extract(r"_e(\d+)$", expand=False)
        .astype(int)
    )
    epoch_df = epoch_df.sort_values("epoch_num")

    rows = [
        EpochEmissionRow(
            epoch=int(r["epoch_num"]),
            emission_kg=round(float(r["emissions"]), 10),
            duration_s=round(float(r["duration"]), 3),
        )
        for _, r in epoch_df.iterrows()
    ]

    return EpochEmissionResponse(
        model=model_name,
        epoch_count=len(rows),
        total_emission=round(float(epoch_df["emissions"].sum()), 10),
        epochs=rows,
    )
