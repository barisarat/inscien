"""pip / uvx entry point - run InScien as a local web app in the user's own browser.

This is the non-desktop launch path: instead of the Tauri window (whose bundled WebKit is fragile
on new GPUs), the backend serves BOTH the API and the static UI on one loopback port, and we open
the system browser at it. Same one-process shape as the frozen desktop build (see run_server.py),
minus the native window.

Installed as the `inscien` console script (see pyproject.toml). Everything is self-contained:
Kokoro bundles espeak via espeakng-loader, imageio-ffmpeg bundles ffmpeg - no system packages.
"""

import os
import socket
import threading
import webbrowser
from pathlib import Path


def _pick_port(preferred: int = 8000) -> int:
    """Use the preferred port if free, else let the OS hand out any open one."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def main() -> None:
    here = Path(__file__).resolve().parent

    # Production mode: relative API base (no CORS), and serve the vendored static UI.
    os.environ.setdefault("ENV_NAME", "production")
    os.environ.setdefault("FRONTEND_DIST", str(here / "webui"))

    # Durable state goes in the OS per-user app-data dir, not the install location.
    if not (os.getenv("INSCIEN_DATA_DIR") or "").strip():
        from platformdirs import user_data_dir

        os.environ["INSCIEN_DATA_DIR"] = user_data_dir("inscien")
    os.makedirs(os.environ["INSCIEN_DATA_DIR"], exist_ok=True)

    port = int((os.getenv("PORT") or "").strip() or _pick_port())
    url = f"http://127.0.0.1:{port}"

    import uvicorn

    from main import app  # main.py builds the app on import (routers + static mount)

    # Open the browser shortly after uvicorn starts serving.
    threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"InScien running at {url}  (press Ctrl+C to stop)")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
