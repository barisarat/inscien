# InScien

A local app on top of your Zotero library that does four things:

1. Extracts the references from your papers and gets their citation counts
2. Maps the citation connections
3. Narrates papers with a player that follows along in the PDF, using local offline TTS
4. Searches the papers and answers questions with quotes from them (optional)

## Requirements

- Python 3.12 or newer
- Zotero desktop with a local data directory (for read-only Zotero access)
- For Ask: a local [Ollama](https://ollama.com)

## Install and run

```sh
uvx inscien
```

or

```sh
pip install inscien
inscien
```

This starts the app on a loopback port and opens it in the browser. Zotero is found
automatically. If it is not found, set its data directory on the Settings page.

Search and Ask come with the `search` extra:

```sh
uvx --from "inscien[search]" inscien
```

or

```sh
pip install "inscien[search]"
```

## How to

1. In the sidebar, open a Zotero collection.
2. **Build** a paper to add its references to the map. A build reads the reference list from the
   PDF and resolves it against OpenAlex, Crossref and Semantic Scholar.
3. **Narrate** a paper to make its audiobook. The first narration downloads the voice weights
   (about 340 MB) once.
4. **Index** the papers for search with Update index in the search settings, or `inscien index`.
   The first index downloads the search models once.
5. **Search** from the search bar. **Ask** and the LLM rerank appear while Ollama is running.

One job runs at a time. The job pane shows its steps and progress and can cancel it.

## CLI

```sh
inscien build <paper.pdf>      # add a paper to the library
inscien narrate <paper.pdf>    # make a narration
inscien index                  # build or update the search index
inscien voices                 # list the voices
inscien sample am_echo af_heart   # one paragraph in those voices, to choose by ear
inscien --help
```

`inscien narrate` takes `--voice` (comma-separated for several tracks), `--speed` and
`--device cuda`.

## Storage

Everything InScien writes is under one directory, `INSCIEN_HOME`:

| OS      | Default                                     |
| ------- | ------------------------------------------- |
| Linux   | `~/.local/share/inscien`                    |
| macOS   | `~/Library/Application Support/inscien`     |
| Windows | `%LOCALAPPDATA%\inscien`                    |

```text
library/     built papers (paper.json, extract.json)
bundles/     finished narrations, and where each listen stopped
narrate/     narration queue and per-paper work files
import/      PDFs staged for a build
data/        settings, the Zotero snapshot, the current job
weights/     the voice weights
search/      the search index and its models
```

To move or back up your data, move or copy that directory.

## Configuration

All optional, as environment variables.

| Variable                     | Effect                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| `INSCIEN_HOME`               | where data goes                                                |
| `ZOTERO_DATA_DIR`            | the Zotero data directory, when it is not detected             |
| `INSCIEN_CONTACT_EMAIL`      | sent to OpenAlex and Crossref for their faster polite pool     |
| `S2_API_KEY`                 | a Semantic Scholar API key, for higher rate limits             |
| `INSCIEN_TTS_DEVICE`         | `cuda` to narrate on an NVIDIA GPU (see below)                 |
| `INSCIEN_SEARCH_DEVICE`      | `cuda` to index and rerank on an NVIDIA GPU (see below)        |
| `INSCIEN_LLM_MODEL`          | the Ollama model for Ask and the rerank (`qwen2.5:7b-instruct`) |
| `INSCIEN_LLM_URL`            | where Ollama answers (`http://127.0.0.1:11434`)                |
| `INSCIEN_HIDDEN_COLLECTIONS` | top-level Zotero collections to leave out, comma-separated     |
| `INSCIEN_READONLY`           | `1` refuses every change except listening progress             |

Narration and search run on the CPU by default, narration at a few times realtime. To use an
NVIDIA GPU:

1. Replace `onnxruntime` with `onnxruntime-gpu` in the same environment.
2. Set `INSCIEN_TTS_DEVICE=cuda` for narration and `INSCIEN_SEARCH_DEVICE=cuda` for search.

## Development

Needs [uv](https://docs.astral.sh/uv/), and Node only to build the UI.

```sh
make setup      # .venv with the package editable, and the frontend deps
make backend    # API on :8000 with reload
make frontend   # UI dev server on :3000
make test
make wheel      # build the UI into the package, then the wheel
```

## License

See [LICENSE](LICENSE).
