"""The language model, served by Ollama, for the LLM rerank and Ask.

Both exist only while Ollama answers; the rest of search works without it. Availability is
checked live (cached for a few seconds), so starting Ollama later turns them on. The model is
chosen per request from the models Ollama has; INSCIEN_LLM_MODEL is the default.

    INSCIEN_LLM_MODEL   default qwen2.5:7b-instruct
    INSCIEN_LLM_URL     default http://127.0.0.1:11434

Every request sets an 8k context window, which the prompts need.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request

DEFAULT_MODEL = os.getenv("INSCIEN_LLM_MODEL") or "qwen2.5:7b-instruct"
URL = (os.getenv("INSCIEN_LLM_URL") or "http://127.0.0.1:11434").rstrip("/")
CONTEXT = 8192
TIMEOUT = 180
CHECK_EVERY = 5

_checked = (0.0, None)


class LLMError(RuntimeError):
    pass


def models() -> list[str] | None:
    """The model names Ollama has, or None when Ollama does not answer."""
    global _checked
    at, value = _checked
    if time.monotonic() - at < CHECK_EVERY:
        return value
    try:
        with urllib.request.urlopen(f"{URL}/api/tags", timeout=2) as response:
            value = sorted(m.get("name") for m in json.loads(response.read()).get("models", []) if m.get("name"))
    except (urllib.error.URLError, OSError, ValueError):
        value = None
    _checked = (time.monotonic(), value)
    return value


def default_model() -> str | None:
    """INSCIEN_LLM_MODEL when Ollama has it, else the first model it has, else None."""
    names = models() or []
    for name in (DEFAULT_MODEL, f"{DEFAULT_MODEL}:latest"):
        if name in names:
            return name
    return names[0] if names else None


def chat(model: str, system: str, user: str, json_mode: bool = False) -> str:
    """The model's reply text. Raises LLMError when the call fails."""
    body = {"model": model, "stream": False, "options": {"temperature": 0, "num_ctx": CONTEXT},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if json_mode:
        body["format"] = "json"
    request = urllib.request.Request(f"{URL}/api/chat", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read())["message"]["content"] or ""
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except (ValueError, AttributeError):
            pass
        raise LLMError(f"{model}: HTTP {exc.code}: {str(detail)[:200]}") from exc
    except (urllib.error.URLError, OSError, ValueError, KeyError) as exc:
        raise LLMError(f"{model}: {exc}") from exc


def chat_json(model: str, system: str, user: str):
    """The reply parsed as JSON; the first {...} block when the model wraps it in text."""
    text = chat(model, system, user, json_mode=True)
    try:
        return json.loads(text)
    except ValueError:
        match = re.search(r"\{.*\}", text, re.S)
        try:
            return json.loads(match.group(0)) if match else {}
        except ValueError:
            return {}
