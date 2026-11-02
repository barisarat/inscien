"""Search and Ask checks on synthetic input - no model download, no Ollama.

What is pinned: the reference list stays out of the index, passages never cross a page, and an
Ask quote is shown only as the passage's own text.
"""

from inscien.search import answer, llm
from inscien.search.index import window, without_references


def _block(text):
    return {"text": text, "bbox": [0, 0, 10, 10]}


def test_reference_list_is_cut_up_to_the_appendix():
    pages = {
        1: [_block("A title"), _block("References")],  # a heading on page 1 is never taken
        2: [_block("Body text")],
        3: [_block("7 References"), _block("[1] A. Author. A cited work. 2020.")],
        4: [_block("[2] B. Author. Another. 2021."), _block("Appendix A Details"), _block("Appendix body")],
    }
    kept = {page: [b["text"] for b in blocks] for page, blocks in without_references(pages).items()}
    assert kept == {1: ["A title", "References"], 2: ["Body text"], 3: [],
                    4: ["Appendix A Details", "Appendix body"]}


def test_no_reference_heading_keeps_everything():
    pages = {1: [_block("Intro")], 2: [_block("Results")]}
    assert without_references(pages) == pages


def test_window_overlaps_and_boxes_its_blocks():
    blocks = [{"text": "x" * 500, "bbox": [0, 0, 10, 10]}, {"text": "y" * 500, "bbox": [0, 20, 10, 30]}]
    passages = window(blocks)
    assert len(passages) == 2
    assert passages[1]["text"].startswith("x" * 150)
    assert passages[0]["bbox"] == [0, 0, 10, 10]


def test_ask_keeps_only_verbatim_quotes(monkeypatch):
    monkeypatch.setattr(llm, "chat_json", lambda model, system, user: {
        "quotes": [{"n": 1, "text": "judges OVERRATE long-documents"}, {"n": 2, "text": "words the passage never had"}],
        "summary": "Length wins [1], and more [2].",
    })
    rows = [
        {"id": 1, "item_key": "K1", "title": "T", "authors": "A", "year": 2025, "page": 3,
         "text": "We find that judges overrate long documents.", "bbox_json": "[1, 2, 3, 4]"},
        {"id": 2, "item_key": "K1", "title": "T", "authors": "A", "year": 2025, "page": 4,
         "text": "Other text.", "bbox_json": None},
    ]
    result = answer.compose("q", rows, "model", lambda key: None)
    assert [q["text"] for q in result["quotes"]] == ["judges overrate long documents"]
    assert result["quotes"][0]["rects"] == [[1, 2, 3, 4]]
    assert result["summary"] == "Length wins [1], and more."
