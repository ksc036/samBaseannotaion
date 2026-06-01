#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${ROOT_DIR}/runtime.env" ]]; then
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/runtime.env"
fi

ENV_NAME="${APP_ENV_NAME:-sambaseannotation}"
MINIFORGE_ROOT="${MINIFORGE_ROOT:-${HOME}/miniforge3}"

find_conda_sh() {
  local candidates=(
    "${ROOT_DIR}/../miniforge3/etc/profile.d/conda.sh"
    "${ROOT_DIR}/miniforge3/etc/profile.d/conda.sh"
    "${MINIFORGE_ROOT}/etc/profile.d/conda.sh"
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

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    echo "curl 또는 wget이 필요합니다." >&2
    exit 1
  fi
}

install_miniforge() {
  local os arch installer_name installer_url installer_path
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)
      case "$arch" in
        x86_64|amd64) installer_name="Miniforge3-Linux-x86_64.sh" ;;
        aarch64|arm64) installer_name="Miniforge3-Linux-aarch64.sh" ;;
        ppc64le) installer_name="Miniforge3-Linux-ppc64le.sh" ;;
        *)
          echo "지원하지 않는 Linux 아키텍처입니다: $arch" >&2
          exit 1
          ;;
      esac
      ;;
    Darwin)
      case "$arch" in
        x86_64) installer_name="Miniforge3-MacOSX-x86_64.sh" ;;
        arm64) installer_name="Miniforge3-MacOSX-arm64.sh" ;;
        *)
          echo "지원하지 않는 macOS 아키텍처입니다: $arch" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "지원하지 않는 운영체제입니다: $os" >&2
      exit 1
      ;;
  esac

  installer_url="https://github.com/conda-forge/miniforge/releases/latest/download/${installer_name}"
  installer_path="$(mktemp "${TMPDIR:-/tmp}/miniforge-installer.XXXXXX.sh")"

  echo "Miniforge를 찾지 못했습니다. 자동 설치를 시작합니다."
  echo "Downloading: ${installer_url}"
  download_file "$installer_url" "$installer_path"
  bash "$installer_path" -b -p "$MINIFORGE_ROOT"
  rm -f "$installer_path"
}

if command -v conda >/dev/null 2>&1; then
  eval "$(conda shell.bash hook)"
elif conda_sh="$(find_conda_sh)"; then
  # shellcheck disable=SC1090
  source "${conda_sh}"
else
  install_miniforge
  if conda_sh="$(find_conda_sh)"; then
    # shellcheck disable=SC1090
    source "${conda_sh}"
  else
    echo "Miniforge 설치 후 conda 초기화에 실패했습니다." >&2
    exit 1
  fi
fi

cd "${ROOT_DIR}"

if conda env list | awk '{print $1}' | grep -qx "${ENV_NAME}"; then
  echo "Updating conda environment: ${ENV_NAME}"
  conda env update -n "${ENV_NAME}" -f environment.yml --prune
else
  echo "Creating conda environment: ${ENV_NAME}"
  conda env create -n "${ENV_NAME}" -f environment.yml
fi

echo "Environment is ready: ${ENV_NAME}"
