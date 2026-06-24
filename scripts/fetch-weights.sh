#!/usr/bin/env bash
# Fetch the ML weights bundled into the desktop app (fully-offline v1) so Tauri can ship them as
# resources: Kokoro TTS (narration) + the bge-small embedding model (Map indexing).
#
#   usage:  scripts/fetch-weights.sh
#   output: src-tauri/resources/{kokoro,fastembed}/...
#
# Idempotent — skips files that already exist. Run before `tauri build` (the CI does this).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$ROOT/src-tauri/resources"
KOKORO_DIR="$RES/kokoro"
FASTEMBED_DIR="$RES/fastembed"
mkdir -p "$KOKORO_DIR" "$FASTEMBED_DIR"

# --- Kokoro TTS weights (Apache-2.0) ---------------------------------------------------------
KOKORO_BASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [ ! -f "$KOKORO_DIR/$f" ]; then
    echo "↓ kokoro/$f"
    curl -fSL --retry 3 -o "$KOKORO_DIR/$f" "$KOKORO_BASE/$f"
  fi
done

# --- bge-small embedding model (pre-cache for fastembed) -------------------------------------
# Populate the fastembed cache layout so the app needs no network on first index. The Tauri
# shell copies this into the writable app-data dir on first launch (fastembed writes there).
if [ -z "$(ls -A "$FASTEMBED_DIR" 2>/dev/null)" ]; then
  echo "↓ fastembed bge-small-en-v1.5"
  FE_DIR="$FASTEMBED_DIR" python3 - <<'PY'
import os
from fastembed import TextEmbedding
TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=os.environ["FE_DIR"])
PY
fi

echo "✓ weights ready under $RES"
du -sh "$KOKORO_DIR" "$FASTEMBED_DIR" 2>/dev/null || true
