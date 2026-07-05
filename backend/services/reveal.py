"""Open the OS file manager at a given path (reveal/select the file).

InScien is browser-served, but the backend is a local process - so it can do what the sandboxed
browser cannot: pop the native file manager. Used to show a saved narration mp3 in its folder.
Callers pass a server-derived path (never client input), so no path sanitization is needed here.
"""

import os
import platform
import subprocess


def reveal_path(path: str) -> None:
    """Reveal `path` in the OS file manager, selecting the file where the platform supports it.

    Raises FileNotFoundError if `path` is missing, or RuntimeError if the platform's file manager
    can't be launched. Never runs through a shell - args are passed as a list."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    system = platform.system()
    try:
        if system == "Windows":
            # explorer selects the file; it returns a non-zero exit even on success, so don't check.
            subprocess.run(["explorer", f"/select,{os.path.normpath(path)}"])
        elif system == "Darwin":
            subprocess.run(["open", "-R", path], check=True)
        else:
            # Linux / other: no portable "select the file", so open the containing folder.
            subprocess.run(["xdg-open", os.path.dirname(path) or "."], check=True)
    except FileNotFoundError as e:  # the launcher binary (explorer/open/xdg-open) isn't present
        raise RuntimeError(f"no file manager available on this system") from e
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"file manager exited with an error") from e
