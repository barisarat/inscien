from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from inscien.core.db import get_db
from inscien.repositories import settings_repository as settings_repo
from inscien.schemas.settings import SettingsIn, SettingsOut
from inscien.services.zotero.detect import detect_zotero_data_dir

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _to_out(row) -> SettingsOut:
    return SettingsOut(
        displayName=row.display_name or "",
        zoteroDataDir=row.zotero_data_dir or "",
        zoteroDataDirDetected=detect_zotero_data_dir() or "",
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _to_out(settings_repo.get_settings(db))


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    fields = {}
    if body.displayName is not None:
        fields["display_name"] = body.displayName.strip()
    if body.zoteroDataDir is not None:
        fields["zotero_data_dir"] = body.zoteroDataDir.strip()

    row = settings_repo.update_settings(db, fields)
    return _to_out(row)
