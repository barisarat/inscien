# InScien

A local, private desktop app that turns your own [Zotero](https://www.zotero.org) library
into a navigable map and audio narrations. It runs entirely on your machine, reads your
library read-only, and points every reference back to the exact page in the source PDF.

Downloads and documentation: https://aratbaris.github.io/inscien/

## What it does

- **Map.** A navigable atlas of your Zotero collection: papers placed by similarity and linked
  by shared citations, so you can see the shape of a literature at a glance. The Map needs no
  model and runs offline.
- **Narrate.** Turn a paper into a spoken-audio narration. A model you connect writes the
  script; a local CPU voice ([Kokoro](https://github.com/thewh1teagle/kokoro-onnx), Apache-2.0)
  reads it aloud and saves an mp3 you can replay. No GPU required.
- **Local-first and private.** InScien reads your Zotero library read-only through a private
  snapshot and never modifies it. Nothing leaves your machine except, optionally, the text you
  send to your own cloud model, or public DOI lookups when you build a citation map.
- **Page-precise.** References point back to the exact page in the source PDF, so anything is
  verifiable in a click.

## Download

Grab the installer for your operating system from the
[latest release](https://github.com/aratbaris/inscien/releases/latest):

- Windows: the `..._x64-setup.exe`
- macOS: the `..._aarch64.dmg`
- Linux: the `.AppImage` or `.deb`

Builds are unsigned for now, so you click past a SmartScreen (Windows) or Gatekeeper (macOS)
warning on first launch. Full per-OS steps are in the
[installation guide](https://aratbaris.github.io/inscien/getting-started/installation/).

## Prerequisite: a model for narration

The Map works with no model. Narration needs a model you connect, set in the app's Settings
page (no environment variables, no config files):

- **Local Ollama** (private and free). Install [Ollama](https://ollama.com) and pull a model,
  for example `ollama pull llama3.1:8b`. InScien connects at `http://localhost:11434`.
- **OpenAI** (higher quality, paid). Paste your API key. It is stored only on your machine.

## First run

1. Open Settings and set your Zotero data folder (the folder containing `zotero.sqlite` and
   `storage/`).
2. Connect a model (only needed for narration).
3. Index a collection from the sidebar.
4. Open the Map, or pick a paper and Narrate it. The first narration downloads the voice model
   once (about 1 GB), with a progress bar.

See the [quick start](https://aratbaris.github.io/inscien/getting-started/quick-start/) for
the full walkthrough.

## Run from source (development)

InScien is a FastAPI backend plus a Next.js frontend plus an embedded Qdrant vector store. For
development, run the stack with Docker:

```bash
cp .env.example .env          # set ZOTERO_HOST_DIR to your Zotero data folder
docker compose up             # backend on :8200, frontend on :3200
```

A local Ollama must be running on the host for narration. To build the desktop installers
yourself, see [PACKAGING.md](PACKAGING.md).

## Repository layout

- `backend/` - FastAPI backend (retrieval, Zotero ingestion, Map, narration). Frozen and
  bundled into the desktop app as a sidecar.
- `frontend/` - Next.js UI (static export), reused as-is inside the desktop window.
- `src-tauri/` - the Tauri desktop shell and the cross-OS release CI.
- `site/` - the Astro + Starlight marketing and docs site (deployed to GitHub Pages).

Architecture notes are in [CLAUDE.md](CLAUDE.md).

## Privacy

Your PDFs stay in your Zotero library, mounted read-only. InScien's own state (a SQLite DB,
the search index, and narration audio) lives under a single app-data folder. The only times
anything leaves your machine are if you choose an OpenAI model (the text you send it) or build
a citation map (public DOI lookups to [OpenAlex](https://openalex.org)). Everything else,
including the Map and the local voice, is offline.

## License

MIT - see [LICENSE](LICENSE).
