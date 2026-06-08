#!/usr/bin/env bash

set -euo pipefail

mkdir -p /app/web_uploads /app/annotation_complete /app/deleted_annotations /app/logs /app/model_cache

if id mambauser >/dev/null 2>&1; then
  chown -R mambauser:mambauser /app/web_uploads /app/annotation_complete /app/deleted_annotations /app/logs /app/model_cache
  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u mambauser -- micromamba run -n sambaseannotation python web_app.py
  fi
  exec su -p mambauser -s /bin/bash -c "micromamba run -n sambaseannotation python web_app.py"
fi

exec micromamba run -n sambaseannotation python web_app.py
