"""Unified LLM access for InScien.

InScien is **local-only by design**: generation always runs against the user's local
Ollama via its OpenAI-compatible Chat Completions endpoint. There is NO cloud/provider
path — privacy, zero cost, and offline operation are architectural guarantees, not
settings. The `openai` package here is purely the OpenAI-compatible HTTP client pointed
at the local Ollama URL; it never talks to api.openai.com (there is no code that can).

Config (model id, Ollama URL) comes from the DB settings row, read via a short-lived
independent session so this never disturbs a request's session.
"""

import logging
import os

import requests
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    NotFoundError,
    OpenAI,
    OpenAIError,
)
from sqlalchemy.orm import Session

from core.db import engine
from repositories.settings_repository import get_settings

logger = logging.getLogger(__name__)

DEFAULT_LOCAL_MODEL = "qwen2.5:3b"
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
# Generous total request timeout so legitimately slow local generations still finish; a
# down/refused Ollama raises APIConnectionError instantly regardless of this value. Its main
# job is to stop a hung Ollama (connection accepted, no response) from blocking forever.
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "180"))


def _read_settings():
    """Read the settings row on an independent session (never the request's)."""
    session = Session(engine)
    try:
        row = get_settings(session)
        return {
            "model": (row.llm_model or "").strip() or None,
            "ollama_base_url": (row.ollama_base_url or "").strip() or None,
        }
    except Exception:
        logger.exception("failed to read settings; falling back to env defaults")
        return {"model": None, "ollama_base_url": None}
    finally:
        session.close()


def list_ollama_models(base_url=None):
    """Model ids served by the local Ollama (empty list if unreachable)."""
    base = (base_url or "").strip() or DEFAULT_OLLAMA_URL
    try:
        resp = requests.get(f"{base.rstrip('/')}/models", timeout=1.5)
        data = resp.json()
        return [m.get("id") for m in data.get("data", []) if m.get("id")]
    except Exception:
        return []


def resolve_llm_config():
    """The active LLM — always the local Ollama. No cloud path exists by construction."""
    s = _read_settings()
    return {
        "provider": "local",
        "base_url": s["ollama_base_url"] or DEFAULT_OLLAMA_URL,
        # Ollama ignores the key; the OpenAI-compatible SDK requires a non-empty one.
        "api_key": "ollama",
        "model": s["model"] or DEFAULT_LOCAL_MODEL,
    }


def get_client_and_model():
    cfg = resolve_llm_config()
    client = OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"], timeout=LLM_TIMEOUT_S)
    return client, cfg["model"], cfg["provider"]


def describe_llm_error(exc):
    """Turn an LLM/generation exception into an actionable, user-facing signal.

    Returns {"code", "message", "retryable"}. The code lets the UI add affordances (e.g. a
    link to Settings); the message names the concrete fix. Anything that isn't a recognised
    LLM/network failure falls back to the previous generic message so unexpected bugs aren't
    mislabelled as "Ollama is down".
    """
    cfg = resolve_llm_config()
    base_url, model = cfg["base_url"], cfg["model"]

    if isinstance(exc, APITimeoutError):
        return {
            "code": "timeout",
            "retryable": True,
            "message": (
                f"The local model took too long to respond (>{int(LLM_TIMEOUT_S)}s). "
                "Try again, or pick a smaller/faster model in Settings."
            ),
        }
    if isinstance(exc, APIConnectionError):
        return {
            "code": "ollama_unreachable",
            "retryable": True,
            "message": (
                f"Couldn't reach your local Ollama at {base_url}. Make sure Ollama is "
                "running on the host (see the README), then try again."
            ),
        }
    if isinstance(exc, NotFoundError) or (
        isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) == 404
    ):
        return {
            "code": "model_missing",
            "retryable": False,
            "message": (
                f"The model '{model}' isn't available in Ollama. Pull it with "
                f"`ollama pull {model}`, or choose another model in Settings."
            ),
        }
    if isinstance(exc, (APIStatusError, OpenAIError)):
        status = getattr(exc, "status_code", None)
        suffix = f" (status {status})" if status else ""
        return {
            "code": "llm_error",
            "retryable": True,
            "message": f"The local model returned an error{suffix}. Please try again.",
        }
    return {
        "code": "internal",
        "retryable": True,
        "message": "Something went wrong generating that answer. Please try again.",
    }


def chat_create(messages, tools=None, tool_choice=None, stream=False, max_tokens=1000, temperature=None):
    """Single entry point for a Chat Completions call (tool-calling or plain).

    tool_choice may be "auto", "none", or a forced {"type":"function", ...} object;
    defaults to "auto" when tools are supplied. temperature is omitted unless explicitly
    given, so the local model uses its own default.
    """
    client, model, _provider = get_client_and_model()
    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,  # Ollama speaks the legacy Chat Completions param.
        "stream": stream,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice or "auto"
    return client.chat.completions.create(**kwargs)


def text_of(response):
    """Plain text of a non-streamed completion."""
    try:
        return (response.choices[0].message.content or "").strip()
    except (AttributeError, IndexError):
        return ""


def delta_of(chunk):
    """Text delta of a streamed completion chunk (empty when none)."""
    try:
        return chunk.choices[0].delta.content or ""
    except (AttributeError, IndexError):
        return ""
