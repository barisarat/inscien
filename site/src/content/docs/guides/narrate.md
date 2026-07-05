---
title: Narrate
description: Turn a paper into a spoken-audio narration.
---

**Narrate** turns a paper into a spoken-audio narration. A model you connect writes an
explanatory script, a local CPU voice reads it aloud, and the result is saved as an mp3 you
can replay any time.

## The one-time voice download

InScien doesn't ship the ~1 GB voice model up front, to keep the install small. The first
time you narrate, InScien shows a **Download narration voice** button with a progress bar.
After that, narration runs without re-downloading - the voice stays on your machine.

## Requirements

- A connected model - a local Ollama or an OpenAI key (see **Settings & models**). This writes
  the narration script.
- On minimal Linux setups, audio playback also needs GStreamer plugins (see
  [Installation](/getting-started/installation/)). On Windows and macOS this is
  built in.

Generated narrations are saved per paper, so you can replay one without regenerating it.
