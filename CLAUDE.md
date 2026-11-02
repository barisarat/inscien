# CLAUDE.md

How to work on InScien. `README.md` is usage and `SEARCH.md` the Search and Ask overview. This file
is the map and the rules.

## What it is

One pure-Python package (`src/inscien`) plus a Next.js static UI (`frontend/`) that is built
into the package as `src/inscien/webui/`. Installed, it needs no Node and no network except the
reference lookups and the one-time weights download.

## Layout

```text
src/inscien/
  cli.py              `inscien` entry: serve (default), build, narrate, index, narration diagnostics
  app.py              FastAPI app: routers, the static UI, INSCIEN_READONLY
  core/paths.py       INSCIEN_HOME and every directory under it - the only place paths are made
  routers/            HTTP API: settings, zotero, library, papers, narrations, jobs, search
  services/zotero/    read-only Zotero access (detection, snapshot copy of zotero.sqlite)
  services/library/   library store, staging, narration queue, host_job (the one-job runner)
  refs/               `inscien build`: pdftext -> extract -> parse -> enrich -> paper.json.
                      citations.py finds in-text citation markers (the listen view's hover cards)
  narrate/            `inscien narrate`: planning -> slicing -> narration_text/structure ->
                      lexical/convert/prosody -> tts -> bundle (+ anchors, cues)
  search/             `inscien index` and Search / Ask (the `search` extra): index, models,
                      query, llm (Ollama), answer
frontend/src/app/     map/ (layout = the shared shell, page = the Map, search/ = the results
                      page), listen/, settings/. components/JobPane.tsx shows the job,
                      components/search/ the search bar and its settings
tests/                pytest
```

## Rules

- **Zotero is read-only.** Never write to the Zotero data directory. Read the snapshot copy.
- **All writes go under INSCIEN_HOME**, through `core/paths.py`. No other path is hardcoded.
- **One job at a time.** Builds and narrations run as `python -m inscien build|narrate` in a
  subprocess (`host_job.py`). A pipeline step prints `==> k/n label`, synthesis prints
  `[ done/total]`. The job pane reads exactly those two shapes, so keep them.
- **Narration keeps the author's sentences verbatim.** The rules may skip, join, fix extraction
  artifacts and speak symbols. They never paraphrase. An acronym is expanded only where the paper
  glosses it.
- **Borderline lines:** inside a table or figure region, drop. Elsewhere, keep. A stray row is
  audible, a lost sentence is not.
- **PDF text comes from `refs/pdftext.py` only** (PyMuPDF text trace, joined as a viewer's text
  layer joins it). Extraction and planning both depend on its item shape. The two exceptions are
  the search index, which reads PyMuPDF text blocks: a passage's mark needs the block geometry, and
  `refs/citations.py`, which reads `rawdict` characters: a marker's rect needs character geometry.
- **Search is optional.** Everything under `search/` imports its models and sqlite-vec lazily.
  Without the extra the routes answer 409 and the rest of the app is unchanged.
- **A language model never writes text shown as a source.** An Ask quote is the passage's own
  text for the span the model named, matched on letters and digits. A quote that does not match
  is dropped, and the short response keeps only citations to kept quotes.
- **UI: stock shadcn components only** (`components/ui/`, style base-nova). Compose them, never
  restyle or fork one.
- **No personal data in the repo**: no PDFs, library JSON, bundles or paths. Tests use
  synthetic input.
- npm dependencies: never hand-write versions in `package.json`. Install unpinned and let npm
  resolve the set, then keep what it chose. Hand-pinned peers broke the build with ERESOLVE.
- A fresh install must work as is: never require the user to `chown`, `sudo` or change
  permissions.

## Checks

```sh
make test
.venv/bin/python -m inscien build <pdf>     # with INSCIEN_HOME pointed at a scratch dir
.venv/bin/python -m inscien index           # needs `uv pip install -e ".[search]"`
.venv/bin/python -m inscien narrate <pdf>
```

A change to `pdftext.py`, `extract.py` or `planning.py` is checked on several real papers
before and after: the reference count and titles from `build`, and `narrate/work/<slug>/
plan-review.txt` from `narrate`.

Release: bump `__version__` in `src/inscien/__init__.py`, then push a `v*` tag. `release.yml` builds and
publishes to PyPI by trusted publishing and refuses a tag that does not match the version.
