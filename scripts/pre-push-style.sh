#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

format_frontend_local() {
  if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm run format)
    return 0
  fi
  return 1
}

format_frontend_docker() {
  docker exec react sh -lc "cd /app && npm run format"
}

format_backend_local() {
  if command -v python3 >/dev/null 2>&1 \
    && python3 -m black --version >/dev/null 2>&1 \
    && python3 -m isort --version-number >/dev/null 2>&1; then
    (cd backend && python3 -m black . && python3 -m isort .)
    return 0
  fi
  return 1
}

format_backend_docker() {
  docker exec django sh -lc "cd /app && python -m black . && python -m isort ."
}

echo "[pre-push] Running style formatters for frontend and backend..."

frontend_ok=0
backend_ok=0

if docker exec react sh -lc "true" >/dev/null 2>&1; then
  format_frontend_docker && frontend_ok=1 || frontend_ok=0
else
  format_frontend_local && frontend_ok=1 || frontend_ok=0
fi

if docker exec django sh -lc "true" >/dev/null 2>&1; then
  format_backend_docker && backend_ok=1 || backend_ok=0
else
  format_backend_local && backend_ok=1 || backend_ok=0
fi

if [[ "$frontend_ok" -ne 1 || "$backend_ok" -ne 1 ]]; then
  echo "[pre-push] Style cleanup could not complete."
  if [[ "$frontend_ok" -ne 1 ]]; then
    echo " - Frontend formatter failed. Ensure npm is available or the react container is running."
  fi
  if [[ "$backend_ok" -ne 1 ]]; then
    echo " - Backend formatter failed. Ensure black/isort are installed or the django container is running with updated requirements."
  fi
  exit 1
fi

if ! git diff --quiet -- frontend backend; then
  echo "[pre-push] Formatting changed files in frontend/backend."
  echo "[pre-push] Review, stage, and commit those changes, then push again."
  git status --short -- frontend backend
  exit 1
fi

echo "[pre-push] Style cleanup complete. Proceeding with push."
