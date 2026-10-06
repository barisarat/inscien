"""Fast checks - no GPU, no model, no synthesis.

The structure stage is where a bad narration comes from, so these assert the properties that
were regressions during development rather than trying to pin exact counts, which move with
every heuristic tweak.

The PDF tests skip when `papers/` is empty, since papers are gitignored.
"""

import re
from pathlib import Path

import pytest

from inscien.narrate import convert, lexical
from inscien.narrate.prosody import (MARKER_GAP_BONUS, PARAGRAPH_GAP, SENTENCE_GAP, plan,
                                plan_sentences, split_paragraph)

PAPERS = Path(__file__).resolve().parent.parent / "papers"
# Skip anything already prepared for narration - these assertions are about what ingestion
# does to a real two-column journal PDF, which a single-column generated one would not test.
PDFS = sorted(p for p in PAPERS.glob("*.pdf") if "[TTS]" not in p.name) \
    if PAPERS.is_dir() else []
needs_pdf = pytest.mark.skipif(not PDFS, reason="no source PDF in papers/")


# --- pure units --------------------------------------------------------------------------

def test_expansion_is_off_by_default():
    # ACRONYMS is empty on purpose: the narration-pdf skill already applies the acronym
    # policy upstream, and a second pass here undoes it.
    assert lexical.ACRONYMS == {}
    assert lexical.expand_acronyms("LLMs beat one LLM.") == "LLMs beat one LLM."


def test_acronyms_expand_but_spare_proper_nouns():
    text = lexical.expand_acronyms("LLMs beat CritiqueLLM and LLMEval2, unlike one LLM.",
                                   lexical.ML_ACRONYMS)
    assert "large language models beat" in text
    assert "CritiqueLLM" in text and "LLMEval2" in text
    assert not re.search(r"(?<![A-Za-z])LLM(?![A-Za-z0-9])", text)


def test_gloss_stutter_is_removed():
    # Expansion would otherwise produce "large language models (large language models)".
    assert "(" not in lexical.expand_acronyms("Large language models (LLMs) have achieved",
                                              lexical.ML_ACRONYMS)


def test_citations_stripped():
    assert lexical.strip_citations("Zhang et al. [45] propose [1, 2-4] things.") == \
        "Zhang et al. propose things."


def test_headings_are_announced():
    assert convert.spoken_heading("Reasoning tasks", "3.1") == \
        "Section three point one. Reasoning tasks."
    assert convert.spoken_heading("INTRODUCTION") == "Section. Introduction."


def test_back_to_back_headings_say_section_once():
    # A section opening straight onto its first subsection: saying "Section" twice in a row
    # is the tic this avoids. The number still places the listener.
    blocks = [
        {"id": 0, "type": "heading", "level": 1, "number": "3", "text": "3 Method"},
        {"id": 1, "type": "heading", "level": 2, "number": "3.1", "text": "3.1 Setup"},
        {"id": 2, "type": "paragraph", "level": None, "text": "A sentence."},
        {"id": 3, "type": "heading", "level": 2, "number": "3.2", "text": "3.2 Results"},
    ]
    nodes = convert.passthrough(blocks)
    assert nodes[0]["text"] == "Section three. Method."
    assert nodes[1]["text"] == "Three point one. Setup."
    # Prose in between resets it: this one announces again.
    assert nodes[3]["text"] == "Section three point two. Results."


def test_split_paragraph_respects_the_cap():
    text = ". ".join(f"Sentence number {i} runs on for a while" for i in range(60)) + "."
    assert all(len(piece) <= 480 for piece in split_paragraph(text))
    # Nothing may be lost: every word survives the split.
    assert len(" ".join(split_paragraph(text)).split()) == len(text.split())


def test_prosody_gives_headings_more_air_than_paragraphs():
    nodes = [
        {"id": 0, "type": "heading", "level": 1, "text": "Section. One.", "display": "One"},
        {"id": 1, "type": "paragraph", "level": None, "text": "A sentence.", "display": "A"},
    ]
    units = plan(nodes, profile="b")
    assert units[0]["gap_after"] > units[1]["gap_after"]
    assert units[0]["speed"] < units[1]["speed"]   # headings are announced, not raced


# --- against a real paper ------------------------------------------------------------------

@needs_pdf
def test_structure_leaves_no_hyphen_breaks_or_furniture():
    from inscien.narrate import structure

    blocks, stats = structure.analyze(str(PDFS[0]))
    kept = [b for b in blocks if not b.get("drop") and b["type"] == "paragraph"]
    prose = " ".join(b["text"] for b in kept)

    assert stats["kept_words"] > 500
    # Line-break hyphens would be voiced as two words.
    assert not re.search(r"\w+- \w+", prose)
    # Sentences split across a page boundary must have been rejoined.
    assert stats["merged"] > 0
    # A heading is never bare notation.
    headings = [b["text"] for b in blocks if b["type"] == "heading" and not b.get("drop")]
    assert all(re.search(r"[A-Za-z]", h) for h in headings)


@needs_pdf
def test_passthrough_produces_narratable_nodes():
    from inscien.narrate import structure

    blocks, _ = structure.analyze(str(PDFS[0]))
    lexical.apply(blocks)
    nodes = convert.passthrough(blocks)

    assert nodes
    assert all(n["text"].strip() for n in nodes)
    assert all(n["text"].isascii() for n in nodes)
    assert any(n["type"] == "heading" for n in nodes)
    # The first heading of a run announces itself; one immediately following another drops
    # the word and keeps its number, so "starts with Section" holds only for the first.
    headings = [i for i, n in enumerate(nodes) if n["type"] == "heading"]
    for i in headings:
        follows_heading = i > 0 and nodes[i - 1]["type"] == "heading"
        if not follows_heading:
            assert nodes[i]["text"].startswith("Section")
        else:
            assert not nodes[i]["text"].startswith("Section")


def test_a_discourse_marker_gets_more_air_than_a_plain_stop():
    # Unjittered, so this asserts the policy rather than one draw of the RNG.
    sents, gaps = plan_sentences("First one. However, a second. A third.", lambda ms: ms)
    assert sents == ["First one.", "However, a second.", "A third."]
    assert gaps == [SENTENCE_GAP + MARKER_GAP_BONUS, SENTENCE_GAP]
    # The step down from a paragraph break to a sentence break has to stay audible.
    assert PARAGRAPH_GAP > SENTENCE_GAP + MARKER_GAP_BONUS


def test_sentences_inside_a_paragraph_get_planned_gaps():
    node = {"id": 0, "type": "paragraph", "level": None,
            "text": "First one. However, a second. A third."}
    unit = plan([node], profile="b")[0]
    assert unit["sentences"] == ["First one.", "However, a second.", "A third."]
    # One gap per interior boundary; the paragraph-final stop is the unit's own gap_after.
    assert len(unit["sentence_gaps"]) == 2
    assert all(g > 0 for g in unit["sentence_gaps"])


def test_only_profile_b_plans_sentence_gaps():
    # a is the flat baseline and c already synthesizes one sentence per call; adding gaps to
    # either would stop them being the comparison they exist to be.
    node = {"id": 0, "type": "paragraph", "level": None, "text": "One. Two."}
    for profile in ("a", "c"):
        assert all("sentence_gaps" not in u for u in plan([node], profile=profile))


# --- pause widening ------------------------------------------------------------------------

def _speech(seconds, level=0.3):
    import numpy as np

    n = int(24000 * seconds)
    t = np.arange(n) / 24000.0
    return (level * np.sin(2 * np.pi * 180 * t)).astype("float32")


def _utterance(*, gap_ms):
    """Two "sentences" of tone with a quiet gap between them."""
    import numpy as np

    quiet = np.zeros(int(24000 * gap_ms / 1000), dtype="float32")
    return np.concatenate([_speech(1.0), quiet, _speech(1.0)])


def test_quiet_run_is_found_and_padded_to_the_planned_gap():
    from inscien.narrate.tts import SAMPLE_RATE, widen_sentence_gaps
    import numpy as np

    rng = np.random.default_rng(0)
    samples = _utterance(gap_ms=200)
    out, bounds = widen_sentence_gaps(samples, ["A sentence.", "Another sentence."], [500],
                                      0.0005, rng)
    added = (len(out) - len(samples)) / SAMPLE_RATE * 1000
    assert 280 < added < 320                      # 500 planned minus the 200 already there
    assert bounds and bounds[0] is not None
    # The cue boundary sits inside the silence, not inside either sentence.
    assert abs(bounds[0] / SAMPLE_RATE - 1.15) < 0.2


def test_every_located_boundary_gets_at_least_the_floor():
    from inscien.narrate.tts import MIN_ADDED_MS, SAMPLE_RATE, widen_sentence_gaps
    import numpy as np

    # The gap already exceeds the target, so the pad computes to nothing - but what counts as
    # quiet starts inside the fading tail of the last syllable, so the measurement runs ahead
    # of what a listener hears. The floor is what stops that arithmetic silently producing the
    # rushed boundaries it was meant to fix.
    samples = _utterance(gap_ms=600)
    out, bounds = widen_sentence_gaps(samples, ["A sentence.", "Another sentence."], [380],
                                      0.0005, np.random.default_rng(0))
    added = (len(out) - len(samples)) / SAMPLE_RATE * 1000
    assert abs(added - MIN_ADDED_MS) < 5
    assert bounds[0] is not None


def test_unlocatable_boundary_leaves_the_audio_untouched():
    from inscien.narrate.tts import widen_sentence_gaps
    import numpy as np

    # Continuous speech with no pause in it at all: nothing to widen, and the fallback must
    # be "as Kokoro rendered it" rather than silence spliced into the middle of a word.
    samples = _speech(2.0)
    out, bounds = widen_sentence_gaps(samples, ["A sentence.", "Another sentence."], [380],
                                      0.0005, np.random.default_rng(0))
    assert len(out) == len(samples)
    assert bounds == [None]


def test_sentence_spans_partition_the_unit_and_use_measured_boundaries():
    from inscien.narrate.bundle import sentence_spans

    sents = ["A.", "B.", "C."]
    # 24000 samples = 1s of audio spanning 10.0 -> 11.0; only the first boundary was measured.
    spans = sentence_spans(10.0, 11.0, sents, [6000, None], 24000)
    assert len(spans) == 3
    assert spans[0][0] == 10.0 and spans[-1][1] == 11.0
    assert all(spans[i][1] == spans[i + 1][0] for i in range(2))   # no holes, no overlap
    assert abs(spans[0][1] - 10.25) < 1e-6                         # the measured one, exact
    assert 10.25 < spans[1][1] < 11.0                              # the other, interpolated


# --- reading order and empty sections --------------------------------------------------------

def test_single_column_page_is_not_split_into_columns():
    from inscien.narrate.structure import two_column_page

    # A justified single-column body - every narration PDF this tool is pointed at. The blocks
    # run margin to margin, so their centre lands ON the midpoint: the case that used to put
    # prose in "column 1" and lift every heading and short line to the top of the page.
    width, mid = 595.28, 297.64
    blocks = [{"bbox": [65.0, y, 530.28, y + 10]} for y in (100, 130, 160, 190)]
    blocks.append({"bbox": [65.0, 220, 307.0, 232]})        # a heading: narrower, left-aligned
    assert not two_column_page(blocks, mid, width)


def test_two_column_page_is_detected():
    from inscien.narrate.structure import two_column_page

    width, mid = 612.0, 306.0
    blocks = [{"bbox": [45.0, y, 295.0, y + 10]} for y in (100, 130, 160)]
    blocks += [{"bbox": [317.0, y, 567.0, y + 10]} for y in (100, 130, 160)]
    assert two_column_page(blocks, mid, width)


def test_two_column_page_with_a_full_width_table_still_reads_as_two_column():
    from inscien.narrate.structure import two_column_page

    # Measured at 40% straddling on the Faggioli source; calling it single-column would
    # interleave the two columns, which is the damage the test exists to prevent.
    width, mid = 612.0, 306.0
    blocks = [{"bbox": [45.0, y, 295.0, y + 10]} for y in (100, 130, 160)]
    blocks += [{"bbox": [317.0, y, 567.0, y + 10]} for y in (100, 130, 160)]
    blocks += [{"bbox": [45.0, y, 567.0, y + 10]} for y in (300, 320, 340, 360)]
    assert two_column_page(blocks, mid, width)


def test_a_numbered_heading_with_nothing_under_it_is_dropped():
    from inscien.narrate.structure import drop_empty_headings

    blocks = [
        {"type": "heading", "number": "2.3", "text": "2.3 Fully Automated Test Collections"},
        {"type": "heading", "number": "3", "text": "3 SPECTRUM OF HUMAN-MACHINE COLLABORATION"},
        {"type": "paragraph", "text": "To discuss potential capabilities of LLMs, we devise."},
    ]
    drop_empty_headings(blocks)
    assert blocks[0]["drop"] is True        # announced a section that had no content
    assert not blocks[1].get("drop")


def test_a_section_introducing_its_own_subsection_survives():
    from inscien.narrate.structure import drop_empty_headings

    blocks = [
        {"type": "heading", "number": "3", "text": "3 Method"},
        {"type": "heading", "number": "3.1", "text": "3.1 Setup"},
        {"type": "paragraph", "text": "We ran the experiment twice."},
    ]
    drop_empty_headings(blocks)
    assert not blocks[0].get("drop") and not blocks[1].get("drop")


def test_figure_labels_still_cannot_take_a_numbered_section_with_them():
    from inscien.narrate.structure import drop_empty_headings

    # The 2026-08-25 regression: labels inside the spectrum diagram classified as headings and
    # silently deleted the real sections. A label carries no number, so it can never qualify.
    blocks = [
        {"type": "heading", "number": "3", "text": "3 SPECTRUM OF HUMAN-MACHINE COLLABORATION"},
        {"type": "heading", "text": "Human Judgment"},
        {"type": "heading", "text": "AI Assistance"},
        {"type": "paragraph", "text": "To discuss potential capabilities of LLMs, we devise."},
    ]
    drop_empty_headings(blocks)
    assert not blocks[0].get("drop")
    assert blocks[1]["drop"] is True       # heading followed by heading: nothing under it
    assert not blocks[2].get("drop")


def test_a_dash_continuation_rejoins_its_sentence():
    from inscien.narrate.structure import merge_wrapped

    # What a stripped citation leaves behind: "...the pool [55]-in order to construct..." with
    # the tail starting a new paragraph on a dash.
    blocks = [
        {"type": "paragraph",
         "text": "identify potentially relevant documents that only manual runs would "
                 "contribute to the pool"},
        {"type": "paragraph", "text": "- in order to construct low-bias reusable test "
                                      "collections."},
    ]
    out = merge_wrapped(blocks)
    assert len(out) == 1
    assert out[0]["text"].endswith("pool - in order to construct low-bias reusable test "
                                   "collections.")


def test_an_abbreviation_does_not_end_a_sentence():
    from inscien.narrate.prosody import sentences_of

    # The 380ms sentence gap used to land inside this sentence, 68 times in one survey.
    assert sentences_of("Alternatively, Keikha et al. suggest to transfer judgments.") == \
        ["Alternatively, Keikha et al. suggest to transfer judgments."]
    assert len(sentences_of("See Fig. 3 for the layout. It shows the spectrum.")) == 2


def test_a_stop_inside_a_quote_still_ends_the_sentence():
    from inscien.narrate.prosody import sentences_of

    # The stop sits inside the quote, so a plain lookbehind missed the boundary entirely and
    # it kept whatever short gap Kokoro rendered. The quote stays on its own sentence.
    assert sentences_of('He called it "the pool." Then he stopped.') == \
        ['He called it "the pool."', "Then he stopped."]


def test_a_lone_capital_still_ends_a_sentence():
    from inscien.narrate.prosody import sentences_of

    # In narration text a lone capital is maths, not an author's initial - the skill has
    # already stripped the reference list.
    assert len(sentences_of("From input to output we obtain E. Within this frame it holds.")) == 2


# --- source anchoring ------------------------------------------------------------------------

def _source(text, page=1):
    """A fake source word stream: one token per word, one rect each, laid out in a line."""
    from inscien.narrate.anchors import tokens_of

    return [{"tok": t, "page": page, "raw": t,
             "rects": [[10.0 + 12 * i, 100.0, 20.0 + 12 * i, 110.0]]}
            for i, t in enumerate(tokens_of(text))]


def test_a_node_anchors_despite_stripped_citations():
    from inscien.narrate import anchors

    # The source carries citation numbers and a gloss the narration dropped; the words that
    # remain are still in the same order, which is what the shingle vote runs on.
    source = _source("also for the task of query performance prediction qpp 16 48 the goal "
                     "is to estimate retrieval effectiveness without manual judgments")
    index = anchors.build_index(source)
    node = anchors.tokens_of("Also for the task of query performance prediction, the goal is "
                             "to estimate retrieval effectiveness without manual judgments.")
    start, end, overlap = anchors.locate(node, source, index)
    # Not just "somewhere near": the span has to start at the paragraph's first word, which is
    # what the cluster is for - the shingles after the citation vote for a shifted offset and
    # outnumber the ones before it.
    assert start == 0
    assert overlap == 1.0
    assert end >= len(node)


def test_document_order_breaks_a_repeated_phrase_tie():
    from inscien.narrate import anchors

    # A paper restates itself: the same sentence in the abstract and the conclusion. Without
    # the bonus for offsets after the previous node, the second mention anchors to the first.
    repeated = "we find that measures computed under the judgments correlate well"
    source = _source(repeated + " " + " ".join(["padding"] * 30) + " " + repeated)
    index = anchors.build_index(source)
    node = anchors.tokens_of(repeated)
    assert anchors.locate(node, source, index, after=40)[0] == 40   # the second occurrence
    assert anchors.locate(node, source, index, after=0)[0] == 0     # no bonus: the first


def test_a_short_heading_anchors_by_exact_sequence_after_the_previous_node():
    from inscien.narrate import anchors

    # "2 Related Work" is two shingle-less tokens; it is found as an exact sequence in the
    # window after the previous node, so the same words earlier in the paper do not win.
    source = _source("related work is cited early on and then the paper continues for a while "
                     "before the section 2 related work begins with its first sentence here")
    index = anchors.build_index(source)
    start, end, overlap = anchors.locate(anchors.tokens_of("2 Related Work"), source, index, after=10)
    assert source[start]["tok"] == "related" and end - start == 2 and overlap == 1.0
    assert start > 10


def test_spoken_numbers_do_not_break_the_shingles():
    from inscien.narrate import anchors

    # The page says "0.81" and "k = 10"; the node says them as words. Both sides drop the
    # number tokens, so the prose around them still shingles.
    source = _source("adapters achieve rho of 0.81 at k = 10 across all configurations of the study")
    index = anchors.build_index(source)
    node = anchors.tokens_of("adapters achieve rho of zero point eight one at k equals 10 across all "
                             "configurations of the study")
    found = anchors.locate(node, source, index)
    assert found is not None and found[2] >= 0.9


def test_a_glued_superscript_citation_leaves_the_word_whole():
    from inscien.narrate.anchors import strip_glued_citation, tokens_of

    assert tokens_of(strip_glued_citation("reviews.5\u201311")) == ["reviews"]
    assert tokens_of(strip_glued_citation("completed.2,3")) == ["completed"]
    assert tokens_of(strip_glued_citation("GPT-4")) == ["gpt4"]
    assert tokens_of(strip_glued_citation("F1")) == ["f1"]


def test_the_span_covers_the_words_before_a_dropped_gloss():
    from inscien.narrate import anchors

    # The narration dropped "(AI)", so the opening shingle does not match; the span still
    # starts at "artificial", from the cluster's offset, and ends on the last word.
    source = _source("earlier text here artificial intelligence ai has emerged as a potential "
                     "solution with recent studies suggesting its capability to enhance reviews")
    index = anchors.build_index(source)
    node = anchors.tokens_of("Artificial intelligence has emerged as a potential solution with "
                             "recent studies suggesting its capability to enhance reviews.")
    start, end, _ = anchors.locate(node, source, index)
    assert source[start]["tok"] == "artificial"
    assert source[end - 1]["tok"] == "reviews"


def test_an_invented_line_does_not_anchor():
    from inscien.narrate import anchors

    # "End of paper." and the spoken title line are written by the skill and appear nowhere in
    # the source. Guessing a position for them would highlight the wrong paragraph.
    source = _source("the paper discusses relevance judgments made by large language models")
    index = anchors.build_index(source)
    assert anchors.locate(anchors.tokens_of("End of paper."), source, index) is None


def test_rects_merge_per_line_not_per_word():
    from inscien.narrate import anchors

    source = _source("alpha beta gamma delta epsilon")
    # A second line on the same page: same x range, lower down.
    source += [{"tok": "six", "page": 1, "raw": "six", "rects": [[10.0, 130.0, 30.0, 140.0]]}]
    rects = anchors.line_rects(source, 0, len(source))
    assert len(rects) == 2                      # five words on one line, one on the next
    assert rects[0]["x0"] == 10.0 and rects[0]["x1"] > 50.0
    assert rects[1]["y0"] == 130.0


def test_dehyphenation_keeps_both_halves_boxes():
    from inscien.narrate.anchors import dehyphenate

    entries = [{"raw": "re-", "page": 1, "rects": [[10.0, 100.0, 20.0, 110.0]]},
               {"raw": "search", "page": 1, "rects": [[10.0, 120.0, 40.0, 130.0]]}]
    out = dehyphenate(entries)
    assert len(out) == 1 and out[0]["tok"] == "research"
    # Both boxes survive, so the highlight covers the word on both lines.
    assert len(out[0]["rects"]) == 2


def test_et_al_loses_the_dot_that_ends_the_sentence():
    from inscien.narrate.lexical import say_et_al

    # Not splitting there stops us ADDING a pause; only removing the dot stops Kokoro giving
    # the phrase a falling, sentence-final intonation of its own.
    assert say_et_al("Bender et al. highlight limitations.") == \
        "Bender and colleagues highlight limitations."
    assert say_et_al("as Zhang et al, we find") == "as Zhang and colleagues, we find"


def test_say_vs():
    from inscien.narrate.lexical import say_vs
    # "vs." was voiced "vee-ess" with a sentence stop after it. Prose already arrives as
    # "versus" from the skill; headings are verbatim, so this stage says it.
    assert say_vs("Agreement vs. Gullibility") == "Agreement versus Gullibility"
    assert say_vs("35% vs price-only baselines") == "35% versus price-only baselines"
    assert say_vs("the vs_mode flag") == "the vs_mode flag"


def test_decimals_and_currency_are_spoken_not_printed():
    from inscien.narrate.lexical import say_numbers

    # "0.90" is a full stop as far as the engine's sentence logic goes.
    assert say_numbers("a tau of 0.90 for mean") == "a tau of zero point nine zero for mean"
    assert say_numbers("spending USD 0.25 per judgment") == \
        "spending zero point two five US dollars per judgment"
    assert say_numbers("USD 111 in total") == "111 US dollars in total"
    # A thousands separator must not turn into its own number.
    assert say_numbers("1,000.50 rows") == "1,000.50 rows"


def test_headings_keep_their_numbers_as_written():
    from inscien.narrate import lexical

    # `convert.spoken_heading` strips the leading number by matching block["number"] against
    # the text; a rewritten "2 point three" would no longer match and would be read twice.
    blocks = [{"type": "heading", "number": "2.3", "text": "2.3 Fully Automated Collections"},
              {"type": "paragraph", "text": "It reached 0.90 on that measure."}]
    lexical.apply(blocks)
    assert blocks[0]["text"] == "2.3 Fully Automated Collections"
    assert "zero point nine zero" in blocks[1]["text"]


def test_a_decimal_is_spelled_with_no_digit_left_beside_the_point():
    from inscien.narrate.lexical import say_numbers, words_for

    # "0 point nine zero" was not enough: a numeral next to a period is still read as an
    # abbreviation ending a sentence. Nothing numeric may remain on either side of "point".
    assert say_numbers("it reached 12.5 percent") == "it reached twelve point five percent"
    assert words_for("21") == "twenty-one"
    # Big numbers keep their digits: the engine reads those better than a hand-rolled speller.
    assert say_numbers("2021.5 was odd") == "2021 point five was odd"


def test_both_sides_tokenize_a_hyphenated_word_the_same_way():
    from inscien.narrate.anchors import dehyphenate, tokens_of

    # The invariant the sentence anchors depend on. When these disagreed, every shingle
    # containing a hyphenated word failed to match: 128 of 200 sentences anchored instead of
    # 172, and a sentence carrying two of them fell back to highlighting its whole paragraph.
    source = dehyphenate([{"raw": "self-recognition", "page": 1, "rects": [[0, 0, 1, 1]]}])
    assert [e["tok"] for e in source] == tokens_of("self-recognition")
    assert tokens_of("self-recognition capability") == ["selfrecognition", "capability"]


def test_a_plural_possessive_loses_its_silent_apostrophe():
    from inscien.narrate.lexical import drop_plural_possessive

    # "LLMs'" was voiced as separate letters. In speech the apostrophe is not pronounced at
    # all, so removing it costs nothing and fixes the reading.
    assert drop_plural_possessive("for the LLMs' ordering") == "for the LLMs ordering"
    assert drop_plural_possessive("higher than others' while") == "higher than others while"
    # The singular possessive IS pronounced, so it stays.
    assert drop_plural_possessive("the model's output") == "the model's output"


def test_a_unit_break_on_a_sentence_end_gets_a_sentence_pause():
    from inscien.narrate.prosody import ends_a_sentence

    # `split_paragraph` cuts a long paragraph on sentence boundaries, so most unit breaks are
    # sentence breaks. Treating them as forced splits left them at 45ms - measured at ~80ms in
    # the finished audio while the median boundary was 650ms.
    assert ends_a_sentence("It reached the limit.")
    assert ends_a_sentence('He called it "the pool."')
    assert not ends_a_sentence("It reached the limit, and then")
    # An abbreviation's dot is not a sentence end, here as everywhere else.
    assert not ends_a_sentence("as shown by Zhang et al.")


def test_a_long_paragraph_keeps_its_sentence_pauses_across_units():
    long_sentence = ("This sentence is deliberately long so that the paragraph runs past the "
                     "character cap that forces a split into separate synthesis units. ")
    node = {"id": 0, "type": "paragraph", "level": None, "text": long_sentence * 4}
    units = plan([node], profile="b")
    assert len(units) > 1                      # the cap really did split it
    for unit in units[:-1]:
        assert unit.get("sentence_boundary") is True
        assert unit["gap_after"] > 300         # not the 45ms forced-split gap


def test_an_acronym_said_as_a_word_is_not_spelled_out():
    from inscien.narrate.lexical import say_as_word

    # Kokoro spells any all-caps token letter by letter, so RAG came out as "ar ey gee".
    # Mixed case is read as a word; that is the entire mechanism.
    assert say_as_word("RAG systems and RAG-based pipelines") == \
        "Rag systems and Rag-based pipelines"
    # A proper noun that merely contains one survives: the boundary guards see the letters.
    assert say_as_word("RoBERTa and BERT") == "RoBERTa and Bert"
    # "Llama" was still read "ell-ama": the double L survives title casing. In English the
    # word is a homophone of "lama", so that spelling is what the engine gets.
    assert say_as_word("LLaMA-2 and Vicuna") == "Lama-2 and Vicuna"
    assert say_as_word("LoRA adapters and LoRA-tuned") == "Lora adapters and Lora-tuned"
    # A version glued to the name ("LLaMA3-instruct-8B") and every casing the papers use
    # ("LLaMa2-7b-ins", "LLAMA 3.2") go through the pattern, not the exact token: the token
    # rule wants a non-alphanumeric after the name, and "LLaMA3" was voiced "ell-ama three".
    assert say_as_word("LLaMA3-instruct-8B and LLaMa2-7b-ins") == "Lama3-instruct-8B and Lama2-7b-ins"
    assert say_as_word("LLAMA 3.2 and Llama 2") == "Lama 3.2 and Lama 2"
    assert say_as_word("LLaVA-1.5") == "Lava-1.5"


def test_a_section_reference_is_spoken_like_a_heading():
    from inscien.narrate.lexical import say_numbers, say_section_refs

    # Same convention as convert.spoken_heading: part by part, not digit by digit.
    assert say_section_refs("as described in Section 3.4.") == \
        "as described in Section three point four."
    assert say_section_refs("see Table 5.10") == "see Table five point ten"
    # A decimal keeps the digit-by-digit reading, and now survives a sentence-ending period.
    assert say_numbers("an agreement of 0.90.") == "an agreement of zero point nine zero."
    # Three parts with no prefix to identify them: left whole rather than half-spoken.
    assert say_numbers("the value 3.4.1 stays") == "the value 3.4.1 stays"


def test_an_acronym_compound_keeps_its_hyphen_across_a_line_break():
    from inscien.narrate.structure import dehyphenate

    # The narration PDF breaks lines AT an existing hyphen, so "LLM-assigned" arrived as
    # "LLM- assigned" and was joined into "LLMassigned" - the paper used the compound only
    # there, so the vocabulary check had nothing to match.
    blocks = [{"text": "we switch from human-assigned to LLM- assigned labels"}]
    dehyphenate(blocks)
    assert blocks[0]["text"] == "we switch from human-assigned to LLM-assigned labels"


def test_a_soft_hyphen_still_joins():
    from inscien.narrate.structure import dehyphenate

    # The case the heuristic exists for: the joined form appears elsewhere in the document.
    blocks = [{"text": "the defini- tions above"}, {"text": "these definitions matter"}]
    dehyphenate(blocks)
    assert blocks[0]["text"] == "the definitions above"
