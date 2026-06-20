"""Agentic answer pipeline for InScien.

`stream_agent_answer` is a tool-calling loop over the OpenAI Responses API that
emits an SSE protocol (`stage` / `citations` / `delta` / `final` / `error`). For v1
the only tool is library retrieval (`search_internal_content`), whose results ground
a streamed, page-cited final answer. Multi-turn chat is preserved: each turn is
persisted to SQLite and prior turns (plus a compact `(context: …)` recap) are replayed
as history so follow-ups resolve naturally.

Like the lab streamer it opens its own DB session because a streaming response
outlives a request-scoped session. There is no auth — a single implicit local user
owns every session.
"""

import json
import logging

from core.db import SessionLocal
from services.lab.answer_service import (
    detect_insufficient,
    remove_invalid_citation_markers,
    unique_citations,
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

# A `/skill` from the client forces its tool on the first round.
_SKILL_TOOL = {
    "ask": "search_internal_content",
    "graph": "citation_graph",
    "refs": "search_references",
}


def _parse_arguments(raw):
    if isinstance(raw, dict):
        return raw

    try:
        return json.loads(raw or "{}")
    except (ValueError, TypeError):
        return {}


def _history_messages(history):
    """Map prior conversation turns into Responses API input messages, defensively
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
        key = (result.get("url", ""), result.get("sectionTitle", ""), result.get("metadata", {}).get("page"))

        if key in seen:
            continue

        seen.add(key)
        deduped.append(result)

    return deduped


def stream_agent_answer(
    query,
    history=None,
    session_id=None,
    limit=10,
    credentials=None,
    anonymous_id="",
    request_metadata=None,
    skill=None,
):
    db = SessionLocal()

    context_results = []
    graph_payload = None   # set if the citation_graph skill ran
    refs_payload = None    # set if the search_references skill ran
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

        # --- Skill routing ----------------------------------------------------
        # An explicit `/skill` is dispatched DETERMINISTICALLY here — local models
        # (Ollama) don't reliably honor a forced tool_choice, so we don't route /skill
        # through the model at all. Plain NL falls through to the model-driven loop.
        forced_tool = _SKILL_TOOL.get(skill)
        if forced_tool:
            args = {"query": query}
            yield {"type": "stage", "stage": "tool", "tool": forced_tool,
                   "label": stage_label(forced_tool, args)}
            handler = TOOL_DISPATCH.get(forced_tool)
            try:
                result = handler(args, ctx) if handler else {}
            except Exception:
                logger.exception("skill %s failed", forced_tool)
                result = {"error": "tool_failed"}
            executed[(forced_tool, json.dumps(args, sort_keys=True))] = result
            if forced_tool == "search_internal_content":
                context_results.extend(result.get("contextResults", []))
            elif forced_tool == "citation_graph" and isinstance(result, dict) and result.get("graph"):
                graph_payload = result["graph"]
                messages.append({"role": "user", "content": (
                    f"(citation_graph result) {len(graph_payload['nodes'])} papers, "
                    f"{len(graph_payload['edges'])} citation links among them.")})
            elif forced_tool == "search_references" and isinstance(result, dict) and "matches" in result:
                refs_payload = result["matches"]
                messages.append({"role": "user", "content": (
                    f"(search_references result) {len(refs_payload)} matching reference(s) "
                    f"for '{query}'.")})
            elif isinstance(result, dict) and result.get("message"):
                messages.append({"role": "user", "content": f"(tool note) {result['message']}"})

        # --- NL tool-calling loop (Chat Completions) --------------------------
        # Only for plain NL — the model infers which skill to call ("auto").
        for _round in range(MAX_TOOL_ROUNDS):
            if forced_tool:
                break  # explicit skill already dispatched above
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
                    elif name == "citation_graph" and isinstance(result, dict) and result.get("graph"):
                        graph_payload = result["graph"]
                    elif name == "search_references" and isinstance(result, dict) and "matches" in result:
                        refs_payload = result["matches"]

                # Keep the model's context compact: full passages for search; a short
                # recap for graph/refs (the structured payload streams to the UI instead).
                if name == "search_internal_content":
                    model_payload = result.get("contextBlocks", "")
                elif name == "citation_graph" and isinstance(result, dict) and result.get("graph"):
                    g = result["graph"]
                    model_payload = (
                        f"Citation map: {len(g['nodes'])} papers, "
                        f"{len(g['edges'])} citation links among them."
                    )
                elif name == "search_references" and isinstance(result, dict) and "matches" in result:
                    model_payload = {"matchCount": len(result["matches"]), "matches": result["matches"][:10]}
                else:
                    model_payload = result

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(model_payload),
                })

        # Mode = which skill produced output. graph/refs render a structured panel/list
        # and get a short summary; everything else is a grounded Q&A answer.
        mode = "graph" if graph_payload is not None else ("refs" if refs_payload is not None else "answer")

        if mode == "answer":
            # Safety net: if the model never retrieved (a small model that ignored the
            # forced tool, or a malformed call), force one search so the answer is grounded.
            if not context_results:
                fallback = search_internal_content(query)
                context_results.extend(fallback.get("contextResults", []))
            deduped = _dedupe_context(context_results)[:MAX_CITATIONS]
            citations = unique_citations(deduped, MAX_CITATIONS)
        else:
            deduped = []
            citations = []

        yield {"type": "stage", "stage": "drafting"}

        # Stream the structured payload for the skill that ran (the UI renders it).
        if mode == "graph":
            yield {"type": "graph", "nodes": graph_payload["nodes"], "edges": graph_payload["edges"]}
        elif mode == "refs":
            yield {"type": "refs", "matches": refs_payload}
        elif citations:
            yield {"type": "citations", "citations": citations}

        # --- Final answer -----------------------------------------------------
        # graph/refs get a DETERMINISTIC summary computed from the actual results, so
        # the headline can never contradict the rendered panel/list (a small model
        # would otherwise hallucinate counts). Only Q&A goes through the model.
        verification = {"grounded": True, "unsupported": []}

        if mode == "graph":
            nodes = graph_payload["nodes"]
            edges = graph_payload["edges"]
            connected = len({x for e in edges for x in (e["from"], e["to"])})
            answer = (
                f"Built the citation map of your library: {len(nodes)} paper(s), "
                f"{len(edges)} citation link(s) among them ({len(nodes) - connected} unconnected). "
                f"Open the Citation map tab to explore — click a node to open the paper."
            )
            yield {"type": "delta", "text": answer}
        elif mode == "refs":
            papers = {m.get("paperTitle") for m in refs_payload}
            if not refs_payload:
                answer = f"None of your papers cite a work matching “{query}”."
            else:
                answer = (
                    f"{len(refs_payload)} matching reference(s) across {len(papers)} of your "
                    f"paper(s) cite a work matching “{query}” — see the list below."
                )
            yield {"type": "delta", "text": answer}
        else:
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

            # Judge loop #2: answer-grounding verification (Q&A only).
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

        # Persist the structured payload so graph/refs rehydrate on reload (not just text).
        persist_widgets = None
        if mode == "graph":
            persist_widgets = [{"kind": "graph", "nodes": graph_payload["nodes"],
                                "edges": graph_payload["edges"]}]
        elif mode == "refs":
            persist_widgets = [{"kind": "refs", "matches": refs_payload}]

        if chat_session_id is not None:
            try:
                chats.append_message(
                    db, chat_session_id, "assistant", answer,
                    widgets=persist_widgets, citations=citations, context_summary=summary,
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
            "related": [],
            "retrievedCount": len(deduped),
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
