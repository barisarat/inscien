# Local TTS Setup (XTTS v2)

## Python Version
Python 3.11.x

## Virtual Environment
py -3.11 -m venv C:\venv\tts
C:\venv\tts\Scripts\activate
python -m pip install -U pip

## Install PyTorch (CUDA 12.1 build)
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121

## Install TTS Stack
pip install coqui-tts pydub soundfile transformers==4.56.2

## Install FFmpeg (required for MP3 export)
winget install --id Gyan.FFmpeg -e

## Model Used
tts_models/multilingual/multi-dataset/xtts_v2

## Selected Narrator
Viktor Menelaos


# Speaker Test Setup (Notebook Cell)

```python
from TTS.api import TTS
from pydub import AudioSegment
import os

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")

TEST_TEXT = """
Volatility is the central quantity in finance.
It governs how assets are priced, how portfolios are allocated, and how risk is managed.
""".strip()

OUTPUT_DIR = "speaker_test"
os.makedirs(OUTPUT_DIR, exist_ok=True)

for idx, speaker in enumerate(tts.speakers[20:50], start=20):
    safe_name = speaker.replace(" ", "_")
    wav_path = os.path.join(OUTPUT_DIR, f"{idx:03d}__{safe_name}.wav")
    mp3_path = os.path.join(OUTPUT_DIR, f"{idx:03d}__{safe_name}.mp3")

    tts.tts_to_file(
        text=TEST_TEXT,
        file_path=wav_path,
        language="en",
        speaker=speaker,
    )

    AudioSegment.from_wav(wav_path).export(
        mp3_path,
        format="mp3",
        bitrate="192k"
    )

print("Done.")
