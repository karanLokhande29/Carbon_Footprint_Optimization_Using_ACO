"""
main.py — FastAPI application factory for the EC_Project backend.

Endpoints
---------
POST /predict              → Multi-model image classification
GET  /leaderboard          → Ranked model comparison
GET  /leaderboard/{model}  → Single-model leaderboard entry
GET  /carbon               → Emission summary
GET  /carbon/detail        → Paginated raw emission records
GET  /carbon/epoch/{model} → Per-epoch DL emissions
GET  /aco                  → ACO best config + convergence
GET  /aco/history          → Full iteration history
GET  /aco/pheromones       → Final pheromone state
GET  /aco/config           → Best hyperparameter config
GET  /health               → Application health check

Usage
-----
From the EC_Project/ directory (one level above backend/):

    cd EC_Project
    uvicorn backend.main:app --reload --port 8000

Or from inside backend/:

    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path fix — ensure the backend/ directory is on sys.path so that sibling
# modules (aco, carbon, inference, model_loader, utils) are importable
# regardless of whether uvicorn is launched from EC_Project/ or backend/.
# ---------------------------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import torch
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Local imports
# ---------------------------------------------------------------------------
from aco import router as aco_router
from carbon import router as carbon_router
from efficiency import router as efficiency_router
from efficiency import confidence_reliability
from inference import run_full_inference
from model_loader import registry
from utils import CIFAR100_CLASSES, DEVICE, DEVICE_TYPE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)
logger = logging.getLogger("main")

# ---------------------------------------------------------------------------
# Artifact configuration
# ---------------------------------------------------------------------------
_ARTIFACT_DIR  = Path(__file__).resolve().parent.parent / "carbon_aco_artifacts"
_LEADERBOARD   = _ARTIFACT_DIR / "leaderboard.json"

# Env toggle: set EAGER_LOAD=true to pre-warm all models at startup
_EAGER_LOAD = os.getenv("EAGER_LOAD", "false").lower() == "true"

# Max upload size: 10 MB
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated on_startup / on_shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("=" * 60)
    logger.info("  EC_Project Backend — starting up")
    logger.info("  Device: %s  |  Eager load: %s", DEVICE, _EAGER_LOAD)
    logger.info("  Artifact dir: %s", _ARTIFACT_DIR)
    logger.info("=" * 60)

    if _EAGER_LOAD:
        logger.info("[startup] Eager-loading all models …")
        await registry.warmup_all()
        logger.info(
            "[startup] Loaded DL: %s | Classical: %s",
            registry.loaded_dl_models,
            registry.loaded_classical_models,
        )
    else:
        logger.info("[startup] Lazy loading enabled — models load on first request.")

    yield  # ← application runs here

    logger.info("[shutdown] Cleaning up …")
    if DEVICE_TYPE == "cuda":
        torch.cuda.empty_cache()
    logger.info("[shutdown] Done.")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Carbon-Aware CIFAR-100 Classifier API",
    description=(
        "Production FastAPI backend serving 7 pretrained models "
        "(ResNet50, EfficientNet-B3, ViT-Tiny, SVM, RF, XGBoost, LogReg) "
        "for CIFAR-100 classification, with carbon emission analytics and "
        "ACO optimisation results."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow all origins during development; tighten for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-routers
app.include_router(aco_router)
app.include_router(carbon_router)
app.include_router(efficiency_router)


# ---------------------------------------------------------------------------
# Leaderboard — in-process cache (mtime-invalidated)
# ---------------------------------------------------------------------------
_lb_cache_data:  list[dict] | None = None
_lb_cache_mtime: float = 0.0


def _load_leaderboard() -> list[dict]:
    global _lb_cache_data, _lb_cache_mtime

    if not _LEADERBOARD.exists():
        raise FileNotFoundError(f"leaderboard.json not found at {_LEADERBOARD}")

    current_mtime = os.path.getmtime(_LEADERBOARD)
    if _lb_cache_data is not None and current_mtime == _lb_cache_mtime:
        return _lb_cache_data

    logger.info("[leaderboard] (Re)loading leaderboard.json from disk …")
    with open(_LEADERBOARD, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    _lb_cache_data  = data
    _lb_cache_mtime = current_mtime
    return data


# ---------------------------------------------------------------------------
# Response models (defined in main.py to avoid an extra schemas file)
# ---------------------------------------------------------------------------

class SingleModelPrediction(BaseModel):
    model:              str
    type:               str                    # "deep_learning" | "classical"
    predicted_class_id: int
    predicted_class:    str
    top1_confidence:    float
    top5_classes:       list[str]
    top5_confidences:   list[float]
    latency_ms:         float
    reliability:        str = "Unknown"        # "High" | "Medium" | "Low"  (predict-only)


class PredictionResponse(BaseModel):
    predictions:        list[SingleModelPrediction]
    best_dl_model:      str
    best_overall_model: str
    total_latency_ms:   float
    image_info:         dict[str, Any]
    num_classes:        int = 100


class LeaderboardEntry(BaseModel):
    rank:                  int
    model:                 str
    type:                  str
    test_acc1:             float
    test_acc5:             Optional[float]
    val_acc1:              Optional[float]
    precision_macro:       float
    recall_macro:          float
    f1_macro:              float
    inference_latency_ms:  float
    model_size_mb:         float
    total_emission_kg:     float
    green_score:           float
    n_params_M:            Optional[float]
    train_time_s:          Optional[float]
    checkpoint:            str
    timestamp:             str


class LeaderboardResponse(BaseModel):
    total_models: int
    sort_by:      str
    entries:      list[LeaderboardEntry]


class HealthResponse(BaseModel):
    status:             str
    device:             str
    loaded_dl_models:   list[str]
    loaded_classical:   list[str]
    registry_ready:     bool
    uptime_s:           float


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
_start_time = time.time()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health() -> HealthResponse:
    """Lightweight health check — no model loading triggered."""
    return HealthResponse(
        status="ok",
        device=str(DEVICE),
        loaded_dl_models=registry.loaded_dl_models,
        loaded_classical=registry.loaded_classical_models,
        registry_ready=registry.is_ready(),
        uptime_s=round(time.time() - _start_time, 1),
    )


# ---------------------------------------------------------------------------
# POST /predict
# ---------------------------------------------------------------------------

@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
async def predict(
    file: UploadFile = File(..., description="Image file (JPEG, PNG, BMP, etc.)"),
) -> PredictionResponse:
    """
    Run the uploaded image through all 7 models and return predictions.

    * 3 deep-learning models run concurrently (GPU if available).
    * ResNet50 embedding is extracted once and shared across all 4 classical models.
    * Returns per-model top-5 classes and confidences, plus per-model latency.
    """
    # --- Validate content type ---
    allowed_types = {"image/jpeg", "image/png", "image/bmp", "image/webp", "image/tiff"}
    content_type  = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{content_type}'. Accepted: {sorted(allowed_types)}",
        )

    # --- Read bytes ---
    raw_bytes = await file.read()
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(raw_bytes):,} B). Max: {_MAX_UPLOAD_BYTES:,} B.",
        )

    # --- Run inference ---
    try:
        result = await run_full_inference(raw_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid image: {exc}")
    except Exception as exc:
        logger.exception("[predict] Unexpected error during inference")
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

    # --- Shape response (attach reliability label to each prediction) ---
    predictions = [
        SingleModelPrediction(
            **pred,
            reliability=confidence_reliability(pred["top1_confidence"]),
        )
        for pred in result["predictions"]
    ]

    return PredictionResponse(
        predictions=predictions,
        best_dl_model=result["best_dl_model"],
        best_overall_model=result["best_overall_model"],
        total_latency_ms=result["total_latency_ms"],
        image_info=result["image_info"],
    )


# ---------------------------------------------------------------------------
# GET /leaderboard
# ---------------------------------------------------------------------------

_VALID_SORT_FIELDS = {
    "rank", "test_acc1", "f1_macro", "green_score",
    "total_emission_kg", "model_size_mb", "inference_latency_ms",
}


@app.get("/leaderboard", response_model=LeaderboardResponse, tags=["Analytics"])
async def get_leaderboard(
    sort_by:    str          = Query("rank", description=f"Sort field. One of: {sorted(_VALID_SORT_FIELDS)}"),
    order:      str          = Query("asc",  description="Sort order: asc | desc"),
    model_type: Optional[str] = Query(None, description="Filter by type: deep_learning | classical"),
) -> LeaderboardResponse:
    """
    Returns all 7 trained models ranked and optionally filtered / re-sorted.
    Default sort is by original rank (test_acc1 descending, set at training time).
    """
    if sort_by not in _VALID_SORT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sort_by '{sort_by}'. Valid options: {sorted(_VALID_SORT_FIELDS)}",
        )
    if order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="order must be 'asc' or 'desc'.")

    try:
        raw = _load_leaderboard()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    entries = list(raw)  # shallow copy

    # Optional type filter
    if model_type:
        if model_type not in {"deep_learning", "classical"}:
            raise HTTPException(
                status_code=400,
                detail="model_type must be 'deep_learning' or 'classical'.",
            )
        entries = [e for e in entries if e.get("type") == model_type]

    # Sort
    reverse = order == "desc"
    try:
        entries.sort(
            key=lambda e: (e.get(sort_by) is None, e.get(sort_by, 0)),
            reverse=reverse,
        )
    except TypeError:
        pass  # field not uniformly comparable; keep original order

    def _to_entry(raw_entry: dict) -> LeaderboardEntry:
        return LeaderboardEntry(
            rank=int(raw_entry.get("rank", 0)),
            model=raw_entry["model"],
            type=raw_entry["type"],
            test_acc1=float(raw_entry.get("test_acc1", 0.0)),
            test_acc5=float(raw_entry["test_acc5"]) if raw_entry.get("test_acc5") is not None else None,
            val_acc1=float(raw_entry["val_acc1"]) if raw_entry.get("val_acc1") is not None else None,
            precision_macro=float(raw_entry.get("precision_macro", 0.0)),
            recall_macro=float(raw_entry.get("recall_macro", 0.0)),
            f1_macro=float(raw_entry.get("f1_macro", 0.0)),
            inference_latency_ms=float(raw_entry.get("inference_latency_ms", 0.0)),
            model_size_mb=float(raw_entry.get("model_size_mb", 0.0)),
            total_emission_kg=float(raw_entry.get("total_emission_kg", 0.0)),
            green_score=float(raw_entry.get("green_score", 0.0)),
            n_params_M=float(raw_entry["n_params_M"]) if raw_entry.get("n_params_M") is not None else None,
            train_time_s=float(raw_entry["train_time_s"]) if raw_entry.get("train_time_s") is not None else None,
            checkpoint=raw_entry.get("checkpoint", ""),
            timestamp=raw_entry.get("timestamp", ""),
        )

    return LeaderboardResponse(
        total_models=len(entries),
        sort_by=sort_by,
        entries=[_to_entry(e) for e in entries],
    )


@app.get("/leaderboard/{model_name}", response_model=LeaderboardEntry, tags=["Analytics"])
async def get_leaderboard_model(model_name: str) -> LeaderboardEntry:
    """Return the leaderboard entry for a single model by name."""
    try:
        raw = _load_leaderboard()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    for entry in raw:
        if entry["model"] == model_name:
            return LeaderboardEntry(
                rank=int(entry.get("rank", 0)),
                model=entry["model"],
                type=entry["type"],
                test_acc1=float(entry.get("test_acc1", 0.0)),
                test_acc5=float(entry["test_acc5"]) if entry.get("test_acc5") is not None else None,
                val_acc1=float(entry["val_acc1"]) if entry.get("val_acc1") is not None else None,
                precision_macro=float(entry.get("precision_macro", 0.0)),
                recall_macro=float(entry.get("recall_macro", 0.0)),
                f1_macro=float(entry.get("f1_macro", 0.0)),
                inference_latency_ms=float(entry.get("inference_latency_ms", 0.0)),
                model_size_mb=float(entry.get("model_size_mb", 0.0)),
                total_emission_kg=float(entry.get("total_emission_kg", 0.0)),
                green_score=float(entry.get("green_score", 0.0)),
                n_params_M=float(entry["n_params_M"]) if entry.get("n_params_M") is not None else None,
                train_time_s=float(entry["train_time_s"]) if entry.get("train_time_s") is not None else None,
                checkpoint=entry.get("checkpoint", ""),
                timestamp=entry.get("timestamp", ""),
            )

    valid = [e["model"] for e in raw]
    raise HTTPException(
        status_code=404,
        detail=f"Model '{model_name}' not found. Available: {valid}",
    )


# ---------------------------------------------------------------------------
# Root redirect to docs
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse(
        content={
            "message": "Carbon-Aware CIFAR-100 Classifier API",
            "docs":    "/docs",
            "redoc":   "/redoc",
            "health":  "/health",
        }
    )
