---
title: Quick start
description: First run - point InScien at Zotero, index a collection, then map and narrate.
---

Once InScien is [installed](/inscien/getting-started/installation/), here's the path from a
blank window to a mapped, narratable library.

## 1. Point InScien at your Zotero library

Open **Settings** and set your **Zotero data folder** - the folder containing `zotero.sqlite`
and `storage/`:

- macOS / Linux: usually `~/Zotero`
- Windows: usually `C:\Users\you\Zotero`

InScien reads it read-only through a private snapshot and never modifies your library.

## 2. Connect a model (for narration only)

Still in Settings, choose **Local (Ollama)** and pick a model, or choose **OpenAI** and paste
your API key. The Map doesn't need this - only narration does.

## 3. Index a collection

In the sidebar, browse your Zotero collections and index the items you want searchable.
Indexing is additive and idempotent - you can add more items any time. The first index
downloads a small embedding model automatically.

## 4. Open the Map

Select papers in the sidebar and open the **Map** to see them placed by similarity and linked
by shared citations.

## 5. Narrate a paper

Pick a paper and choose **Narrate**. The first time, InScien downloads the narration voice
(about 1 GB, one time) with a progress bar, then produces an mp3 you can play and replay.
