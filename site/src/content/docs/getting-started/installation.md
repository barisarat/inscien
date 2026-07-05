---
title: Installation
description: Install and run InScien on Windows, macOS, or Linux with a single command.
---

InScien runs as a local web app in your own browser. You install it with
[`uv`](https://docs.astral.sh/uv/) - one command, the same on every OS. `uv` fetches its own
Python, and the app bundles everything else (the Kokoro voice engine and ffmpeg), so there are no
system packages to install.

## 1. Install uv

macOS / Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://astral.sh/uv/install.ps1 | iex
```

On Arch Linux you can also use `sudo pacman -S uv`.

## 2. Run InScien

```bash
uvx inscien
```

That runs it in an isolated, ephemeral environment. To install it so the `inscien` command stays
on your PATH:

```bash
uv tool install inscien
inscien
```

Either way, InScien starts a local server and opens your browser at it. Later, update with
`uv tool upgrade inscien`.

## Prerequisite: a model for narration

The **Map needs no model**. **Narration** needs a model you connect - either a local
[Ollama](https://ollama.com) (private and free) or an OpenAI API key (higher quality, paid). For a
local model, install Ollama and pull one before narrating:

```bash
ollama pull llama3.1:8b
```

InScien talks to Ollama at `http://localhost:11434`. You can also paste an OpenAI key in Settings
instead - see **Settings & models** in the sidebar.

Next: the [Quick start](/getting-started/quick-start/).
