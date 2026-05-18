#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_NAME="${MICRO_SAM_ENV_NAME:-sambaseannotation}"
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
먼저 macOS에 Miniforge를 설치한 뒤 다시 실행해 주세요.
https://conda-forge.org/download/
EOF
  exit 1
fi

conda activate "${ENV_NAME}"
cd "${ROOT_DIR}"

exec "${PYTHON_BIN}" web_app.py
