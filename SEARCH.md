# Search and Ask

Search and Ask work over every PDF in the library sidebar. They come with the `search` extra.

## What they do

- **Search** returns passages across the papers, each with its paper and page. A result opens the
  PDF at that page with the passage marked.
- **Ask** answers a question with verbatim quotes from the papers, each linked to its paper and
  page, and a short response that cites only those quotes. It needs a local Ollama.

## How it works

1. **Index** with `inscien index` or Update index in the search settings. Each PDF is split into
   passages that never cross a page, embedded, and stored in one sqlite file under
   `INSCIEN_HOME/search/`. The reference list is left out and paper metadata comes from Zotero.
   An update reads only new and changed papers.
2. **Retrieve** by keyword (BM25), meaning (vectors) or hybrid, which fuses the two rankings with
   reciprocal rank fusion.
3. **Filter and rerank** with an optional year range and Zotero collection, then an optional
   neural or LLM rerank, then a cap on passages per paper.
4. **Ask** has the model pick quotes from the top passages. Each quote is matched back against its
   passage and dropped if it does not match. The text shown is always the passage's own.

## Where it lives

| Part | Code |
|---|---|
| Index, retrieval, Ask | `src/inscien/search/` (`index.py`, `query.py`, `answer.py`, `models.py`, `llm.py`) |
| HTTP API | `src/inscien/routers/search.py` |
| Search bar and settings | `frontend/src/components/search/` |
| Results page | `frontend/src/app/map/search/` (`/map/search`) |

Each module's docstring has the details.
