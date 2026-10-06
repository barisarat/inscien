"""Serve the original PDF for a citation, so the UI can open it at the cited page.

Single GET endpoint streaming the source PDF inline (the browser's native viewer
honors a `#page=N` fragment). The doc id is a Zotero itemKey, resolved to the file in
the Zotero storage tree.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from inscien.core.paths import import_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.get("/{doc_id}")
def get_paper(doc_id: str):
    # doc_id is a Zotero itemKey, or a library slug: the Map opens an owned node by its slug, and
    # the artifact records the itemKey it was built from. A slug with no key (an old build) falls
    # back to the staged copy in the import dir, which is the file the build actually read.
    from inscien.services.library.store import load_paper
    from inscien.services.zotero.reader import resolve_pdf_path

    paper = load_paper(doc_id) if doc_id else None
    try:
        zotero_path = resolve_pdf_path(doc_id)
        if not zotero_path and paper and paper.get("zoteroKey"):
            zotero_path = resolve_pdf_path(paper["zoteroKey"])
        if not zotero_path and paper and paper.get("source"):
            staged = Path(import_dir(), paper["source"])
            zotero_path = str(staged) if staged.is_file() else None
    except Exception as exc:
        # A reader/config error (Zotero library unreadable/unmounted) is NOT "paper not
        # found" - report it as such instead of masquerading as a 404.
        logger.warning("resolve_pdf_path failed for %s", doc_id, exc_info=True)
        raise HTTPException(status_code=503, detail="Could not read the Zotero library.") from exc

    if not zotero_path or not Path(zotero_path).exists():
        raise HTTPException(status_code=404, detail="Paper not found")

    path = Path(zotero_path)
    # Let FileResponse build the Content-Disposition: it RFC 5987-encodes non-ASCII
    # filenames (e.g. a Unicode hyphen U+2010 common in paper titles). Building the header
    # by hand fails - HTTP headers are latin-1, so such characters raise UnicodeEncodeError.
    return FileResponse(
        str(path),
        media_type="application/pdf",
        filename=path.name,
        content_disposition_type="inline",
    )
