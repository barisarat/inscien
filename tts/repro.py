"""Fast dependency gate: loads XTTS and synthesizes one sentence.

Run inside the container — this exercises the FULL import + model-load + synth path
(unlike `from TTS.api import TTS`, which is lazy and doesn't load the model):

    docker compose exec tts python repro.py
"""

import os

import torch
from TTS.api import TTS

print("torch", torch.__version__, "| cuda available:", torch.cuda.is_available())

device = "cuda" if torch.cuda.is_available() else "cpu"
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("model loaded on", device)

os.makedirs("/workspace/jobs", exist_ok=True)
tts.tts_to_file(
    text="This is a short test of the narration voice.",
    file_path="/workspace/jobs/_repro.wav",
    language="en",
    speaker=os.getenv("TTS_SPEAKER", "Viktor Menelaos"),
)
print("SYNTH OK -> /workspace/jobs/_repro.wav")
