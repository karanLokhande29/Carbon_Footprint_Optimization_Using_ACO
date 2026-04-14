"""
efficiency.py — Efficiency Evaluation System for the Carbon-Aware CIFAR-100 project.

Metrics
-------
- Green Score        : accuracy / co2  (higher = more efficient)
- Efficiency Score   : 0.4*acc_norm - 0.3*co2_norm - 0.2*lat_norm  (fixed weights)
- Confidence Label   : "High" / "Medium" / "Low"  (predict-only; NOT used in ranking)

Insights
--------
- best_accuracy  : highest test_acc1
- most_efficient : highest green_score
- best_tradeoff  : highest efficiency_score
- fastest        : lowest inference_latency_ms

FastAPI integration
-------------------
In main.py, add:
    from efficiency import router as efficiency_router
    app.include_router(efficiency_router)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

logger = logging.getLogger("efficiency")

router = APIRouter(tags=["Efficiency"])

# ---------------------------------------------------------------------------
# Core computation helpers
# ---------------------------------------------------------------------------

_EPS = 1e-12   # prevents division by zero throughout


def _safe_max(values: list[float]) -> float:
    """Return max of values, or _EPS if all zero (prevents /0)."""
    m = max(values) if values else 0.0
    return m if m > 0 else _EPS


def _normalise(values: list[float]) -> list[float]:
    """Min-max normalise to [0, 1].  All-equal → 0.5 for every element."""
    lo, hi = min(values), max(values)
    span = hi - lo
    if span < _EPS:
        return [0.5] * len(values)
    return [(v - lo) / span for v in values]


def compute_efficiency(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Given a list of leaderboard dicts, return a new list with computed fields:
      - acc_norm, co2_norm, lat_norm
      - green_score   (may already exist in entry; we recompute for consistency)
      - efficiency_score
    """
    if not entries:
        return []

    # ── Raw metric extraction (with safe fallbacks) ─────────────────────────
    accuracies = [float(e.get("test_acc1", 0.0) or 0.0) for e in entries]
    co2s       = [float(e.get("total_emission_kg", _EPS) or _EPS) for e in entries]
    latencies  = [float(e.get("inference_latency_ms", _EPS) or _EPS) for e in entries]

    # Ensure co2 / latency are never exactly zero (numerical stability)
    co2s      = [max(v, _EPS) for v in co2s]
    latencies = [max(v, _EPS) for v in latencies]

    # ── Normalisation ────────────────────────────────────────────────────────
    # accuracy : already in [0,1] from training; we still normalise across
    #            the 7 models so that the best model gets 1.0 in that context.
    acc_norms = _normalise(accuracies)

    # co2 / latency : divide by max so that the worst model scores 1.0
    max_co2 = _safe_max(co2s)
    max_lat = _safe_max(latencies)
    co2_norms = [v / max_co2 for v in co2s]
    lat_norms = [v / max_lat for v in latencies]

    # ── Per-model metric computation ─────────────────────────────────────────
    results: list[dict[str, Any]] = []

    for i, entry in enumerate(entries):
        acc     = accuracies[i]
        co2     = co2s[i]
        lat     = latencies[i]
        acc_n   = acc_norms[i]
        co2_n   = co2_norms[i]
        lat_n   = lat_norms[i]

        # Green Score: accuracy per unit CO₂  (higher = better)
        green_score = round(acc / co2, 4)

        # Efficiency Score (FIXED WEIGHTS — DO NOT CHANGE)
        efficiency_score = round(0.4 * acc_n - 0.3 * co2_n - 0.2 * lat_n, 4)

        results.append({
            "name":             entry.get("model", "unknown"),
            "type":             entry.get("type", "unknown"),
            "accuracy":         round(acc, 4),
            "co2":              round(co2, 8),
            "latency":          round(lat, 4),
            "model_size_mb":    round(float(entry.get("model_size_mb", 0.0) or 0.0), 2),
            # Normalised intermediates (useful for debugging / radar chart)
            "acc_norm":         round(acc_n, 4),
            "co2_norm":         round(co2_n, 4),
            "lat_norm":         round(lat_n, 4),
            # Final metrics
            "green_score":      green_score,
            "efficiency_score": efficiency_score,
        })

    return results


def compute_insights(models: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Derive the 4 named insights from a list of compute_efficiency() results.
    Returns a summary dict with model name + value for each insight.
    """
    if not models:
        return {}

    best_acc   = max(models, key=lambda m: m["accuracy"])
    most_eff   = max(models, key=lambda m: m["green_score"])
    best_trade = max(models, key=lambda m: m["efficiency_score"])
    fastest    = min(models, key=lambda m: m["latency"])

    return {
        "best_accuracy": {
            "model":  best_acc["name"],
            "value":  f"{best_acc['accuracy'] * 100:.1f}%",
            "detail": "Highest test accuracy across all models",
        },
        "most_efficient": {
            "model":  most_eff["name"],
            "value":  f"{most_eff['green_score']:.2f}",
            "detail": "Best accuracy-to-CO₂ ratio (green score)",
        },
        "best_tradeoff": {
            "model":  best_trade["name"],
            "value":  f"{best_trade['efficiency_score']:.4f}",
            "detail": "Best weighted efficiency (accuracy − CO₂ − latency)",
        },
        "fastest": {
            "model":  fastest["name"],
            "value":  f"{fastest['latency']:.4f} ms",
            "detail": "Lowest inference latency",
        },
    }


# ---------------------------------------------------------------------------
# Confidence Reliability — predict-only, NOT used in ranking
# ---------------------------------------------------------------------------

def confidence_reliability(top1_confidence: float) -> str:
    """
    Convert a raw top-1 confidence score to a human-readable reliability label.
    Used exclusively inside /predict responses — never in scoring or ranking.

    Parameters
    ----------
    top1_confidence : float   in [0.0, 1.0]

    Returns
    -------
    "High" | "Medium" | "Low"
    """
    if top1_confidence > 0.85:
        return "High"
    elif top1_confidence > 0.60:
        return "Medium"
    else:
        return "Low"


# ---------------------------------------------------------------------------
# FastAPI endpoint
# ---------------------------------------------------------------------------

@router.get("/efficiency")
async def get_efficiency() -> dict[str, Any]:
    """
    Compute and return efficiency metrics for all models in the leaderboard.

    Response schema
    ---------------
    {
      "models": [
        {
          "name": str,
          "type": str,
          "accuracy": float,
          "co2": float,
          "latency": float,
          "green_score": float,
          "efficiency_score": float
        },
        ...
      ],
      "summary": {
        "best_accuracy":  { "model": str, "value": str, "detail": str },
        "most_efficient": { ... },
        "best_tradeoff":  { ... },
        "fastest":        { ... }
      },
      "ranking_by_efficiency": [str, ...]
    }
    """
    # Defer import to avoid circular dependency at module load time
    from main import _load_leaderboard  # noqa: PLC0415

    try:
        raw = _load_leaderboard()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    models = compute_efficiency(raw)

    if not models:
        raise HTTPException(status_code=503, detail="Leaderboard is empty.")

    insights = compute_insights(models)

    # Rank by efficiency_score descending
    ranked = sorted(models, key=lambda m: m["efficiency_score"], reverse=True)
    ranking_order = [m["name"] for m in ranked]

    return {
        "models":               models,
        "summary":              insights,
        "ranking_by_efficiency": ranking_order,
    }
