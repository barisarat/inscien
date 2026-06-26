---
title: Map
description: A citation graph of your Zotero library.
---

The **Map** turns your selected Zotero papers into a citation graph, built from public data on
[OpenAlex](https://openalex.org). It needs **no model** - just each paper's DOI.

Two lenses:

- **References** - what your selected papers cite.
- **Cited by** - the works that cite them.

## Using it

- **Select papers** (or whole collections) in the sidebar - the map draws the citation graph for
  just that set, and fills in as the data resolves.
- **Open a paper** from the map to read its original PDF in a side panel, without leaving the app.
- **Warm the whole library**: the **Fetch citations** action in the sidebar fetches references for
  every paper with a DOI in the background, so later selections render instantly.

## What can be mapped

A paper is on the map only if it has a **DOI** and OpenAlex has its **references**. Papers without
a DOI, or that OpenAlex has no reference list for (often arXiv preprints), are greyed in the
library - hover one to see why. The citation data is cached locally and reused.
