# Research Data Platform: one container that serves the React app and the Flask API.

# ---- Stage 1: build the React frontend ---------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Flask API, which also serves the built frontend ------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    RDP_MAX_UPLOAD_MB=20 \
    RDP_CACHE_SIZE=3 \
    RDP_DATASET_TTL_HOURS=6
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Run as a regular user rather than root.
RUN useradd --create-home appuser && chown -R appuser /app/backend
USER appuser

EXPOSE 8000
# Hosts like Render set $PORT. One worker, because parsed datasets are cached
# in that process's memory; threads handle concurrent requests.
CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --threads 8 --timeout 120
