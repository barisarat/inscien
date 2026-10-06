# InScien development. Requires uv and Node (Node only to build the UI; the installed tool needs neither).
.PHONY: setup backend frontend web wheel test

setup:     ## one-time: Python env with the package in editable mode, and the frontend deps
	uv venv --python 3.12 .venv && uv pip install --python .venv -e ".[dev]"
	cd frontend && npm install

backend:   ## the API on http://localhost:8000 with reload (UI from the Next dev server)
	.venv/bin/uvicorn inscien.app:app --reload --port 8000

frontend:  ## the Next dev server on http://localhost:3000
	cd frontend && npm run dev

web:       ## build the static UI and vendor it into the package
	cd frontend && npm run build
	rm -rf src/inscien/webui && cp -r frontend/out src/inscien/webui

wheel: web ## build the wheel and sdist into dist/
	uv build

test:
	.venv/bin/pytest -q
