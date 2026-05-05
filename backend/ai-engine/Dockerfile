# syntax=docker/dockerfile:1.7

FROM python:3.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_HEALTH_FILE=/tmp/trafiq-ai-ready

WORKDIR /app

# OpenCV needs these runtime libraries even when no GUI display is used.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system trafiq \
    && useradd --system --gid trafiq --create-home --home-dir /home/trafiq trafiq

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY detect_video.py prompts.py cameras.json cameras.schema.json ./
COPY models ./models

RUN mkdir -p snapshots videos \
    && chown -R trafiq:trafiq /app /tmp

USER trafiq

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import os,sys; sys.exit(0 if os.path.exists(os.environ.get('AI_HEALTH_FILE','/tmp/trafiq-ai-ready')) else 1)"

CMD ["python", "detect_video.py"]
