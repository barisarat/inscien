# InScien

A local companion for your Zotero library. It maps how the papers you read cite each other, and
reads papers aloud with a follow-along view of the PDF. Everything runs on your machine; nothing
is uploaded.

- **Map** - pick a Zotero collection, build its papers, and see the citation graph: which
  references your papers share, and which papers you have not read yet are cited by several of
  them.
- **Narrate** - turn a paper into an audiobook of its main text: no references, tables, captions,
  footnotes or formulas read out, the author's sentences kept verbatim.
- **Listen** - play a narration with the sentence highlighted in the narration text and on the
  PDF page, with a contents outline, and your position remembered.

## Requirements

- Python 3.12 or newer
- Zotero desktop with a local data directory (InScien reads it, never writes to it)

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
automatically; if it is not, set its data directory on the Settings page.

## Build and narrate from the app

1. In the sidebar, open a Zotero collection.
2. **Build** a paper to add its references to the map. A build reads the reference list from the
   PDF and resolves it against OpenAlex, Crossref and Semantic Scholar.
3. **Narrate** a paper to make its audiobook. The first narration downloads the voice weights
   (about 340 MB) once.

One job runs at a time; the job pane shows its steps and progress and can cancel it.

## Command line

```sh
inscien build <paper.pdf>      # add a paper to the library
inscien narrate <paper.pdf>    # make a narration
inscien voices                 # list the voices
inscien sample am_echo af_heart   # one paragraph in those voices, to choose by ear
inscien --help
```

`inscien narrate` takes `--voice` (comma-separated for several tracks), `--speed` and
`--device cuda`.

## Where data goes

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
| `INSCIEN_HIDDEN_COLLECTIONS` | top-level Zotero collections to leave out, comma-separated     |
| `INSCIEN_READONLY`           | `1` refuses every change except listening progress             |

Narration runs on the CPU at a few times realtime. For a GPU, replace `onnxruntime` with
`onnxruntime-gpu` in the same environment and set `INSCIEN_TTS_DEVICE=cuda`.

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
