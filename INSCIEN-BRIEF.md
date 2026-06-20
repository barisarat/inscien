# InScien — Project Brief & Body of Knowledge

> **What this is:** a self-contained briefing distilled from a planning discussion, to hand to a fresh agent in the InScien repo. It captures *what* InScien is, *why* it's scoped this way, the *architecture*, and the *build plan*. Read it as authoritative context, not gospel — but the reasoning behind each decision is included so you can adapt intelligently.

---

## 1. One-liner & identity

**InScien** is a **private, local-first research assistant that works *with* your own library** — it answers questions from your documents with verifiable, page-precise citations, and turns papers into faithful audio. It is **specialized, not a generic chatbot**: it works in sync with your local files, it does not try to answer everything or write code.

- **Tagline feel:** *"NotebookLM/Elicit-grade research help — but local, private, and yours. Works on your unpublished papers, on your laptop, offline."*
- **Category:** a local research workbench / personal research copilot for academics & technical researchers.
- **Delivery:** open-source, self-hostable. Ships in containers. Runs on local models by default (BYOK cloud optional).
- **Name/domain:** project name **InScien** (reclaims the original lineage name — see §2); domain **inscien.com** (owned); claim `inscien` on PyPI + npm + the GitHub handle.

---

## 2. Origin & lineage

InScien is **forked from two existing projects** and reuses their hardest parts:

- **FinanceLab** — a FastAPI + Next.js agentic platform. Its **agent harness** (a hand-rolled tool-calling loop over the OpenAI Responses API, with SSE streaming and a widget/artifact system — *no* agent framework) is reused as InScien's orchestration layer + UI.
- **MLNotebooks** — the original RAG project FinanceLab was forked from. Its **hybrid retrieval engine** (Qdrant dense + in-process BM25, weighted fusion, citations) is reused as InScien's retrieval/citation backbone.

The name **InScien** was literally the *original* name of this lineage (FinanceLab was *formerly InScien / MLNotebooks*). Reviving it for a research/science tool fits better than it ever fit finance — the name comes home.

**Key principle:** reuse the **harnesses** (orchestration + retrieval), not the **domains** (finance tools / ML content). Those become demo/example data, not the product.

---

## 3. Why this product exists (the lens behind every decision)

This came out of applying one rule consistently:

> **Assume the commodity layer — chat UI, agent loops, backtest/orchestration, code-gen — is free, because the user's own frontier model can reproduce it in an afternoon. The product must be the thing that *can't* be reproduced.**

**The "frontier-model test":** for any feature ask *"could the user get this from Claude + their own tools, quickly?"* If yes, it's not your value. For InScien, what survives the test is **local/private operation + verifiable grounding over the user's own corpus** — specifically for **unpublished / proprietary / embargoed** material that legally or competitively *cannot* be uploaded to cloud tools. That's the moat: not the chat, not the summarization — the **trustworthy, private, grounded** layer.

Why **local-first** is right (not just a privacy stance): these are **RAG-grounded** tasks — the model reads retrieved passages, it doesn't need deep parametric knowledge. RAG **lowers the model-capability bar**, so local (and cheap/nano) models are *technically adequate* here, not a compromise.

---

## 4. Competitive landscape & the validated wedge

The "local RAG chat over your docs" space is **crowded** (Open WebUI+Ollama, AnythingLLM, GPT4All, Jan, Khoj, PrivateGPT/LocalGPT). A generic version = "redone X," not worth building.

A web scan (mid-2026) of academic-specific tools validated the wedge:

- The academic strengths — **structured cross-paper extraction, citation-graph reasoning, faithful scientific-PDF parsing, verifiable page-precise citations, true synthesis** — live almost entirely in **cloud/paid** tools (Elicit, SciSpace, scite, Undermind).
- The closest **local/OSS** competitor is **PaperQA2** (FutureHouse, Apache-2.0, ~8.7k★): a strong local, quote-grounded synthesis **engine** — but **no first-party GUI**, **no structured-extraction tables**, **no citation-graph over your corpus**, and its good parsing is **GPU-gated (24GB)**.

**White space (ranked):** (1) structured cross-paper extraction tables locally; (2) verifiable page-precise citations in a *local UI*; (3) citation-graph over your own corpus offline; (4) good scientific-PDF parsing on **commodity hardware** (open parsers exist — Marker/Docling/MinerU/olmOCR — but unpackaged into a UI); (5) true cross-paper synthesis locally.

**Strategic reframe:** *don't reinvent the synthesis engine* (PaperQA2 already does it well — consider wrapping/borrowing it, or building your own only where needed). Put effort on the **missing layers**: the UI, verifiable citations, and (later) extraction/graph. **InScien's reused frontend + agent harness fills PaperQA2's #1 gap — it has no GUI.** Complementary fit.

**Defensible-vs-incumbents angle:** fully **local/private on commodity hardware** for unpublished work (PaperQA-Nemotron's good parsing needs a 24GB GPU; the cloud tools can't touch private corpora). **Risk:** well-funded incumbents (FutureHouse, PapersGPT) are moving toward this gap → pick a narrow wedge and move.

---

## 5. The product: TWO core skills (built by default)

These two are the agent's built-in capabilities. Everything else is deferred (see §9).

### 5.1 RAG-search-with-verifiable-citations — *agentic LOOP* (FOUNDATION, build first)

Not single-shot retrieve→answer. Keep MLNotebooks' **hybrid (dense+BM25) retrieval as the substrate**, and add an **agentic judge/verify loop on top** (corrective/self-RAG style):

1. **Retrieval-sufficiency check** — grade whether retrieved context is relevant/sufficient; if thin, reformulate and re-retrieve.
2. **Answer-grounding verification** — check *each claim against its cited passage*; drop/flag anything unsupported.

> **KEY:** this agentic eval loop **IS** the verifiable-citation mechanism — the make-or-break differentiator. The "agentic judging" and the "trustworthy citations" are the *same thing*. PaperQA2's quote-grounded approach is the bar to match.

**Cautions:** agentic = more LLM calls = slower on local models → **bound the loops** (2–3 judge steps, not 20); keep *only* the two value-earning loops; don't over-agent. Nano/cheap models are a great fit for the *judge* steps (simple grading tasks).

**Output:** an answer where every claim binds to a page-precise, passage-highlighted, verifiable citation.

### 5.2 Paper-simplify + local TTS — *agentic PIPELINE* (independent; build in parallel)

A sequential chain (not a loop), the novel/fun demo win — private audio of *your* papers:

`parse + structure-strip (drop heavy mechanics/tables/equations)` → `extract core points (faithful)` → `reconstruct summary` → **`rewrite for speech`** → `local TTS model` → `audio out`

- **The "rewrite for speech" stage is the differentiator** — raw TTS on a paper's text is unlistenable (equations, inline cites, dense prose). Adapting *for the ear* is the value.
- **Needs a faithfulness check** — the summary must not distort/hallucinate beyond the source. Shares the grounding discipline with §5.1.
- **Local TTS models** exist and ship in the container: Piper (fast/light), Kokoro (high-quality/small), Coqui XTTS.

### 5.3 Shared core

Both skills reduce to **parse the source → ground/verify against it**; they differ only in *output* (cited answer vs. audio) and *harness mode* (**loop** vs **pipeline**). Build the shared base once: **sci-PDF parsing + the grounding/verification mechanism + local-model wiring**, then the two skills are different heads on it.

> **The single highest-leverage first spec:** the **shared grounding/verification mechanism** — how a claim binds to a passage + page, how "is this supported?" is judged, how the verifiable highlight surfaces. It's RAG-cite's judge loop *and* TTS's faithfulness check. Spec this before anything else.

---

## 6. Architecture (two levels of "agentic")

```
  Chat (router agent)                 ← reused FinanceLab loop + Next frontend (as a LOCAL web UI)
    │  interprets request, picks skill (keep THIN — only 2 skills)
    ├── RAG-cite   (tool)             ← internally an agentic LOOP  (§5.1)
    └── Paper→TTS  (tool)             ← internally an agentic PIPELINE (§5.2)
          │
   shared substrate                   ← parse · retrieve(dense+BM25) · ground/verify · model
          │
   model tier (configurable): local (Ollama) ↔ nano/cheap API ↔ frontier API
```

- **Level 1 — the chat as router/orchestrator:** the reused FinanceLab loop. Skills are *tools* in its registry (same `TOOL_SCHEMAS` / `TOOL_DISPATCH` pattern, pointed at research skills). With only 2 skills, keep routing **thin** (lightweight intent classification, not a complex planner). It scales as skills grow.
- **Level 2 — agentic logic inside each skill:** RAG-cite's judge loop; TTS's pipeline.
- **Skills/plugin architecture** is how you get the broad vision without the broad build: ship platform + the 2 flagship skills; long-tail skills are incremental / community-contributable.
- **Interface:** reuse the existing **Next.js frontend as a local web UI** (richer rendering for cited passages/audio than a CLI; already built). A CLI stays a future option over the **same SSE backend** (interface is swappable behind the protocol).

---

## 7. Model strategy — local-first, BYOK-optional

- **Default = local models** (Ollama/LM Studio), shipped/configured with the container. Privacy + offline + free.
- **BYOK option** for users who want more: a **cloud API key** for **nano/cheap** models (fast, low-cost — great for the agentic *judge* steps) or **frontier** models (best quality, e.g., serious synthesis).
- **Spectrum the user controls:** `local (private/free/offline) ↔ nano (fast/cheap/not-private) ↔ frontier (best/pricier)`.
- **Implementation (cheap):** make **`base_url` + `api_key` + `model`** user-configurable. The OpenAI SDK honoring a custom `base_url` covers OpenAI, any OpenAI-compatible provider, **and** local Ollama/LM Studio (which expose OpenAI-compatible endpoints) — one code path. This is the one place a multi-provider abstraction genuinely earns its place. (FinanceLab already reads `OPENAI_API_KEY` + a model from env — this is half-done.)
- **DO NOT** build "use your ChatGPT/Claude subscription" auth (session-token hacks or OAuth flows that reuse/impersonate official first-party clients like Claude Code). It's ToS-violating, fragile, risks getting the *user's* account banned, and undermines a credible OSS project. The legit "no API cost" path is **local models**; the sanctioned subscription path only exists in vendors' own first-party tools.

---

## 8. Privacy positioning (state it precisely)

- **Private for the user's content + processing:** local files + local models = nothing leaves the machine; works fully **offline**.
- **Connected for public discovery:** reaching out to *public* sources (e.g., arXiv) is fine — that's public data *in*, not the user's private docs *out*.
- Licensing note: unlike the FinanceLab data product, InScien has **no content-redistribution issue** — it processes the *user's own* files locally and produces output *for that user*. (Don't conflate the two products' licensing.)

---

## 9. Scope discipline — what's in, what's deferred

**Broad vision, narrow build.** The full envisioned suite is a *skills platform*; ship only the core now.

- **CORE (build by default):** RAG-cite (§5.1), Paper→TTS (§5.2).
- **FLAGSHIP-LATER (white space, build on the core):** literature-review draft with verifiable cites (= multi-doc RAG-cite + synthesis; the most *model-demanding* one → lean on BYOK-frontier for it), structured cross-paper extraction tables, citation-graph over the corpus.
- **DEFER → optional/community skills (commoditized + maintenance traps; keep OUT of the critical path):** arXiv daily digest (crowded — arxiv-sanity etc.), grammar/publication-readiness (Grammarly/Paperpal/LLMs own it), conference/journal tracker (brittle data-integration), agentic research-agenda/notes-as-md (PKM is crowded).

**Rule:** prove the flagship skill (RAG-cite) excellent BEFORE adding skills. **Breadth is what kills solo projects.**

---

## 10. Reuse map (what comes from where)

| Need | Source |
|---|---|
| Skill orchestration + router + lit-review synthesis loop | **FinanceLab agent harness** (tool loop + SSE) |
| Local web UI / workbench | **FinanceLab Next.js frontend** |
| Retrieval + citation backbone (dense+BM25 hybrid) | **MLNotebooks RAG engine** (Qdrant + BM25) |
| Local embeddings | bge-small via fastembed (already used in MLNotebooks/Lab) |
| **NET-NEW build** | verifiable-citation/grounding mechanism · scientific-PDF parsing (Marker/Docling/MinerU) · local-model + BYOK wiring · the summarize→speech-rewrite→TTS pipeline |

Consider **wrapping or borrowing from PaperQA2** for the paper-QA engine rather than rebuilding synthesis from scratch — put new effort on the white-space layers.

---

## 11. Build approach & sequence

1. **First spec:** the shared **grounding/verification mechanism** (§5.3). Everything hinges on it.
2. **Build order:** RAG-cite (foundation) → TTS (parallel, independent).
3. **Keep each v1 NARROW:**
   - RAG-cite v1: ask → answer + page-precise citation + highlighted source passage. Not a 20-tool agent.
   - TTS v1: paper → faithful simplified brief (md) → local audio file. Not multi-voice podcast production.
4. **Dogfood:** the builder is the target user. Quality bar = *"would I trust this for my own research?"* Verifiability (citations) is both the product value and the validation loop.
5. **Demo hooks:** RAG-cite's verifiable-highlight is the credibility demo; local audio-of-your-papers is the fun/marketing hook.

---

## 12. Tech / stack notes

- **Backend pattern:** FastAPI + the reused agent loop over the **OpenAI Responses API** (no agent framework — it's a hand-rolled tool-calling loop; this was a deliberate, validated choice). SSE event protocol (`stage`/`widget`/`delta`/`final`/`error`).
- **Retrieval:** hybrid dense (Qdrant or an *embedded* store — see note) + in-process BM25, weighted fusion (~0.65/0.35), citations.
  - **Note:** FinanceLab uses **Qdrant (a server)**. For a single-user, self-hosted, local tool, prefer an **embedded/file-based vector store** (SQLite+`sqlite-vec`, **LanceDB**, or DuckDB) — lower install friction = better self-hostability. Reconsider Qdrant for this context.
- **Ingestion = "seed once, query many":** parse → chunk (with **page metadata** — critical for citations) → **local** embed → store (vectors + chunk text + metadata + optional BM25). Make it **incremental/idempotent** (content-hash dedup; embed-once cache). Store must support BOTH semantic search AND metadata filter/enumerate (so the lit-review/extraction skills can map-reduce over the corpus later).
- **Scientific-PDF parsing:** the unglamorous wall (equations, two-column, tables, references, OCR). Use a good existing parser (Marker / Docling / MinerU / olmOCR) rather than building from scratch; this is also a differentiator (do it well on **commodity hardware**).
- **Local TTS:** Piper / Kokoro / Coqui XTTS.
- **Packaging:** Docker Compose (FinanceLab already ships dev+prod compose — reuse the pattern). Sane defaults (recommend a default Ollama model; "install Ollama → pull → run").

---

## 13. Name, domain, namespaces

- **Name:** InScien. (Soft downside: pronunciation/spelling ambiguity "in-SY-en" — accepted; outweighed by continuity + clean availability + audience fit. Trivia: archaic word "inscience" = ignorance — ironic but ~nobody knows it.)
- **Domain:** **inscien.com** (owned — best TLD; set auto-renew, was a 1-yr reg expiring 2027-02-08). No need for .ai/.io/.dev since .com is owned.
- **Claim:** `inscien` on **PyPI** + **npm** (both verified free as of mid-2026); confirm the GitHub `Inscien` handle (dormant, likely the user's from the prior product).
- **License:** open-source (MIT or Apache-2.0 typical; AGPL if you want copyleft). Decide based on contribution/commercial goals.

---

## 14. What NOT to do

- ❌ Don't rebuild the synthesis **engine** from scratch — PaperQA2 exists; wrap/borrow, focus on the missing layers.
- ❌ Don't make it a **generic** local-RAG chat — that's a crowded portfolio act. The wedge is *academic + local + verifiable*.
- ❌ Don't build the **commodified** features (arXiv digest, grammar checker, conf tracker) into the core — defer to optional/community skills.
- ❌ Don't **over-agent** — only the value-earning loops (retrieval-sufficiency + answer-grounding). More loops = latency, not quality.
- ❌ Don't build **subscription-auth hacks** for "free" model access (§7). Local models are the legit free path.
- ❌ Don't add **consumer-product overhead** (multi-tenant auth, billing, accounts) — it's self-hosted single-user, BYOK.

---

## 15. Risks & honest cautions

- **Incumbents are moving** (FutureHouse/PaperQA, PapersGPT AutoPilot) toward this gap → move on the narrow wedge; lean on *commodity-hardware local + private* as the angle they structurally can't easily match.
- **Breadth kills solo projects** — the #1 risk. Resist the 7-feature suite; ship 2 skills excellently.
- **Agentic latency on local models** — bound the loops; use nano models for judging.
- **Lit-review (later) is the most model-demanding** — design it to degrade gracefully; it's the strongest case for the BYOK-frontier option.
- **Scientific-PDF parsing** is the unglamorous time-sink — lean on existing parsers; budget for partial coverage / link rot.

---

## 16. First decisions for the new agent

1. **Spec the shared grounding/verification mechanism** (claim ↔ passage ↔ page binding; "is this supported?" judging; verifiable highlight surfacing). *Do this first.*
2. **Engine decision:** wrap PaperQA2 vs. build a paper-specialized RAG-cite loop on the reused MLNotebooks retrieval. (Lean: reuse retrieval + harness, borrow PaperQA2's grounding techniques; don't rebuild what's solved.)
3. **Vector store decision:** embedded (SQLite-vec/LanceDB) for local single-user vs. reuse Qdrant. (Lean: embedded, for self-hostability.)
4. **Parsing lib decision:** Marker vs Docling vs MinerU (commodity-hardware capable).
5. **Repo scaffolding:** fork structure from FinanceLab+MLNotebooks; strip finance/ML-content domains; keep the harness + retrieval; wire the local-model + BYOK config.

---

*This brief reflects decisions and a competitive scan from a planning session (mid-2026). Re-verify package/domain availability and the competitive landscape at build time — the space moves monthly. The reasoning is included so you can adapt rather than follow blindly.*
