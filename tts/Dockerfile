# GPU TTS worker for InScien narration. Torch + CUDA come from the base image; XTTS
# model weights are NOT baked in — they are fetched from source on first run into a
# mounted cache volume (license-clean; the image stays publishable).
#
# If a tag is unavailable or the resolver fights over torch, adjust the base tag /
# requirement pins on first build.
FROM pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Non-interactive acceptance of the XTTS (Coqui Public Model License, non-commercial).
# The compose file sets this from .env.dev so it's an explicit user opt-in.
ENV COQUI_TOS_AGREED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /workspace

EXPOSE 8300
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8300"]
