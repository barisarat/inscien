# InScien — Desktop packaging (Tauri, experimental)

> **Status: experimental / unsupported.** InScien now ships as `uvx inscien` - a browser-served
> local app (pure-Python wheel on PyPI, published by `.github/workflows/release.yml`). That is the
> recommended and supported way to run it; see [`README.md`](README.md) and [`RUNNING.md`](RUNNING.md).
> The Tauri desktop build below is kept for reference but is no longer part of the release pipeline:
> its bundled WebKit is fragile on newer GPUs, and the Windows/macOS installers cannot be tested
> without those machines. Prefer the `uvx` path.

InScien can also be packaged as a **Tauri desktop app**: a thin native window that spawns the InScien backend
(frozen with PyInstaller) as a sidecar. The backend serves **both** the API and the static UI on a
private loopback port, and the window points at it — so the web frontend is reused verbatim, no
rebuild. The **Map needs no model** (deterministic); **narration** uses a model you connect (local
Ollama or an OpenAI key). ML weights are **not bundled** — the installer stays small (~tens of MB):
the **Kokoro voice** (~1 GB) is downloaded on demand from the Narrate tab with a progress bar, into
the app-data dir. Builds are
**unsigned** for v1.

Targets: **Linux (AppImage/.deb)**, **macOS (.dmg, Apple Silicon)**, **Windows (NSIS .exe)**.

## How it fits together
- `backend/run_server.py` — the frozen entrypoint (`uvicorn.run(app, …)`); reads `PORT` + the path
  env below.
- `backend/core/paths.py` — `INSCIEN_DATA_DIR` redirects **all** durable state (SQLite, the
  OpenAlex citation cache, job records, audio, Zotero snapshot) to the OS
  app-data dir with one var.
- `backend/inscien.spec` — PyInstaller one-file freeze → `dist/inscien-backend`.
- `backend/services/narration/model.py` — the on-demand Kokoro download (presence check + progress
  job); the Narrate tab calls `/api/narrate/model[/download]`. Weights land in `INSCIEN_DATA_DIR/kokoro`.
- `src-tauri/` — the Tauri shell: `main.rs` resolves app-data + the bundled frontend, picks the
  Zotero folder, picks a free port, spawns the sidecar with env, waits for `/health`, opens the
  window at `http://127.0.0.1:<port>`, kills the sidecar on exit. ML-weight paths are left to the
  backend defaults (under `INSCIEN_DATA_DIR`) so the on-demand downloads land where it reads.
- `.github/workflows/release.yml` — the cross-OS CI (freeze → rename sidecar to the target triple →
  `tauri build` → draft GitHub Release). No weight-fetch step — weights are runtime downloads.

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
  ./backend/dist/inscien-backend
# → open http://127.0.0.1:8123 : Map renders; the Narrate tab offers "Download narration voice"
#   (~1 GB) before the first narration. All land under INSCIEN_DATA_DIR (no KOKORO_* env needed -
#   the backend defaults there).
```
Iterate `inscien.spec` until imports/data files resolve (typical fixes: add a `hiddenimport`, or a
`collect_data_files(...)` for a package that ships non-Python files).

## Full app build (one OS)
```bash
cd backend && pyinstaller inscien.spec && cd ..
mkdir -p src-tauri/binaries
cp backend/dist/inscien-backend src-tauri/binaries/inscien-backend-$(rustc -vV | sed -n 's/host: //p')
cargo tauri build --config src-tauri/tauri.conf.json      # → installers under src-tauri/target/*/release/bundle
```

## CI / release
The whole cross-OS build is one push. To cut release `vX.Y.Z`:

```bash
# 1) Bump the in-installer version to match the tag (this is the app/about version,
#    separate from the git tag), then commit it.
#    Edit src-tauri/tauri.conf.json: "version": "X.Y.Z"
git commit -am "bump version to X.Y.Z for release"

# 2) Push main FIRST — the tag build checks out the tagged commit, so all release
#    commits must already be on the remote.
git push origin main

# 3) Tag and push the tag — this triggers .github/workflows/release.yml.
git tag vX.Y.Z
git push origin vX.Y.Z
```

The matrix then builds Linux/macOS/Windows and uploads a **draft** GitHub Release.
Review + publish. (Signing/notarization is a later cycle — v1 ships unsigned.)

## Installing an unsigned v1
- **macOS:** right-click → Open (or `xattr -dr com.apple.quarantine InScien.app`) to bypass Gatekeeper.
- **Windows:** "More info → Run anyway" on the SmartScreen prompt.
- **Linux:** `chmod +x InScien_*.AppImage && ./InScien_*.AppImage` (or install the `.deb`).

## Where data lives (per-user app-data)
- macOS: `~/Library/Application Support/io.inscien.app/`
- Windows: `%APPDATA%\io.inscien.app\`
- Linux: `~/.local/share/io.inscien.app/`

## Auto-update

InScien self-updates via **Tauri's official updater**: on launch it checks the latest GitHub
Release and, if a newer version exists, offers a native "Install now?" dialog that downloads,
replaces, and relaunches the app. The wiring below is already in the repo; the only per-fork
operator step is generating the **signing keypair** (step 1) and bumping the version per release.

**Why this works while still unsigned:** Tauri's updater uses its own **minisign** signature, which
is independent of Apple/Windows code-signing. So v1 can stay unsigned and still self-update. The
whole app updates **atomically** - the frozen Python backend is bundled (`externalBin` +
`resources`), so one update replaces shell + backend + frontend together. User data lives outside
the bundle (`INSCIEN_DATA_DIR`: SQLite, OpenAlex cache, Kokoro weights, Zotero snapshot) and
survives updates.

**Architecture decision - drive the updater from Rust, not the frontend.** The window loads a
*remote* URL (`http://127.0.0.1:<port>/`, served by the backend), so the updater's JS API would
need Tauri remote-IPC access enabled (extra config + security surface). Instead, run the whole flow
natively in `main.rs`: check on startup, prompt with a native dialog (we already depend on
`tauri-plugin-dialog`), download/install, then restart. The frontend stays untouched.

**Manifest hosting: auto-published GitHub Release.** The updater reads
`https://github.com/aratbaris/inscien/releases/latest/download/latest.json`. A draft release 404s
on that path, so the release must be **published** (this plan flips `releaseDraft` to `false`).
`.deb` cannot self-update; deb users stay manual. The auto-updating Linux artifact is the AppImage.

### How it is wired (and the one step you must do)

1. **Signing keypair - OPERATOR ACTION, one-time (not in git):**
   ```bash
   cargo tauri signer generate -w ~/.tauri/inscien-updater.key
   ```
   Add the **private key** and its **password** as GitHub repo secrets
   `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Paste the **public key**
   into `tauri.conf.json`, replacing the `REPLACE_WITH_MINISIGN_PUBLIC_KEY` placeholder. Keep the
   private key backed up - losing it breaks the update chain for all installed clients. **Until this
   is done the build still works, but updates are not verifiable - do not publish a release without
   a real pubkey.** The rest (steps 2-7) is already committed:

2. **`src-tauri/tauri.conf.json`** - emits updater artifacts + sets the endpoint/pubkey:
   ```json
   "bundle": { "createUpdaterArtifacts": true, ... },
   "plugins": {
     "updater": {
       "endpoints": ["https://github.com/aratbaris/inscien/releases/latest/download/latest.json"],
       "pubkey": "<minisign public key from step 1>"
     }
   }
   ```

3. **`src-tauri/Cargo.toml`** - add `tauri-plugin-updater = "2"` (restart uses core
   `AppHandle::restart()`, no extra plugin).

4. **`src-tauri/capabilities/default.json`** - add `"updater:default"` to `permissions`.

5. **`src-tauri/src/main.rs`** - register the plugin (`.plugin(tauri_plugin_updater::Builder::new().build())`)
   and, after the backend is healthy, spawn an async check:
   ```rust
   use tauri_plugin_updater::UpdaterExt;
   if let Ok(Some(update)) = handle.updater()?.check().await {
       // native dialog: "InScien <new> is available. Install now?"
       // on yes: update.download_and_install(|_,_| {}, || {}).await?; handle.restart();
   }
   ```
   Fail soft: any updater error (offline, no release) is logged and ignored - the app launches
   normally.

6. **`.github/workflows/release.yml`** - on the `tauri-apps/tauri-action` step, add the signing env
   so `.sig` files and `latest.json` are produced and uploaded, and flip the release to published:
   ```yaml
   env:
     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
   with:
     releaseDraft: false   # was true - the updater cannot read draft-release assets
     ...
   ```
   The 3-OS matrix all upload to the same tag; tauri-action merges their entries into one
   `latest.json`.

7. **Unify the version.** `tauri.conf.json` `version` is the updater's comparison source - bump it
   per release. Align `Cargo.toml` `version` and `backend/main.py` (`version="..."`, two spots) to
   match so the About/API version is honest.

### Caveat to design for

Self-update means a **new backend can open an old `INSCIEN_DATA_DIR`**. Today's schema strategy
(`Base.metadata.create_all` + additive `core/db.ensure_app_settings_columns`) is forward-compatible
**only for additive changes** (new tables, new `app_settings` columns). The first non-additive
schema change will need a real migration step - flag it then; do not let a destructive change ship
behind the updater silently.

### Rollout / test

- First updater-enabled release is a normal tag cut (see "CI / release" above) once the keypair +
  secrets (step 1) are in place and the placeholder pubkey is replaced.
- To verify the chain: install release `vN`, then tag `vN+1`; on next launch the native dialog
  should offer the update, install it, and relaunch into `vN+1`. There is no rollback - test on a
  pre-release tag before announcing.

## Known iterate points (expected during the first builds)
- `inscien.spec` native-dep collection (onnxruntime / pymupdf data files).
- Tauri 2 API drift in `main.rs` (shell-sidecar scope in `capabilities/default.json`, dialog
  `FilePath`→string, window builder) — fix against compiler/`tauri dev` errors.
- onefile startup time: if the extract-on-launch delay is large, switch the spec to **onedir** and
  ship it as a resource folder (spawn the inner binary) instead of an `externalBin`.
- Narration requires a model: with no Ollama/key the app shows the in-app "connect a model" gate.
