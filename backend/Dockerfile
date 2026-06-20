FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt update && apt install -y \
    python3 \
    python3-venv \
    python3-pip \
    git \
    curl \
    ca-certificates \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    ffmpeg \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY requirements.txt /tmp/requirements.txt

RUN python3 -m venv /opt/venv
RUN /opt/venv/bin/pip install --upgrade pip
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

ENV PATH="/opt/venv/bin:$PATH"

# Kokoro narration weights (Apache-2.0). Baked in so narration runs fully offline — no
# first-run download. Synthesis is CPU-only via onnxruntime (already a backend dep).
RUN mkdir -p /opt/kokoro \
    && curl -fsSL -o /opt/kokoro/kokoro-v1.0.onnx \
       https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
    && curl -fsSL -o /opt/kokoro/voices-v1.0.bin \
       https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

ENV KOKORO_MODEL_PATH=/opt/kokoro/kokoro-v1.0.onnx
ENV KOKORO_VOICES_PATH=/opt/kokoro/voices-v1.0.bin
ENV KOKORO_VOICE=af_heart