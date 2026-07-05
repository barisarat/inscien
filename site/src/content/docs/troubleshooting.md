---
title: Troubleshooting
description: Fixes for the most common issues installing and running InScien.
---

## Narration fails with a PyMuPDF / "DLL load failed" error (Windows)

Narration reads PDFs with PyMuPDF, a native library that needs the **Microsoft Visual C++
Redistributable**. Most Windows machines already have it; a clean install may not. If narration
reports a PyMuPDF or `DLL load failed` error, install it once and retry:

- Download and run [aka.ms/vc_redist](https://aka.ms/vs/17/release/vc_redist.x64.exe).

The **Map** does not need this - only narration.

## Install tries to compile something ("Rust not found", build errors)

InScien runs on **Python 3.12** (some dependencies don't publish wheels for newer Python yet). If
`uv` picks a newer Python, it may try to build packages from source. Pin the version so uv fetches
a managed 3.12 and installs prebuilt wheels - no compiler needed:

```bash
uvx --python 3.12 inscien
# or
uv tool install --python 3.12 inscien
```

## The browser didn't open

InScien prints a local URL on startup, for example `http://127.0.0.1:8000`. If your browser doesn't
open automatically, just open that URL yourself.

## Narration needs a model

The **Map needs no model**. **Narration** needs one you connect in Settings - a local
[Ollama](https://ollama.com) (free and private) or an OpenAI API key. See
[Settings & models](/guides/settings/).

## Updating, reinstalling, and your data

```bash
uv tool upgrade inscien      # update to the latest release
uv tool uninstall inscien    # remove it
```

Your data (settings, the citation cache, narration audio) lives in your OS app-data folder,
separate from the install - so upgrading or reinstalling never touches it.
