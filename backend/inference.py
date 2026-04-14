"""
inference.py — Multi-model inference orchestration.

Pipeline
--------
1. User uploads a raw image.
2. preprocess_image() converts bytes → PIL → two tensors (32×32 and 224×224).
3. run_dl_inference() runs all 3 DL models concurrently via asyncio.gather.
4. extract_embedding() runs ResNet50's forward_features() once → shared embedding.
5. run_classical_inference() applies scaler → pca → 4 classifiers sequentially.
6. All results are merged into a PredictionResponse.

Key design choices
------------------
* DL inference is executed inside a thread-pool executor so that torch CUDA
  kernels do not block the asyncio event loop.
* The ResNet50 embedding is computed exactly once and reused across all 4
  classical models (no redundant GPU pass).
* No model is reloaded between requests.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import numpy as np
import torch
import torch.nn.functional as F  # noqa: N812

from model_loader import registry
from utils import (
    CIFAR100_CLASSES,
    DEVICE,
    DEVICE_TYPE,
    LatencyTimer,
    decode_image_bytes,
    preprocess_for_dl,
)

logger = logging.getLogger("inference")

# Classical models that are loaded and served (no KNN)
_CLASSICAL_MODEL_NAMES = ["svm", "rf", "xgboost", "logreg"]

# DL models
_DL_MODEL_NAMES = ["resnet50", "efficientnet_b3", "vit_tiny"]

# ViT-Tiny requires 224×224 input (same as during training)
_VIT_INPUT_SIZE = 224


# ---------------------------------------------------------------------------
# Image preprocessing helpers
# ---------------------------------------------------------------------------

def preprocess_image(raw_bytes: bytes) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Decode bytes and produce two resident tensors:
      img_32  : (1, 3, 32, 32)  — for ResNet50 and EfficientNet-B3
      img_224 : (1, 3, 224, 224) — for ViT-Tiny

    Returns
    -------
    (img_32, img_224) — both on CPU; moved to DEVICE inside each worker.
    """
    pil = decode_image_bytes(raw_bytes)
    img_32  = preprocess_for_dl(pil, target_size=32)
    img_224 = preprocess_for_dl(pil, target_size=224)
    return img_32, img_224


# ---------------------------------------------------------------------------
# DL inference — runs in a thread executor to avoid blocking the event loop
# ---------------------------------------------------------------------------

def _infer_dl_sync(
    model_name: str,
    img_tensor: torch.Tensor,
) -> dict:
    """
    Synchronous DL inference for a single model.
    Returns a dict with top-5 classes, confidences, and latency.
    Intended to be called via run_in_executor.
    """
    # Retrieve already-loaded model from registry (no I/O here)
    model = registry._dl_models.get(model_name)
    if model is None:
        raise RuntimeError(
            f"Model '{model_name}' not in registry. Call await registry.get_dl_model() first."
        )

    img = img_tensor.to(DEVICE)

    t0 = time.perf_counter()
    with torch.no_grad():
        logits = model(img)                          # (1, 100)
    latency_ms = (time.perf_counter() - t0) * 1_000

    probs = F.softmax(logits, dim=1).squeeze(0)      # (100,)
    top5_values, top5_indices = torch.topk(probs, k=5)

    top5_classes       = [CIFAR100_CLASSES[i.item()] for i in top5_indices]
    top5_confidences   = [round(v.item(), 6) for v in top5_values]
    predicted_class_id = top5_indices[0].item()
    top1_confidence    = top5_values[0].item()

    return {
        "model":             model_name,
        "type":              "deep_learning",
        "predicted_class_id": predicted_class_id,
        "predicted_class":   CIFAR100_CLASSES[predicted_class_id],
        "top1_confidence":   round(top1_confidence, 6),
        "top5_classes":      top5_classes,
        "top5_confidences":  top5_confidences,
        "latency_ms":        round(latency_ms, 3),
    }


async def run_dl_inference(
    img_32: torch.Tensor,
    img_224: torch.Tensor,
) -> list[dict]:
    """
    Ensure all 3 DL models are loaded, then run them concurrently
    using thread-pool executors.

    Returns a list of 3 result dicts (one per DL model).
    """
    # Ensure loaded (lazy, no-op after first call)
    await asyncio.gather(
        *[registry.get_dl_model(name) for name in _DL_MODEL_NAMES]
    )

    loop = asyncio.get_event_loop()

    def _make_task(name: str) -> asyncio.Future:
        tensor = img_224 if name == "vit_tiny" else img_32
        return loop.run_in_executor(None, _infer_dl_sync, name, tensor)

    results = await asyncio.gather(*[_make_task(n) for n in _DL_MODEL_NAMES])
    return list(results)


# ---------------------------------------------------------------------------
# Embedding extraction (ResNet50 feature extractor for classical pipeline)
# ---------------------------------------------------------------------------

def _extract_embedding_sync(img_32: torch.Tensor) -> np.ndarray:
    """
    Run ResNet50.forward_features() to obtain a 2048-d embedding.
    Applies global average pooling if output is 4-D (B, C, H, W).
    Returns a numpy array of shape (1, 2048).
    Runs in a thread executor.
    """
    model = registry._dl_models.get("resnet50")
    if model is None:
        raise RuntimeError("ResNet50 not in registry.")

    img = img_32.to(DEVICE)
    with torch.no_grad():
        feats = model.forward_features(img)   # (B, C, H, W) or (B, C)
    if feats.dim() == 4:
        feats = feats.mean(dim=[2, 3])        # global average pool → (B, C)
    return feats.cpu().numpy()                # (1, 2048)


# ---------------------------------------------------------------------------
# Classical inference — runs in thread executor (scikit-learn is synchronous)
# ---------------------------------------------------------------------------

def _infer_classical_sync(
    clf_name: str,
    embedding_pca: np.ndarray,
) -> dict:
    """
    Run a single classical classifier on the PCA-reduced embedding.
    embedding_pca.shape == (1, 100)
    """
    clf = registry._classical_models.get(clf_name)
    if clf is None:
        raise RuntimeError(f"Classical model '{clf_name}' not in registry.")

    t0 = time.perf_counter()
    pred_label: int = int(clf.predict(embedding_pca)[0])
    latency_ms = (time.perf_counter() - t0) * 1_000

    # Confidence: use predict_proba if available, else 1.0 placeholder
    confidence: float
    try:
        prob = clf.predict_proba(embedding_pca)[0]
        confidence = round(float(prob[pred_label]), 6)
    except AttributeError:
        confidence = 1.0   # LinearSVC (bare, without CalibratedClassifierCV) has no predict_proba

    return {
        "model":              clf_name,
        "type":               "classical",
        "predicted_class_id": pred_label,
        "predicted_class":    CIFAR100_CLASSES[pred_label],
        "top1_confidence":    confidence,
        "top5_classes":       [CIFAR100_CLASSES[pred_label]],   # classical → only top-1
        "top5_confidences":   [confidence],
        "latency_ms":         round(latency_ms, 3),
    }


async def run_classical_inference(img_32: torch.Tensor) -> list[dict]:
    """
    1. Ensure classical models (+ scaler + pca) are loaded.
    2. Extract ResNet50 embedding (reuse loaded model — no extra GPU load).
    3. Apply scaler → pca.
    4. Run all 4 classical classifiers in a thread executor (concurrently).

    Returns a list of 4 result dicts.
    """
    # Ensure classical models and ResNet50 are loaded
    await asyncio.gather(
        registry._ensure_classical_loaded(),
        registry.get_dl_model("resnet50"),
    )

    loop = asyncio.get_event_loop()

    # Step 1: extract embedding (GPU/CPU, synchronous inside executor)
    raw_embedding: np.ndarray = await loop.run_in_executor(
        None, _extract_embedding_sync, img_32
    )   # (1, 2048)

    # Step 2: scaler → pca  (CPU, synchronous, very fast — no executor needed)
    scaler = registry._scaler
    pca    = registry._pca
    embedding_scaled = scaler.transform(raw_embedding)     # (1, 2048)
    embedding_pca    = pca.transform(embedding_scaled)     # (1, 100)

    # Step 3: run classifiers concurrently in thread pool
    tasks = [
        loop.run_in_executor(None, _infer_classical_sync, name, embedding_pca)
        for name in _CLASSICAL_MODEL_NAMES
    ]
    results = await asyncio.gather(*tasks)
    return list(results)


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

async def run_full_inference(raw_bytes: bytes) -> dict:
    """
    Full inference pipeline for a single image.

    Returns a dict with:
      predictions       : list of 7 per-model result dicts
      best_dl_model     : name of the DL model with highest top-1 confidence
      best_overall_model: name of the model with highest top-1 confidence
      total_latency_ms  : wall-clock time for the entire function
      image_info        : dict with shape info
    """
    wall_t0 = time.perf_counter()

    # --- Preprocessing ---
    img_32, img_224 = preprocess_image(raw_bytes)

    # --- Run DL and classical pipelines concurrently ---
    dl_results, classical_results = await asyncio.gather(
        run_dl_inference(img_32, img_224),
        run_classical_inference(img_32),
    )

    all_predictions: list[dict] = dl_results + classical_results

    # --- Identify best models ---
    best_overall = max(all_predictions, key=lambda r: r["top1_confidence"])
    best_dl      = max(dl_results,      key=lambda r: r["top1_confidence"])

    total_latency_ms = round((time.perf_counter() - wall_t0) * 1_000, 3)

    return {
        "predictions":        all_predictions,
        "best_dl_model":      best_dl["model"],
        "best_overall_model": best_overall["model"],
        "total_latency_ms":   total_latency_ms,
        "image_info": {
            "input_size_32":  list(img_32.shape[2:]),   # [32, 32]
            "input_size_224": list(img_224.shape[2:]),  # [224, 224]
        },
    }
