#!/usr/bin/env bash
# Freeze the backend inside a controlled container — Python 3.12 (matches CI; no host-3.14
# `audioop` breakage) on Debian bookworm (glibc 2.36, so the binary runs on most modern Linux,
# not just the host's bleeding-edge glibc). Output: backend/dist/inscien-backend (host-owned).
#
#   usage:  scripts/build-linux.sh
#   wider portability:  FREEZE_IMAGE=python:3.12-slim-bullseye scripts/build-linux.sh   (glibc 2.31)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${FREEZE_IMAGE:-python:3.12-slim-bookworm}"

docker run --rm \
  -v "$ROOT/backend:/src" -w /src \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "$IMAGE" bash -euc '
    apt-get update -qq && apt-get install -y -qq binutils >/dev/null   # PyInstaller needs objcopy/strip
    pip install -q --upgrade pip pyinstaller
    pip install -q -r requirements.txt
    pyinstaller --clean -y inscien.spec
    chown -R "$HOST_UID:$HOST_GID" dist build 2>/dev/null || true        # keep output host-owned
  '

echo "✓ built in $IMAGE:"
file "$ROOT/backend/dist/inscien-backend"
