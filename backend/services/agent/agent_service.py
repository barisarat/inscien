"""Agentic answer pipeline for InScien.

`stream_agent_answer` is a tool-calling loop over the OpenAI-compatible chat-completions
API (the local Ollama, via `services.llm.client`) that emits an SSE protocol (`stage` /
`citations` / `delta` / `final` / `error`). The chat agent has a single tool — library
retrieval (`search_internal_content`) — and always produces a streamed, page-cited final
answer. (Structured skills — compare, write, narrate, the citation graph — live in their
own workspace tabs, not the chat.) Multi-turn chat is preserved: each turn is persisted to
SQLite and prior turns (plus a compact `(context: …)` recap) are replayed as history so
follow-ups resolve naturally.

Like the lab streamer it opens its own DB session because a streaming response
outlives a request-scoped session. There is no auth — a single implicit local user
owns every session.
"""

import json
import logging

from core.db import SessionLocal
from services.lab.answer_service import (
    detect_insufficient,
    make_citation,
    remove_invalid_citation_markers,
)
from services.lab.prompt_service import build_context_blocks
from services.llm.client import chat_create, delta_of, text_of
from services.agent.prompt import build_agent_system_prompt, build_grounding_block
from services.agent.tools import (
    TOOL_DISPATCH,
    TOOL_SCHEMAS,
    ToolContext,
    search_internal_content,
    stage_label,
)
from services.rag.grounding import verify_grounding
from repositories import chat_repository as chats


logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 4
MAX_OUTPUT_TOKENS = 1200
MAX_CITATIONS = 6
MAX_HISTORY_MESSAGES = 16
MAX_HISTORY_CHARS = 2000

# Single-user/local: every session is owned by one implicit user.
LOCAL_USER_ID = 1


def _parse_arguments(raw):
    if isinstance(raw, dict):
        return raw

    try:
        return json.loads(raw or "{}")
    except (ValueError, TypeError):
        return {}


def _history_messages(history):
    """Map prior conversation turns into chat-completions messages, defensively
    capped (count + per-message length) so the conversation never blows the budget."""
    if not history:
        return []

    messages = []
    for item in history[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role") if isinstance(item, dict) else None
        content = item.get("content") if isinstance(item, dict) else None

        if role not in ("user", "assistant") or not content:
            continue

        messages.append({"role": role, "content": str(content)[:MAX_HISTORY_CHARS]})

    return messages


def _session_history(messages):
    """Build the model history from persisted ChatMessage rows (the source of truth
    for chat continuation). Assistant turns fold in the (context: …) recap."""
    history = []
    for m in messages:
        if m.role not in ("user", "assistant") or not m.content:
            continue
        content = m.content
        if m.role == "assistant" and m.context_summary:
            content = f"{content}\n\n(context: {m.context_summary})"
        history.append({"role": m.role, "content": content})
    return _history_messages(history)


def _context_summary(executed):
    """Compact recap of the searches made this turn, carried into the next turn's
    history so follow-ups ('say more about that', 'and the second paper') resolve."""
    queries = []
    for (name, args_json), _result in executed.items():
        if name != "search_internal_content":
            continue
        try:
            args = json.loads(args_json)
        except (ValueError, TypeError):
            args = {}
        q = (args.get("query") or "").strip()
        if q:
            queries.append(f"'{q}'")
    if not queries:
        return ""
    return "searched the library for " + ", ".join(queries)


def _dedupe_context(results):
    seen = set()
    deduped = []

    for result in results:
        key = (result.get("url", ""), result.get("metadata", {}).get("page"))

        if key in seen:
            continue

        seen.add(key)
        deduped.append(result)

    return deduped


def stream_agent_answer(
    query,
    session_id=None,
    item_keys=None,
):
    db = SessionLocal()

    context_results = []
    executed = {}
    chat_session_id = None

    try:
        yield {"type": "stage", "stage": "thinking"}

        ctx = ToolContext(db=db)
        messages = [{"role": "system", "content": build_agent_system_prompt()}]

        # Session is the source of truth for chat continuation. Load or create it,
        # replay prior messages as history, then append this turn's user message.
        session = chats.get_session(db, LOCAL_USER_ID, session_id) if session_id else None
        if session is None:
            session = chats.create_session(db, LOCAL_USER_ID, query[:80])
        chat_session_id = session.id
        messages.extend(_session_history(chats.get_messages_light(db, session.id)))
        chats.append_message(db, session.id, "user", query)

        messages.append({"role": "user", "content": query})

        # Resolve the active Zotero selection scope. An explicit selection on this turn
        # is persisted to the session; an empty one falls back to the session's stored
        # selection so scope carries across turns (like the rest of the working set).
        if item_keys:
            item_keys = set(item_keys)
            try:
                merged = dict(session.working_set or {})
                merged["itemKeys"] = sorted(item_keys)
                chats.update_working_set(db, session.id, merged)
            except Exception:
                db.rollback()
        else:
            stored = (session.working_set or {}).get("itemKeys")
            item_keys = set(stored) if stored else None
        ctx.item_keys = item_keys

        # --- Tool-calling loop (Chat Completions) -----------------------------
        # The model infers when to call the library-retrieval tool ("auto").
        for _round in range(MAX_TOOL_ROUNDS):
            response = chat_create(
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                max_tokens=MAX_OUTPUT_TOKENS,
            )

            msg = response.choices[0].message
            tool_calls = msg.tool_calls or []

            if not tool_calls:
                break

            # Echo the assistant tool-call message, then one tool result per call.
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            })

            for tc in tool_calls:
                name = tc.function.name
                args = _parse_arguments(tc.function.arguments)

                yield {
                    "type": "stage",
                    "stage": "tool",
                    "tool": name,
                    "label": stage_label(name, args),
                }

                signature = (name, json.dumps(args, sort_keys=True))

                if signature in executed:
                    result = executed[signature]
                else:
                    handler = TOOL_DISPATCH.get(name)
                    if handler is None:
                        result = {"error": "unknown_tool",
                                  "message": f"No such tool: {name}."}
                    else:
                        try:
                            result = handler(args, ctx)
                        except Exception:
                            logger.exception("tool %s failed args=%s", name, args)
                            result = {
                                "error": "tool_failed",
                                "message": ("That step failed while running. Try a "
                                            "different query."),
                            }
                    executed[signature] = result

                    if name == "search_internal_content":
                        context_results.extend(result.get("contextResults", []))

                # Keep the model's context compact: pass the full passages for search.
                if name == "search_internal_content":
                    model_payload = result.get("contextBlocks", "")
                else:
                    model_payload = result

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(model_payload),
                })

        # Safety net: if the model never retrieved (a small model that ignored the
        # tool, or a malformed call), force one search so the answer is grounded.
        if not context_results:
            fallback = search_internal_content(query, item_keys=item_keys)
            context_results.extend(fallback.get("contextResults", []))
        deduped = _dedupe_context(context_results)[:MAX_CITATIONS]
        # Citations are 1:1 with the numbered context blocks the model cites against
        # (build_context_blocks(deduped)), so [n] markers, the validity cap, and the
        # UI citation list all share one page-precise numbering.
        citations = [make_citation(r) for r in deduped]

        yield {"type": "stage", "stage": "drafting"}

        if citations:
            yield {"type": "citations", "citations": citations}

        # --- Final answer -----------------------------------------------------
        verification = {"grounded": True, "unsupported": []}

        grounding = build_grounding_block(build_context_blocks(deduped)) if deduped else ""
        final_messages = messages + [{
            "role": "user",
            "content": (
                "Write the final answer now for the user's question, grounded ONLY in the "
                "sources below. Cite each claim with [n] and its page. Never invent facts "
                "or page numbers." + grounding
            ),
        }]

        accumulated = ""
        try:
            stream = chat_create(
                messages=final_messages, max_tokens=MAX_OUTPUT_TOKENS, stream=True,
            )
            for chunk in stream:
                delta = delta_of(chunk)
                if delta:
                    accumulated += delta
                    yield {"type": "delta", "text": delta}
        except Exception:
            logger.exception("agent final-stream failed; falling back to non-streaming")
            accumulated = ""

        if not accumulated:
            response = chat_create(messages=final_messages, max_tokens=MAX_OUTPUT_TOKENS)
            accumulated = text_of(response)

        answer = accumulated or "I could not generate an answer from the available sources."
        answer = remove_invalid_citation_markers(answer, len(citations))

        # Judge loop #2: answer-grounding verification.
        if deduped and accumulated:
            yield {"type": "stage", "stage": "verifying"}
            verdict = verify_grounding(answer, build_context_blocks(deduped))
            if verdict.get("revised_answer"):
                answer = remove_invalid_citation_markers(verdict["revised_answer"], len(citations))
            verification = {
                "grounded": verdict.get("grounded", True),
                "unsupported": verdict.get("unsupported", []),
            }

        insufficient = detect_insufficient(answer)

        summary = _context_summary(executed)

        if chat_session_id is not None:
            try:
                chats.append_message(
                    db, chat_session_id, "assistant", answer,
                    citations=citations, context_summary=summary,
                )
            except Exception:
                db.rollback()

        yield {
            "type": "final",
            "query": query,
            "answer": answer,
            "citations": citations,
            "contextSummary": summary,
            "sessionId": chat_session_id,
            "verification": verification,
            "insufficientContext": insufficient,
        }
    except Exception:
        logger.exception("agent stream failed query=%r session=%s", query, session_id)
        yield {
            "type": "error",
            "retryable": True,
            "message": "Something went wrong generating that answer. Please try again.",
        }
    finally:
        db.close()
