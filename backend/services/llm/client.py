"""Unified LLM access for InScien.

InScien is **local by default**: generation runs against the user's local Ollama via its
OpenAI-compatible Chat Completions endpoint - zero cost, offline, nothing leaves the machine.
A user may **opt in** to an OpenAI (or OpenAI-compatible) cloud model for higher quality: set
`llm_provider="openai"` in settings and provide the key via the `OPENAI_API_KEY` environment
variable. The key is never stored in the DB; if it isn't set, generation stays local.

Config (provider, model id, Ollama URL) comes from the DB settings row, read via a short-lived
independent session so this never disturbs a request's session. The single chokepoint
`chat_create()` resolves the provider centrally, so every call site is provider-agnostic.
"""

import logging
import os

import requests
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    NotFoundError,
    OpenAI,
    OpenAIError,
    PermissionDeniedError,
    RateLimitError,
)
from sqlalchemy.orm import Session

from core.db import engine
from repositories.settings_repository import get_settings

logger = logging.getLogger(__name__)

DEFAULT_LOCAL_MODEL = "qwen2.5:3b"
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
# OpenAI (or any OpenAI-compatible endpoint - set OPENAI_BASE_URL for Groq/OpenRouter/etc.).
# `or` (not a getenv default) so an empty-string env value still falls back to the real URL.
DEFAULT_OPENAI_URL = os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
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
            "provider": (row.llm_provider or "").strip().lower() or "local",
            "model": (row.llm_model or "").strip() or None,
            "ollama_base_url": (row.ollama_base_url or "").strip() or None,
            "openai_api_key": (row.openai_api_key or "").strip() or None,
        }
    except Exception:
        # Default to local on any read failure - a broken settings read must never silently
        # route generation to the cloud.
        logger.exception("failed to read settings; falling back to env defaults")
        return {"provider": "local", "model": None, "ollama_base_url": None, "openai_api_key": None}
    finally:
        session.close()


def list_ollama_models_status(base_url=None):
    """Probe the local Ollama for its model ids, distinguishing *unreachable* from *empty*.

    Returns {"reachable": bool, "models": [...]}. `reachable=False` means the request itself
    failed (Ollama down / wrong URL); `reachable=True` with an empty list means Ollama is up
    but has no models pulled. The UI needs that distinction to give the right guidance.
    """
    base = (base_url or "").strip() or DEFAULT_OLLAMA_URL
    try:
        resp = requests.get(f"{base.rstrip('/')}/models", timeout=1.5)
        data = resp.json()
        return {"reachable": True, "models": [m.get("id") for m in data.get("data", []) if m.get("id")]}
    except Exception:
        return {"reachable": False, "models": []}


def list_ollama_models(base_url=None):
    """Model ids served by the local Ollama (empty list if unreachable)."""
    return list_ollama_models_status(base_url)["models"]


def _local_config(s, *, misconfigured=False):
    return {
        "provider": "local",
        "base_url": s["ollama_base_url"] or DEFAULT_OLLAMA_URL,
        # Ollama ignores the key; the OpenAI-compatible SDK requires a non-empty one.
        "api_key": "ollama",
        "model": s["model"] or DEFAULT_LOCAL_MODEL,
        "provider_misconfigured": misconfigured,
    }


def resolve_llm_config():
    """The active LLM. Local Ollama by default; OpenAI (or an OpenAI-compatible endpoint) when
    the user has selected provider="openai" AND `OPENAI_API_KEY` is set in the environment.

    If "openai" is selected but no key is present, fall back to local and flag
    `provider_misconfigured` so the caller can surface a clear message instead of silently
    using the wrong engine.
    """
    s = _read_settings()
    if s["provider"] == "openai":
        # Stored key (desktop build, configured in-app) takes precedence; env is the fallback
        # for the Docker/dev path.
        api_key = s.get("openai_api_key") or (os.getenv("OPENAI_API_KEY") or "").strip()
        if api_key:
            return {
                "provider": "openai",
                "base_url": DEFAULT_OPENAI_URL,
                "api_key": api_key,
                "model": s["model"] or "",
                "provider_misconfigured": False,
            }
        return _local_config(s, misconfigured=True)
    return _local_config(s)


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
    is_openai = cfg["provider"] == "openai"
    engine_label = "OpenAI" if is_openai else "the local model"

    if cfg.get("provider_misconfigured"):
        return {
            "code": "provider_misconfigured",
            "retryable": False,
            "message": (
                "Cloud (OpenAI) is selected but no API key is set. Add your key in Settings, "
                "or switch back to a local model."
            ),
        }

    # OpenAI-specific failures. These are APIStatusError subclasses, so they MUST be checked
    # before the generic APIStatusError/OpenAIError fallthrough below.
    if isinstance(exc, AuthenticationError):
        return {
            "code": "openai_auth",
            "retryable": False,
            "message": "Your OpenAI API key was rejected (401). Check or replace it in Settings.",
        }
    if isinstance(exc, PermissionDeniedError):
        return {
            "code": "openai_forbidden",
            "retryable": False,
            "message": (
                f"Your OpenAI key can't access the model '{model}' (403). Choose a model your "
                "account can use in Settings."
            ),
        }
    if isinstance(exc, RateLimitError):
        out_of_quota = "quota" in (str(getattr(exc, "message", "")) or str(exc)).lower()
        if out_of_quota:
            return {
                "code": "openai_quota",
                "retryable": False,
                "message": "Your OpenAI account is out of quota/credits. Add billing, or switch to a local model.",
            }
        return {
            "code": "openai_rate_limit",
            "retryable": True,
            "message": "OpenAI rate limit hit (429). Wait a moment and try again.",
        }

    if isinstance(exc, APITimeoutError):
        return {
            "code": "timeout",
            "retryable": True,
            "message": (
                f"{engine_label} took too long to respond (>{int(LLM_TIMEOUT_S)}s). "
                "Try again, or pick a smaller/faster model in Settings."
            ),
        }
    if isinstance(exc, APIConnectionError):
        if is_openai:
            return {
                "code": "openai_unreachable",
                "retryable": True,
                "message": (
                    f"Couldn't reach OpenAI at {base_url}. Check your network (or OPENAI_BASE_URL), "
                    "then try again."
                ),
            }
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
        if is_openai:
            return {
                "code": "model_missing",
                "retryable": False,
                "message": (
                    f"The model '{model}' isn't available on OpenAI for your account. Enter a valid "
                    "model id in Settings."
                ),
            }
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
            "message": f"{engine_label} returned an error{suffix}. Please try again.",
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
    client, model, provider = get_client_and_model()
    kwargs = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
    if provider == "openai":
        # Newer OpenAI models (gpt-5 / o-series) reject the legacy `max_tokens` and require
        # `max_completion_tokens`; they also only accept the default temperature, so we omit
        # any explicit temperature the local path would have sent.
        kwargs["max_completion_tokens"] = max_tokens
    else:
        # Ollama speaks the legacy Chat Completions params.
        kwargs["max_tokens"] = max_tokens
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
