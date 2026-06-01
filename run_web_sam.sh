#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${ROOT_DIR}/runtime.env" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/runtime.env"
fi

ENV_NAME="${APP_ENV_NAME:-sambaseannotation}"
PYTHON_BIN="${PYTHON_BIN:-python}"

find_conda_sh() {
  local candidates=(
    "${ROOT_DIR}/../miniforge3/etc/profile.d/conda.sh"
    "${ROOT_DIR}/miniforge3/etc/profile.d/conda.sh"
    "${HOME}/miniforge3/etc/profile.d/conda.sh"
    "${HOME}/mambaforge/etc/profile.d/conda.sh"
    "${HOME}/miniconda3/etc/profile.d/conda.sh"
    "/opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh"
  )

  for path in "${candidates[@]}"; do
    if [[ -f "${path}" ]]; then
      printf '%s\n' "${path}"
      return 0
    fi
  done

  return 1
}

if command -v conda >/dev/null 2>&1; then
  eval "$(conda shell.bash hook)"
elif conda_sh="$(find_conda_sh)"; then
  # shellcheck disable=SC1090
  source "${conda_sh}"
else
  cat <<'EOF'
conda 또는 Miniforge를 찾지 못했습니다.
먼저 setup_web_sam.sh로 환경을 설치하거나 Miniforge를 설치해 주세요.
EOF
  exit 1
fi

conda activate "${ENV_NAME}"
cd "${ROOT_DIR}"

export APP_HOST="${APP_HOST:-0.0.0.0}"
export APP_PORT="${APP_PORT:-8765}"
exec "${PYTHON_BIN}" "${APP_ENTRY:-web_app.py}"
