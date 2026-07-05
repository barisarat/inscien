"""Best-effort auto-detection of the user's local Zotero data directory.

Zotero's default data dir is `$HOME/Zotero` on every OS (Windows `C:\\Users\\<you>\\Zotero`,
macOS / Linux `~/Zotero`). Users who moved it have the real path recorded in their Zotero
`prefs.js` under `extensions.zotero.dataDir`. We look there first, then fall back to the default,
and only accept a candidate that actually contains `zotero.sqlite`. This is read-only - we never
write to the Zotero directory.
"""

import json
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# user_pref("extensions.zotero.dataDir", "…"); - value is a JS string literal (escaped on Windows).
_DATADIR_RE = re.compile(
    r'user_pref\(\s*"extensions\.zotero\.dataDir"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)'
)


def _home() -> Path:
    return Path(os.path.expanduser("~"))


def _profile_bases():
    """Directories that hold Zotero profile folders (each may contain a `prefs.js`), per OS."""
    home = _home()
    bases = []
    appdata = os.getenv("APPDATA")
    if appdata:  # Windows
        bases.append(Path(appdata) / "Zotero" / "Zotero" / "Profiles")
    bases.append(home / "Library" / "Application Support" / "Zotero" / "Profiles")  # macOS
    bases.append(home / ".zotero" / "zotero")  # Linux
    return bases


def _custom_dir_from_prefs():
    """Return a user-moved data dir from Zotero's prefs.js, or None."""
    for base in _profile_bases():
        try:
            if not base.is_dir():
                continue
            for prefs in base.glob("*/prefs.js"):
                try:
                    text = prefs.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                m = _DATADIR_RE.search(text)
                if not m:
                    continue
                raw = m.group(1)
                try:
                    return json.loads(f'"{raw}"')  # unescape the JS/JSON string (Windows `\\`)
                except ValueError:
                    return raw
        except OSError:
            continue
    return None


def _is_zotero_dir(path) -> bool:
    return bool(path) and os.path.isfile(os.path.join(path, "zotero.sqlite"))


def default_zotero_data_dir() -> str:
    """Zotero's out-of-the-box data dir, `$HOME/Zotero` - used as the fallback path even when it
    doesn't exist yet, so messages and the Settings placeholder reference a sane location."""
    return str(_home() / "Zotero")


def detect_zotero_data_dir():
    """Return the user's Zotero data dir if one containing `zotero.sqlite` is found, else None.
    Order: a custom dir from prefs.js, then the default `$HOME/Zotero`."""
    candidates = []
    custom = _custom_dir_from_prefs()
    if custom:
        candidates.append(custom)
    candidates.append(default_zotero_data_dir())
    for c in candidates:
        if _is_zotero_dir(c):
            logger.info("auto-detected Zotero data dir: %s", c)
            return c
    return None
