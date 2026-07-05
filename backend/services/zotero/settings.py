"""Config for the Zotero-native source.

InScien rides on the user's *local* Zotero library - `zotero.sqlite` + a
`storage/<KEY>/<file>.pdf` tree - read-only, via a private snapshot copy (never the
live DB; Zotero may hold a WAL lock). The data dir is resolved (see `get_zotero_settings`)
from the in-app setting, then the `ZOTERO_DATA_DIR` env, then auto-detection of the user's
Zotero install (`detect.py`: default `$HOME/Zotero`, or the custom dir from `prefs.js`). No
Zotero web API, no API key.
"""

import logging
import os

from core.paths import data_path

logger = logging.getLogger(__name__)


# Item types treated as "heavy" and unselected by default in the navigator - they
# blow up chunk counts and indexing time. The user can still opt them in explicitly.
BOOK_ITEM_TYPES = {"book", "bookSection", "thesis"}


def _db_zotero_dir():
    """The Zotero folder configured in-app (Settings), read on an independent session so this
    never disturbs a request's session. Returns None if unset or unreadable (e.g. before the
    DB exists), so the caller falls back to the env/default."""
    try:
        from sqlalchemy.orm import Session

        from core.db import engine
        from repositories.settings_repository import get_settings

        session = Session(engine)
        try:
            return (get_settings(session).zotero_data_dir or "").strip() or None
        finally:
            session.close()
    except Exception:
        logger.debug("could not read zotero_data_dir from settings; using env/default", exc_info=True)
        return None


def get_zotero_settings():
    # Resolution order: in-app setting (desktop build) wins, then the ZOTERO_DATA_DIR env
    # (host/dev), then auto-detection of the user's Zotero install (default `$HOME/Zotero` or the
    # custom dir from prefs.js), and finally the default path even if it doesn't exist yet so the
    # error messages point somewhere sane.
    from services.zotero.detect import default_zotero_data_dir, detect_zotero_data_dir

    data_dir = (
        _db_zotero_dir()
        or (os.getenv("ZOTERO_DATA_DIR") or "").strip()
        or detect_zotero_data_dir()
        or default_zotero_data_dir()
    )
    return {
        "data_dir": data_dir,
        # Live DB + storage tree (read-only mount). Overridable for tests.
        "db_path": os.getenv("ZOTERO_DB_PATH", os.path.join(data_dir, "zotero.sqlite")),
        "storage_dir": os.getenv("ZOTERO_STORAGE_DIR", os.path.join(data_dir, "storage")),
        # Our private working copy, under the writable data dir.
        "snapshot_path": os.getenv("ZOTERO_SNAPSHOT_PATH") or data_path("zotero-snapshot.sqlite"),
    }
