---
title: Settings & models
description: Configure your Zotero folder and the model used for narration.
---

Everything is configured in the app's **Settings** - no environment variables or config files.

## Zotero data folder

Set the folder containing `zotero.sqlite` and `storage/`. InScien reads it read-only through a
private snapshot, so your live library is never touched. After changing this folder, re-index
your collections.

## Model

Narration uses a model you choose. The **Map needs no model** - this only affects narration.

- **Local (Ollama)** - private and free. Install [Ollama](https://ollama.com), pull a model
  (for example `ollama pull llama3.1:8b`), and select it. InScien connects at
  `http://localhost:11434`. A larger model generally writes better narration.
- **OpenAI** - higher quality, paid. Paste your API key and enter a model id. The key is
  stored only on your machine and is never displayed again.

If you select OpenAI without a key, or pick a model your account can't use, InScien tells you
exactly what to fix.
