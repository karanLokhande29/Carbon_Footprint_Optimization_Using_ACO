"""
utils.py — Cross-cutting utilities for the EC_Project FastAPI backend.

Responsibilities
----------------
* CUDA / CPU device detection (mirrors training-script logic)
* Image decoding, resizing, and CIFAR-100 normalisation
* Async-compatible latency timer (context manager)
* CIFAR-100 fine-grained class labels (100 classes, index == class id)
"""

from __future__ import annotations

import io
import time
import contextlib
from typing import AsyncGenerator

import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image

# ---------------------------------------------------------------------------
# CIFAR-100 normalisation constants  (identical to training pipeline)
# ---------------------------------------------------------------------------
CIFAR100_MEAN = (0.5071, 0.4867, 0.4408)
CIFAR100_STD  = (0.2675, 0.2565, 0.2761)

# ---------------------------------------------------------------------------
# Official CIFAR-100 fine-grained label list (alphabetical within superclass)
# Index i corresponds to class label i produced by the models.
# ---------------------------------------------------------------------------
CIFAR100_CLASSES: list[str] = [
    "apple", "aquarium_fish", "baby", "bear", "beaver",
    "bed", "bee", "beetle", "bicycle", "bottle",
    "bowl", "boy", "bridge", "bus", "butterfly",
    "camel", "can", "castle", "caterpillar", "cattle",
    "chair", "chimpanzee", "clock", "cloud", "cockroach",
    "couch", "crab", "crocodile", "cup", "dinosaur",
    "dolphin", "elephant", "flatfish", "forest", "fox",
    "girl", "hamster", "house", "kangaroo", "keyboard",
    "lamp", "lawn_mower", "leopard", "lion", "lizard",
    "lobster", "man", "maple_tree", "motorcycle", "mountain",
    "mouse", "mushroom", "oak_tree", "orange", "orchid",
    "otter", "palm_tree", "pear", "pickup_truck", "pine_tree",
    "plain", "plate", "poppy", "porcupine", "possum",
    "rabbit", "raccoon", "ray", "road", "rocket",
    "rose", "sea", "seal", "shark", "shrew",
    "skunk", "skyscraper", "snail", "snake", "spider",
    "squirrel", "streetcar", "sunflower", "sweet_pepper", "table",
    "tank", "telephone", "television", "tiger", "tractor",
    "train", "trout", "tulip", "turtle", "wardrobe",
    "whale", "willow_tree", "wolf", "woman", "worm",
]

assert len(CIFAR100_CLASSES) == 100, "CIFAR-100 class list must have exactly 100 entries."


# ---------------------------------------------------------------------------
# Device detection
# ---------------------------------------------------------------------------

def get_device() -> torch.device:
    """
    Return a validated CUDA device if available, else CPU.
    Mirrors the _validated_device() logic in the training script so that
    inference uses the same device selection heuristic.
    """
    if not torch.cuda.is_available():
        return torch.device("cpu")
    try:
        probe = torch.zeros(1, device="cuda") + 1
        del probe
        torch.cuda.empty_cache()
        return torch.device("cuda")
    except Exception:
        return torch.device("cpu")


DEVICE: torch.device = get_device()
DEVICE_TYPE: str = DEVICE.type          # "cuda" or "cpu"


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------

# Reusable transforms — built once, thread-safe (no internal state mutation)
_to_tensor   = T.ToTensor()
_normalise   = T.Normalize(CIFAR100_MEAN, CIFAR100_STD)
_resize_32   = T.Resize((32, 32),  interpolation=T.InterpolationMode.BILINEAR, antialias=True)
_resize_224  = T.Resize((224, 224), interpolation=T.InterpolationMode.BILINEAR, antialias=True)


def decode_image_bytes(raw: bytes) -> Image.Image:
    """Decode raw bytes (JPEG / PNG / BMP / …) into an RGB PIL Image."""
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot decode image bytes: {exc}") from exc
    return img


def preprocess_for_dl(
    img: Image.Image,
    target_size: int = 32,
) -> torch.Tensor:
    """
    Convert a PIL Image to a normalised float32 tensor with shape (1, 3, H, W).

    Parameters
    ----------
    img         : RGB PIL Image (any resolution)
    target_size : 32 for ResNet50 / EfficientNet-B3, 224 for ViT-Tiny
    """
    resize = _resize_224 if target_size == 224 else _resize_32
    tensor = _normalise(_to_tensor(resize(img)))   # (3, H, W) float32
    return tensor.unsqueeze(0)                      # (1, 3, H, W)


def extract_numpy_image(img: Image.Image) -> np.ndarray:
    """Return a (1, 3, 32, 32) float32 numpy array (used for classical pipeline)."""
    return preprocess_for_dl(img, target_size=32).numpy()


# ---------------------------------------------------------------------------
# Latency timer
# ---------------------------------------------------------------------------

class LatencyTimer:
    """Synchronous context manager that measures wall-clock latency in ms."""

    def __init__(self) -> None:
        self.elapsed_ms: float = 0.0
        self._start: float = 0.0

    def __enter__(self) -> "LatencyTimer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_: object) -> None:
        self.elapsed_ms = (time.perf_counter() - self._start) * 1_000


@contextlib.asynccontextmanager
async def async_timer() -> AsyncGenerator[LatencyTimer, None]:
    """Async context manager wrapping LatencyTimer for use in async routes."""
    timer = LatencyTimer()
    timer._start = time.perf_counter()
    try:
        yield timer
    finally:
        timer.elapsed_ms = (time.perf_counter() - timer._start) * 1_000
