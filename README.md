# InScien

A local, private desktop app that turns your own [Zotero](https://www.zotero.org) library
into a navigable map and audio narrations. It runs on your machine and reads your library
read-only, so your data stays yours.

Downloads and documentation: https://inscien.com/

## What it does

- **Map.** A citation graph of your Zotero collection from public OpenAlex data: select papers
  and see what they cite (References) and what cites them (Cited by). The Map needs no model.
- **Narrate.** Turn a paper into a spoken-audio narration. A model you connect writes the
  script; a local CPU voice ([Kokoro](https://github.com/thewh1teagle/kokoro-onnx), Apache-2.0)
  reads it aloud and saves an mp3 you can replay. No GPU required.
- **Local-first and private.** InScien reads your Zotero library read-only through a private
  snapshot and never modifies it. Nothing leaves your machine except, optionally, the text you
  send to your own cloud model, or public DOI lookups when you build a citation map.
- **Read the source.** Open any paper's original PDF inside the app to read it or check it
  against the map.

## Download

Grab the installer for your operating system from the
[latest release](https://github.com/aratbaris/inscien/releases/latest):

- Windows: the `..._x64-setup.exe`
- macOS: the `..._aarch64.dmg`
- Linux: the `.AppImage` or `.deb`

Builds are unsigned for now, so you click past a SmartScreen (Windows) or Gatekeeper (macOS)
warning on first launch. Full per-OS steps are in the
[installation guide](https://inscien.com/getting-started/installation/).

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
3. Select papers in the sidebar and open the Map - it fetches their citations from OpenAlex.
   (Optionally hit "Fetch citations" to warm the whole library in the background.)
4. Or pick a paper and Narrate it. The first narration downloads the voice model once
   (about 1 GB), with a progress bar.

See the [quick start](https://inscien.com/getting-started/quick-start/) for
the full walkthrough.

## Run from source (development)

InScien is a FastAPI backend plus a Next.js frontend; citation data is cached in a single JSON
file (no database beyond SQLite for settings). Dev runs natively on the host - no Docker, no
`.env` (config lives in the in-app Settings page).

Host prereqs: [`uv`](https://docs.astral.sh/uv/), Node, and `espeak-ng` (Kokoro TTS
phonemization; `apt install espeak-ng` / `brew install espeak-ng`). The backend pins to Python
3.12; `uv` fetches it automatically, so no system Python 3.12 is needed.

```bash
make setup        # one-time: backend venv + deps, frontend deps
make backend      # terminal 1: FastAPI on http://localhost:8000
make frontend     # terminal 2: Next dev server on http://localhost:3000
```

Then open http://localhost:3000 and set your Zotero data folder (and, for narration, a model)
in Settings. A local Ollama running on the host (`http://localhost:11434`) covers narration for
free. To build the desktop installers yourself, see [PACKAGING.md](PACKAGING.md).

## Privacy

Your PDFs stay in your Zotero library, mounted read-only. InScien's own state (a SQLite DB for
settings, the OpenAlex citation cache, and narration audio) lives under a single app-data folder.
The only times anything leaves your machine are if you choose an OpenAI model (the text you send
it) or build the Map (public DOI lookups to [OpenAlex](https://openalex.org)). Everything else,
including narration and the local voice, runs offline.

## License

MIT - see [LICENSE](LICENSE).
