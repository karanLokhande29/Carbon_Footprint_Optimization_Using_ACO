# ──────────────────────────────────────────────────────────
# EC_Project — Backend Dockerfile  (FastAPI + ML models)
# ──────────────────────────────────────────────────────────
FROM python:3.10-slim

WORKDIR /app

# Install CPU-only PyTorch first (avoids downloading ~2GB of CUDA libs)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python deps (layer cache optimisation)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
