---
title: Installation
description: Download and install InScien on Windows, macOS, or Linux.
---

InScien is a desktop app. Download the installer for your operating system from the
[latest release](https://github.com/aratbaris/inscien/releases/latest), then follow the
one-time steps for your platform below.

## Prerequisite: a model for narration

The **Map needs no model**. **Narration** needs a model you connect - either a
local [Ollama](https://ollama.com) (private and free) or an OpenAI API key (higher quality,
paid). To use a local model, install Ollama and pull one before narrating:

```bash
ollama pull llama3.1:8b
```

InScien talks to Ollama at `http://localhost:11434`. You can also paste an OpenAI key in
Settings instead - see **Settings & models** in the sidebar.

## Windows

1. Download `InScien_x.y.z_x64-setup.exe` and run it.
2. The build is unsigned, so Windows SmartScreen may warn. Click **More info -> Run anyway**.
3. It installs to Program Files and adds a Start-Menu shortcut.

## macOS

1. Download `InScien_x.y.z_aarch64.dmg`, open it, and drag InScien into Applications.
2. The build is unsigned, so Gatekeeper blocks the first launch. **Right-click the app ->
   Open**, then confirm. (Alternatively:
   `xattr -dr com.apple.quarantine /Applications/InScien.app`.)

## Linux

- **AppImage:** `chmod +x InScien_*.AppImage && ./InScien_*.AppImage`
- **Debian / Ubuntu:** `sudo dpkg -i InScien_*.deb`

On minimal setups (bare window managers), audio playback for narration needs the GStreamer
plugins your desktop normally already provides:

```bash
# Arch example
sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-libav
```

Next: the [Quick start](/inscien/getting-started/quick-start/).
