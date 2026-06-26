# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — freezes the InScien backend into a single `inscien-backend` binary that
# Tauri ships as a sidecar. The binary serves the API + the bundled static UI on one local port.
#
#   build (run from backend/):  pyinstaller inscien.spec
#   output:                     dist/inscien-backend  (one file)
#
# Native / lazily-imported deps defeat PyInstaller's static analysis, so we `collect_all` the
# heavy packages and `collect_submodules` our own packages (which use lazy `from routers.x import`).
# Expect a short iterate loop on the first freeze per OS — `collect_all` covers most, but a missing
# hidden import or data file shows up as an ImportError / FileNotFound at runtime.

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

# Heavy third-party deps with native libs and/or bundled data files.
for _pkg in (
    "onnxruntime",       # ONNX runtime — powers fastembed embeddings + Kokoro TTS
    "fastembed",         # embedding model loader
    "kokoro_onnx",       # TTS
    "fitz",              # PyMuPDF import name
    "pymupdf",
    "tokenizers",
    "huggingface_hub",
    "py_rust_stemmers",
    "mmh3",
    "pydantic",
    "numpy",
    "PIL",               # pillow
    "pydub",
    # Kokoro's grapheme-to-phoneme (misaki) stack ships JSON/data dirs + a native espeak-ng lib
    # that PyInstaller misses — e.g. language_tags/data/json/index.json and
    # espeakng_loader/espeak-ng-data/. collect_all grabs those data files + the bundled .so/.dll.
    "misaki",            # Kokoro G2P
    "language_tags",     # BCP-47 tag data used by misaki
    "num2words",         # number-to-words used during phonemization
    "espeakng_loader",   # bundles libespeak-ng + espeak-ng-data (phoneme data) for the tokenizer
    "imageio_ffmpeg",    # self-contained ffmpeg binary (narration mp3 mux; no system ffmpeg needed)
):
    try:
        _d, _b, _h = collect_all(_pkg)
        datas += _d
        binaries += _b
        hiddenimports += _h
    except Exception:
        # A package can be absent on some platforms; a real miss surfaces at runtime.
        pass

# Our own code is imported lazily in many places — pull in every submodule explicitly.
for _pkg in ("routers", "services", "models", "repositories", "schemas", "core"):
    hiddenimports += collect_submodules(_pkg)

# `audioop` is a stdlib module on <=3.12 and the `audioop-lts` backport on 3.13+; pydub needs it.
hiddenimports += ["audioop"]

block_cipher = None

a = Analysis(
    ["run_server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Single-file binary (everything inlined into EXE, no COLLECT step).
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="inscien-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,  # background sidecar; Tauri hides the console window on Windows
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
