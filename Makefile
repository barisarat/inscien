# InScien dev (no Docker). Run the backend (FastAPI) and frontend (Next) natively on the host,
# in two terminals: `make backend` and `make frontend`. Config lives in the in-app Settings page
# (Zotero folder, Ollama URL, OpenAI key, model) - no .env needed.
#
# Host prereqs: uv (https://docs.astral.sh/uv/ - `pacman -S uv`) and Node. TTS is fully bundled
# (Kokoro ships espeak via espeakng-loader, ffmpeg via imageio-ffmpeg), so NO system packages are
# needed. The backend deps pin against Python 3.12; uv fetches it automatically, so no system
# python3.12 is needed. The ~1GB Kokoro voice downloads on demand from the Narrate UI.
.PHONY: setup backend frontend web wheel

setup:   ## one-time: create the backend venv (Python 3.12 via uv) + install backend and frontend deps
	cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv -r requirements.txt
	cd frontend && npm install

backend: ## run FastAPI on http://localhost:8000 (hot reload)
	cd backend && .venv/bin/uvicorn main:app --reload --port 8000

frontend: ## run the Next dev server on http://localhost:3000
	cd frontend && npm run dev

web:     ## build the static UI and vendor it into backend/webui (for the pip/uvx build)
	cd frontend && npm run build
	rm -rf backend/webui && cp -r frontend/out backend/webui

wheel: web  ## build the pip/uvx-installable wheel into backend/dist (run `web` first to refresh the UI)
	cd backend && uv build
