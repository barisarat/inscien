# InScien — Desktop packaging (Tauri v1)

InScien ships as a **Tauri desktop app**: a thin native window that spawns the InScien backend
(frozen with PyInstaller) as a sidecar. The backend serves **both** the API and the static UI on a
private loopback port, and the window points at it — so the web frontend is reused verbatim, no
rebuild. The **Map needs no model** (deterministic); **narration** uses a model you connect (local
Ollama or an OpenAI key). For v1 the ML weights are **bundled** (Kokoro TTS + the bge-small
embedding model) → fully offline, ~1.5GB installer. Builds are **unsigned** for v1.

Targets: **Linux (AppImage/.deb)**, **macOS (.dmg, Apple Silicon)**, **Windows (NSIS .exe)**.

## How it fits together
- `backend/run_server.py` — the frozen entrypoint (`uvicorn.run(app, …)`); reads `PORT` + the path
  env below.
- `backend/core/paths.py` — `INSCIEN_DATA_DIR` redirects **all** durable state (SQLite, Qdrant,
  caches, job records, audio, Zotero snapshot, fastembed cache) to the OS app-data dir with one var.
- `backend/inscien.spec` — PyInstaller one-file freeze → `dist/inscien-backend`.
- `scripts/fetch-weights.sh` — pulls Kokoro + bge-small into `src-tauri/resources/{kokoro,fastembed}`.
- `src-tauri/` — the Tauri shell: `main.rs` resolves app-data + bundled resources, seeds the
  fastembed cache, picks the Zotero folder (first-run dialog), picks a free port, spawns the sidecar
  with env, waits for `/health`, opens the window at `http://127.0.0.1:<port>`, kills the sidecar on
  exit.
- `.github/workflows/release.yml` — the cross-OS CI (freeze → rename sidecar to the target triple →
  fetch weights → `tauri build` → draft GitHub Release).

## One-time setup
- **Icons** (not in git): generate from a 1024×1024 PNG once — `cargo tauri icon path/to/icon.png`
  (writes `src-tauri/icons/`).
- **Toolchain:** Node 24, Python 3.12, Rust stable + the Tauri CLI (`cargo install tauri-cli` or
  `npm i -D @tauri-apps/cli`), plus the OS deps (Linux: `webkit2gtk-4.1`, `ffmpeg`, `espeak-ng`).

## Local build / the de-risking spike (do this first, on Linux)
The one real unknown is freezing the native stack (onnxruntime, pymupdf, kokoro-onnx). Validate the
frozen backend **before** the full Tauri build:

```bash
# 1) Freeze the backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt pyinstaller
pyinstaller inscien.spec                      # → backend/dist/inscien-backend

# 2) Run it standalone with the desktop env (mimics what Tauri sets)
mkdir -p /tmp/inscien-data
cd .. && (cd frontend && npm ci && npm run build)   # → frontend/out
INSCIEN_DATA_DIR=/tmp/inscien-data \
FRONTEND_DIST="$PWD/frontend/out" \
ZOTERO_DATA_DIR="$HOME/Zotero" \
ENV_NAME=production PORT=8123 \
KOKORO_MODEL_PATH=... KOKORO_VOICES_PATH=...  \   # from scripts/fetch-weights.sh
  ./backend/dist/inscien-backend
# → open http://127.0.0.1:8123 : Map should render; indexing uses embeddings; narration uses Kokoro.
```
Iterate `inscien.spec` until imports/data files resolve (typical fixes: add a `hiddenimport`, or a
`collect_data_files(...)` for a package that ships non-Python files).

## Full app build (one OS)
```bash
scripts/fetch-weights.sh                                  # bundle weights
cd backend && pyinstaller inscien.spec && cd ..
mkdir -p src-tauri/binaries
cp backend/dist/inscien-backend src-tauri/binaries/inscien-backend-$(rustc -vV | sed -n 's/host: //p')
cargo tauri build --config src-tauri/tauri.conf.json      # → installers under src-tauri/target/*/release/bundle
```

## CI / release
Push a tag `vX.Y.Z` → the matrix builds Linux/macOS/Windows and uploads a **draft** GitHub Release.
Review + publish. (Signing/notarization is a later cycle — v1 ships unsigned.)

## Installing an unsigned v1
- **macOS:** right-click → Open (or `xattr -dr com.apple.quarantine InScien.app`) to bypass Gatekeeper.
- **Windows:** "More info → Run anyway" on the SmartScreen prompt.
- **Linux:** `chmod +x InScien_*.AppImage && ./InScien_*.AppImage` (or install the `.deb`).

## Where data lives (per-user app-data)
- macOS: `~/Library/Application Support/io.inscien.app/`
- Windows: `%APPDATA%\io.inscien.app\`
- Linux: `~/.local/share/io.inscien.app/`

## Known iterate points (expected during the first builds)
- `inscien.spec` native-dep collection (onnxruntime / pymupdf / fastembed data files).
- Tauri 2 API drift in `main.rs` (shell-sidecar scope in `capabilities/default.json`, dialog
  `FilePath`→string, window builder) — fix against compiler/`tauri dev` errors.
- onefile startup time: if the extract-on-launch delay is large, switch the spec to **onedir** and
  ship it as a resource folder (spawn the inner binary) instead of an `externalBin`.
- Narration requires a model: with no Ollama/key the app shows the in-app "connect a model" gate.
