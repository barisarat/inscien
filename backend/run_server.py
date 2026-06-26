"""Desktop entrypoint - runs the FastAPI app via uvicorn programmatically.

PyInstaller freezes **this** script (the `uvicorn main:app` CLI doesn't freeze cleanly). The Tauri
desktop shell spawns the frozen binary with the env it needs - `PORT`, `ENV_NAME=production`,
`INSCIEN_DATA_DIR` (OS app-data dir), `FRONTEND_DIST` (bundled static UI), `KOKORO_*`
(bundled weights), `ZOTERO_DATA_DIR` (user-chosen folder). Host is pinned to
loopback - the backend is a private sidecar, never exposed.
"""

import os

import uvicorn

from core.paths import data_dir

# Ensure the durable data dir exists before anything opens the SQLite DB / vector store there.
os.makedirs(data_dir(), exist_ok=True)

from main import app  # noqa: E402 - main runs load_dotenv() + builds the app on import


def main() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
