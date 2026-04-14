"""
aco.py — FastAPI router for ACO (Ant Colony Optimisation) analytics endpoints.

Endpoints
---------
GET /aco                    → Best config + convergence summary
GET /aco/history            → Full 15-iteration convergence history
GET /aco/pheromones         → Final pheromone state for all dimensions
GET /aco/config             → Best recommended configuration (model, lr, wd, epochs)

Data source
-----------
../carbon_aco_artifacts/aco_logs.json
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("aco")

router = APIRouter(prefix="/aco", tags=["ACO Optimisation"])

_ACO_PATH = (
    Path(__file__).resolve().parent.parent / "carbon_aco_artifacts" / "aco_logs.json"
)
_EMISSIONS_PATH = (
    Path(__file__).resolve().parent.parent / "carbon_aco_artifacts" / "emissions.csv"
)

# ---------------------------------------------------------------------------
# In-memory cache (mtime-invalidated)
# ---------------------------------------------------------------------------
_cache_data: dict | None = None
_cache_mtime: float = 0.0


def _load_aco() -> dict:
    """Load (and cache) aco_logs.json — mtime-invalidated."""
    global _cache_data, _cache_mtime

    if not _ACO_PATH.exists():
        raise FileNotFoundError(f"aco_logs.json not found at {_ACO_PATH}")

    current_mtime = os.path.getmtime(_ACO_PATH)
    if _cache_data is not None and current_mtime == _cache_mtime:
        return _cache_data

    import json
    logger.info("[aco] (Re)loading aco_logs.json from disk …")
    with open(_ACO_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    _cache_data  = data
    _cache_mtime = current_mtime
    return data


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ACOBestConfig(BaseModel):
    model:           str
    lr:              float
    weight_decay:    float
    epochs:          int
    fitness:         float
    aco_emission_kg: float


class ACOIterationSummary(BaseModel):
    iteration:    int
    best_fitness: float
    best_model:   str
    rho_adaptive: float
    tau_model:    list[float]   # 7-element pheromone vector (one per model, no KNN)


class ACOPheromones(BaseModel):
    tau_model: list[float]   # 7-element (resnet50, efficientnet_b3, vit_tiny, svm, rf, xgboost, logreg)
    tau_lr:    list[float]   # 4 learning-rate options
    tau_wd:    list[float]   # 3 weight-decay options
    tau_ep:    list[float]   # 3 epoch options


class ACOConvergence(BaseModel):
    """Derived convergence statistics over the 15 iterations."""
    initial_fitness:  float
    final_fitness:    float
    improvement_pct:  float
    converged_at_iter: Optional[int]   # first iteration that reached final fitness


class ACOSummaryResponse(BaseModel):
    best_config:  ACOBestConfig
    convergence:  ACOConvergence
    n_iterations: int
    n_ants:       int           # hardcoded from training (10 ants)
    lambda_carbon: float        # hardcoded from training (0.5)


class ACOHistoryResponse(BaseModel):
    n_iterations: int
    history:      list[ACOIterationSummary]


class ACOPheromonesResponse(BaseModel):
    pheromones:      ACOPheromones
    model_names:     list[str]   # index → model name mapping for tau_model
    lr_options:      list[float]
    wd_options:      list[float]
    epoch_options:   list[int]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# These must match the order used in ACOConfigSearch during training.
# KNN is completely absent.
_MODEL_NAMES  = ["resnet50", "efficientnet_b3", "vit_tiny", "svm", "rf", "xgboost", "logreg"]
_LR_OPTIONS   = [1e-4, 5e-4, 1e-3, 5e-3]
_WD_OPTIONS   = [1e-5, 1e-4, 1e-3]
_EP_OPTIONS   = [50, 75, 100]
_N_ANTS       = 10
_LAMBDA_CARBON = 0.5

# ---------------------------------------------------------------------------
# Emissions lookup helper
# ---------------------------------------------------------------------------

def _canonical_model(pname: str) -> str:
    """Strip epoch suffixes and classical prefix to get a bare model name."""
    pname = str(pname).lower().replace("classical_", "")
    for marker in ("_e", "_total", "_emission"):
        idx = pname.find(marker)
        if idx != -1:
            pname = pname[:idx]
    return pname


def get_model_emissions(model_name: str) -> float:
    """
    Look up the total CO₂ (kg) for *model_name* from emissions.csv.

    Returns the exact total for the model, or the average across all models
    if model_name is not found (safe fallback — never returns 0).
    """
    if not _EMISSIONS_PATH.exists():
        logger.warning("[aco] emissions.csv not found — returning 0 for %s", model_name)
        return 0.0

    try:
        df = pd.read_csv(_EMISSIONS_PATH)
        df["emissions"] = pd.to_numeric(df["emissions"], errors="coerce").fillna(0.0)
        df["_model"] = df["project_name"].apply(_canonical_model)

        totals: dict[str, float] = df.groupby("_model")["emissions"].sum().to_dict()

        if model_name in totals:
            return round(float(totals[model_name]), 6)

        # Fallback: average across all non-meta models
        model_values = [
            v for k, v in totals.items()
            if k not in ("aco_optimization", "embedding")
        ]
        fallback = round(float(sum(model_values) / len(model_values)), 6) if model_values else 0.0
        logger.warning(
            "[aco] model '%s' not found in emissions.csv — using average fallback %.6f",
            model_name, fallback
        )
        return fallback

    except Exception as exc:
        logger.error("[aco] Failed to read emissions.csv: %s", exc)
        return 0.0


def _parse_best_config(raw: dict) -> ACOBestConfig:
    # Always lookup from emissions to ensure correct mapping
    aco_co2 = get_model_emissions(raw["model"])
    return ACOBestConfig(
        model=raw["model"],
        lr=float(raw["lr"]),
        weight_decay=float(raw["weight_decay"]),
        epochs=int(raw["epochs"]),
        fitness=float(raw["fitness"]),
        aco_emission_kg=round(aco_co2, 6),
    )


def _parse_iteration(raw: dict) -> ACOIterationSummary:
    return ACOIterationSummary(
        iteration=int(raw["iteration"]),
        best_fitness=float(raw["best_fitness"]),
        best_model=str(raw["best_model"]),
        rho_adaptive=float(raw["rho_adaptive"]),
        tau_model=[float(v) for v in raw["tau_model"]],
    )


def _parse_pheromones(raw: dict) -> ACOPheromones:
    return ACOPheromones(
        tau_model=[float(v) for v in raw["tau_model"]],
        tau_lr=[float(v) for v in raw["tau_lr"]],
        tau_wd=[float(v) for v in raw["tau_wd"]],
        tau_ep=[float(v) for v in raw["tau_ep"]],
    )


def _compute_convergence(history: list[dict]) -> ACOConvergence:
    if not history:
        return ACOConvergence(
            initial_fitness=0.0, final_fitness=0.0,
            improvement_pct=0.0, converged_at_iter=None
        )

    initial = float(history[0]["best_fitness"])
    final   = float(history[-1]["best_fitness"])
    improvement_pct = round((initial - final) / max(initial, 1e-12) * 100, 4) if initial != final else 0.0

    # "Converged" = first iteration at which fitness reaches the final value
    converged_at: Optional[int] = None
    for item in history:
        if float(item["best_fitness"]) <= final:
            converged_at = int(item["iteration"])
            break

    return ACOConvergence(
        initial_fitness=initial,
        final_fitness=final,
        improvement_pct=improvement_pct,
        converged_at_iter=converged_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=ACOSummaryResponse, summary="ACO best config and convergence summary")
async def get_aco_summary() -> ACOSummaryResponse:
    """
    Returns the recommended best configuration found by elitist ACO, along with
    a high-level convergence summary (improvement % and convergence iteration).
    """
    try:
        data = _load_aco()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    best_config = _parse_best_config(data["best_config"])
    convergence = _compute_convergence(data.get("history", []))
    n_iter      = len(data.get("history", []))

    return ACOSummaryResponse(
        best_config=best_config,
        convergence=convergence,
        n_iterations=n_iter,
        n_ants=_N_ANTS,
        lambda_carbon=_LAMBDA_CARBON,
    )


@router.get("/history", response_model=ACOHistoryResponse, summary="Full 15-iteration convergence history")
async def get_aco_history() -> ACOHistoryResponse:
    """
    Returns the complete per-iteration log: best fitness, best model,
    adaptive evaporation rate ρ, and the 7-element tau_model pheromone vector.
    """
    try:
        data = _load_aco()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    history_raw = data.get("history", [])
    return ACOHistoryResponse(
        n_iterations=len(history_raw),
        history=[_parse_iteration(h) for h in history_raw],
    )


@router.get("/pheromones", response_model=ACOPheromonesResponse, summary="Final pheromone state")
async def get_aco_pheromones() -> ACOPheromonesResponse:
    """
    Returns the final pheromone concentrations after 15 iterations of ACO.
    Each tau_model[i] corresponds to model_names[i].
    """
    try:
        data = _load_aco()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    pheromones = _parse_pheromones(data["pheromones"])
    return ACOPheromonesResponse(
        pheromones=pheromones,
        model_names=_MODEL_NAMES,
        lr_options=_LR_OPTIONS,
        wd_options=_WD_OPTIONS,
        epoch_options=_EP_OPTIONS,
    )


@router.get("/config", response_model=ACOBestConfig, summary="Recommended hyperparameter config")
async def get_aco_best_config() -> ACOBestConfig:
    """
    Returns just the best configuration dict recommended by the ACO:
    model, learning rate, weight decay, and number of epochs.
    This is the most commonly consumed endpoint for downstream applications.
    """
    try:
        data = _load_aco()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return _parse_best_config(data["best_config"])
