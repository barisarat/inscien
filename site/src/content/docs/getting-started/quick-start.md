---
title: Quick start
description: First run - point InScien at Zotero, select papers, then map and narrate.
---

Once InScien is [installed](/getting-started/installation/), here's the path from a
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

## 3. Select papers

In the sidebar, browse your Zotero collections and select the papers you want to map. The Map
fetches their citations from OpenAlex on demand. Optionally, hit **Fetch citations** to warm the
whole library's references in the background, so any selection then renders instantly.

## 4. Open the Map

Open the **Map** to see your selected papers as a citation graph - what they cite (**References**)
and what cites them (**Cited by**).

## 5. Narrate a paper

Pick a paper and choose **Narrate**. The first time, InScien downloads the narration voice
(about 1 GB, one time) with a progress bar, then produces an mp3 you can play and replay.
