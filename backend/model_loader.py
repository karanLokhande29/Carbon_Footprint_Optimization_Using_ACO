"""
model_loader.py — Singleton model registry with lazy loading.

Design
------
* One global ``ModelRegistry`` instance (`registry`) imported everywhere.
* Each model is wrapped in an asyncio.Lock; the first coroutine that needs
  an unloaded model acquires the lock, loads it, releases the lock.
  Subsequent callers see a loaded model and skip the lock entirely (fast path).
* DL models run on DEVICE (GPU if available); classical models run on CPU.
* scaler + pca are shared across all 4 classical models and loaded once.
* The registry exposes typed accessors so callers never hold raw dicts.

Supported models
----------------
Deep learning  : resnet50 | efficientnet_b3 | vit_tiny
Classical ML   : svm | rf | xgboost | logreg
Preprocessing  : scaler, pca  (shared, loaded alongside the first classical model)
"""

from __future__ import annotations

import asyncio
import logging
import warnings
from pathlib import Path
from typing import Any

import joblib
import sklearn
import timm
import torch
import torch.nn as nn
from sklearn.exceptions import InconsistentVersionWarning

from utils import DEVICE, DEVICE_TYPE

logger = logging.getLogger("model_loader")

# ---------------------------------------------------------------------------
# sklearn version guard — models were pickled with 1.6.1
# ---------------------------------------------------------------------------
_SKLEARN_TRAINED = "1.6.1"
_SKLEARN_CURRENT = sklearn.__version__
if _SKLEARN_CURRENT != _SKLEARN_TRAINED:
    logger.warning(
        "[registry] sklearn version mismatch: trained on %s, running on %s. "
        "Inference results are expected to be identical for these model types, "
        "but downgrade to %s (requirements.txt) is strongly recommended.",
        _SKLEARN_TRAINED, _SKLEARN_CURRENT, _SKLEARN_TRAINED,
    )

# Suppress the low-level stderr InconsistentVersionWarning — we already
# surface it cleanly above via the logger.
warnings.filterwarnings("ignore", category=InconsistentVersionWarning)

# ---------------------------------------------------------------------------
# Artifact paths  — all models live in ./carbon_aco_artifacts/
# ---------------------------------------------------------------------------
_ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "carbon_aco_artifacts"

_DL_CHECKPOINTS: dict[str, Path] = {
    "resnet50":        _ARTIFACT_DIR / "resnet50_best.pt",
    "efficientnet_b3": _ARTIFACT_DIR / "efficientnet_b3_best.pt",
    "vit_tiny":        _ARTIFACT_DIR / "vit_tiny_best.pt",
}

_CLASSICAL_CHECKPOINTS: dict[str, Path] = {
    "svm":     _ARTIFACT_DIR / "svm.pkl",
    "rf":      _ARTIFACT_DIR / "rf.pkl",
    "xgboost": _ARTIFACT_DIR / "xgboost.pkl",
    "logreg":  _ARTIFACT_DIR / "logreg.pkl",
}

_SCALER_PATH = _ARTIFACT_DIR / "scaler.pkl"
_PCA_PATH    = _ARTIFACT_DIR / "pca.pkl"

# timm model identifiers matching what was used during training
_TIMM_IDS: dict[str, str] = {
    "resnet50":        "resnet50",
    "efficientnet_b3": "efficientnet_b3",
    "vit_tiny":        "vit_tiny_patch16_224",
}

NUM_CLASSES = 100


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

class ModelRegistry:
    """
    Thread- and coroutine-safe singleton registry for all trained models.

    Attributes (after loading)
    -------------------------
    _dl_models        : dict[name -> nn.Module]   (eval mode, on DEVICE)
    _classical_models : dict[name -> sklearn clf]  (CPU)
    _scaler           : StandardScaler
    _pca              : PCA
    """

    def __init__(self) -> None:
        self._dl_models:        dict[str, nn.Module] = {}
        self._classical_models: dict[str, Any]        = {}
        self._scaler:           Any | None             = None
        self._pca:              Any | None             = None

        # Per-model locks prevent concurrent loads of the same model
        self._dl_locks:         dict[str, asyncio.Lock] = {
            name: asyncio.Lock() for name in _DL_CHECKPOINTS
        }
        self._classical_lock:   asyncio.Lock = asyncio.Lock()  # shared for scaler+pca+all classifiers

    # ------------------------------------------------------------------
    # Deep-learning model loading
    # ------------------------------------------------------------------

    def _build_dl_model(self, name: str) -> nn.Module:
        """Build a timm model, load weights from checkpoint, set eval mode."""
        ckpt_path = _DL_CHECKPOINTS[name]
        if not ckpt_path.exists():
            raise FileNotFoundError(f"DL checkpoint not found: {ckpt_path}")

        timm_id = _TIMM_IDS[name]
        logger.info("[registry] Building %s from timm id '%s'", name, timm_id)

        # pretrained=False: weights come from the saved checkpoint
        model = timm.create_model(timm_id, pretrained=False, num_classes=NUM_CLASSES)

        state = torch.load(ckpt_path, map_location=DEVICE, weights_only=True)

        # Training script sometimes saves a plain state dict; sometimes a dict
        # with a "model_state_dict" key (10-epoch checkpoints).  Handle both.
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]

        model.load_state_dict(state)
        model.to(DEVICE)
        model.eval()
        logger.info("[registry] %s loaded → %s", name, DEVICE)
        return model

    async def get_dl_model(self, name: str) -> nn.Module:
        """Return the DL model, loading it lazily on first call."""
        if name in self._dl_models:          # fast path (no lock needed)
            return self._dl_models[name]

        async with self._dl_locks[name]:
            # Double-checked locking: another coroutine may have loaded it
            # while we were waiting for the lock.
            if name not in self._dl_models:
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(
                    None, self._build_dl_model, name
                )
                self._dl_models[name] = model
            return self._dl_models[name]

    # ------------------------------------------------------------------
    # Classical model + preprocessing loading
    # ------------------------------------------------------------------

    def _load_classical_all(self) -> None:
        """Load scaler, pca, and all 4 classical classifiers synchronously."""
        if not _SCALER_PATH.exists():
            raise FileNotFoundError(f"scaler.pkl not found at {_SCALER_PATH}")
        if not _PCA_PATH.exists():
            raise FileNotFoundError(f"pca.pkl not found at {_PCA_PATH}")

        logger.info("[registry] Loading preprocessing: scaler + pca …")
        self._scaler = joblib.load(_SCALER_PATH)
        self._pca    = joblib.load(_PCA_PATH)
        logger.info("[registry] ✓ scaler (n_features=%s) + pca (n_components=%s) ready",
                    getattr(self._scaler, 'n_features_in_', '?'),
                    getattr(self._pca,    'n_components_',  '?'))

        for clf_name, clf_path in _CLASSICAL_CHECKPOINTS.items():
            if not clf_path.exists():
                raise FileNotFoundError(f"Classical checkpoint not found: {clf_path}")
            logger.info("[registry] Loading %-10s ← %s", clf_name, clf_path.name)
            self._classical_models[clf_name] = joblib.load(clf_path)
            logger.info("[registry] ✓ %-10s ready", clf_name)

    async def _ensure_classical_loaded(self) -> None:
        """Lazily load all classical models (guarded by a single shared lock)."""
        if self._scaler is not None:          # fast path
            return

        async with self._classical_lock:
            if self._scaler is None:           # double-checked
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_classical_all)

    async def get_classical_model(self, name: str) -> Any:
        """Return one classical classifier, loading all classical models lazily."""
        await self._ensure_classical_loaded()
        return self._classical_models[name]

    async def get_scaler(self) -> Any:
        await self._ensure_classical_loaded()
        return self._scaler

    async def get_pca(self) -> Any:
        await self._ensure_classical_loaded()
        return self._pca

    # ------------------------------------------------------------------
    # ResNet50 as feature extractor (for classical pipeline)
    # ------------------------------------------------------------------

    async def get_resnet50_extractor(self) -> nn.Module:
        """
        Return the ResNet50 model used *solely* for embedding extraction.
        Reuses the same singleton loaded for DL inference (no double load).
        """
        return await self.get_dl_model("resnet50")

    # ------------------------------------------------------------------
    # Convenience: eager warm-up of all models (optional)
    # ------------------------------------------------------------------

    async def warmup_all(self) -> None:
        """
        Pre-load every model.  Call from FastAPI lifespan if EAGER_LOAD=true.
        This avoids cold-start latency on the first real request.
        """
        tasks = [
            self.get_dl_model(name) for name in _DL_CHECKPOINTS
        ]
        tasks.append(self._ensure_classical_loaded())
        await asyncio.gather(*tasks)
        dl_names  = sorted(self._dl_models.keys())
        clf_names = sorted(self._classical_models.keys())
        logger.info(
            "[registry] ✓ All models ready │ DL: %s │ Classical: %s │ Device: %s",
            dl_names, clf_names, DEVICE,
        )

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    @property
    def loaded_dl_models(self) -> list[str]:
        return list(self._dl_models.keys())

    @property
    def loaded_classical_models(self) -> list[str]:
        return list(self._classical_models.keys())

    def is_ready(self) -> bool:
        """True when every model (DL + classical + preprocessing) is loaded."""
        all_dl  = set(_DL_CHECKPOINTS.keys()).issubset(self._dl_models)
        all_clf = set(_CLASSICAL_CHECKPOINTS.keys()).issubset(self._classical_models)
        return all_dl and all_clf and self._scaler is not None


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere
# ---------------------------------------------------------------------------
registry = ModelRegistry()
