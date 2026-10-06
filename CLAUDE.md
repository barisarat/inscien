# CLAUDE.md

How to work on InScien. `README.md` is usage; this file is the map and the rules.

## What it is

One pure-Python package (`src/inscien`) plus a Next.js static UI (`frontend/`) that is built
into the package as `src/inscien/webui/`. Installed, it needs no Node and no network except the
reference lookups and the one-time weights download.

## Layout

```text
src/inscien/
  cli.py              `inscien` entry: serve (default), build, narrate, narration diagnostics
  app.py              FastAPI app: routers, the static UI, INSCIEN_READONLY
  core/paths.py       INSCIEN_HOME and every directory under it - the only place paths are made
  routers/            HTTP API: settings, zotero, library, papers, narrations, jobs
  services/zotero/    read-only Zotero access (detection, snapshot copy of zotero.sqlite)
  services/library/   library store, staging, narration queue, host_job (the one-job runner)
  refs/               `inscien build`: pdftext -> extract -> parse -> enrich -> paper.json
  narrate/            `inscien narrate`: planning -> slicing -> narration_text/structure ->
                      lexical/convert/prosody -> tts -> bundle (+ anchors, cues)
frontend/src/app/     map/, listen/, settings/; components/JobPane.tsx shows the job
tests/                pytest
```

## Rules

- **Zotero is read-only.** Never write to the Zotero data directory; read the snapshot copy.
- **All writes go under INSCIEN_HOME**, through `core/paths.py`. No other path is hardcoded.
- **One job at a time.** Builds and narrations run as `python -m inscien build|narrate` in a
  subprocess (`host_job.py`). A pipeline step prints `==> k/n label`; synthesis prints
  `[ done/total]`. The job pane reads exactly those two shapes, so keep them.
- **Narration keeps the author's sentences verbatim.** The rules may skip, join, fix extraction
  artifacts and speak symbols; they never paraphrase. An acronym is expanded only where the paper
  glosses it.
- **Borderline lines:** inside a table or figure region, drop; elsewhere, keep. A stray row is
  audible, a lost sentence is not.
- **PDF text comes from `refs/pdftext.py` only** (PyMuPDF text trace, joined as a viewer's text
  layer joins it). Extraction and planning both depend on its item shape.
- **No personal data in the repo**: no PDFs, library JSON, bundles or paths. Tests use
  synthetic input.
- Plain ASCII in comments and Markdown.

## Checks

```sh
make test
.venv/bin/python -m inscien build <pdf>     # with INSCIEN_HOME pointed at a scratch dir
.venv/bin/python -m inscien narrate <pdf>
```

A change to `pdftext.py`, `extract.py` or `planning.py` is checked on several real papers
before and after: the reference count and titles from `build`, and `narrate/work/<slug>/
plan-review.txt` from `narrate`.
