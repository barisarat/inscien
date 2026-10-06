"""Narration nodes -> synthesis units with per-unit rate and pauses.

Kokoro exposes exactly two controls - a voice vector and a speed scalar - so the levers for
sounding less mechanical are: where prosody resets (the unit boundary), the rate per unit,
and the length and content of the gap between units.

Three profiles were A/B tested against each other on a real section:

  a  flat baseline. Paragraph units, one speed, one gap length. The starting point.
  b  paragraph units, per-node rate, graduated + jittered gaps. WINNER, and the default.
  c  sentence units, per-sentence rate by role. More control, but Kokoro restarts intonation
     on every call, so six sentences become six restarts at the same pitch - it gains
     variation and loses connection.

`b` wins because the paragraph is where a prosody reset is actually WANTED. Splitting finer
buys per-sentence rate at the cost of the declination that makes a paragraph sound spoken.

The cost of `b` would be the pause at every full stop that is not a paragraph end: a
planned gap sits between two units, and the paragraph is one unit, so those boundaries would
get only what Kokoro renders for a period. `b` plans them too (SENTENCE_GAP), and the
synthesis stage pads the rendered audio to match rather than splitting the call - the pause
is bought without giving up the single contour that won the A/B in the first place.
"""

import random
import re

# Closer to Kokoro's real ~510-token ceiling than the 400 the prototype used: fewer forced
# mid-paragraph splits means fewer unwanted prosody resets.
MAX_CHARS = 480

# A sentence opening with one of these is a turn in the argument. A speaker marks the turn by
# leaving a beat and slowing into it - the most recoverable piece of "talk-like" delivery
# available without touching a single word of the text.
DISCOURSE_MARKERS = (
    "however", "moreover", "furthermore", "in contrast", "by contrast", "on the other hand",
    "on the one hand", "as a result", "therefore", "thus", "consequently", "for example",
    "for instance", "in particular", "specifically", "importantly", "notably", "in addition",
    "nevertheless", "nonetheless", "that is", "in other words", "finally", "first", "second",
    "third", "crucially", "conversely", "similarly", "instead", "overall", "in summary",
)

# Gap before/after a heading, by depth. A chapter break gets more air than a minor subhead.
#
# These four and the two below them are ONE LADDER and have to be tuned as one: sentence <
# paragraph < heading, and a deeper heading gets less than a shallower one. Both times the
# ladder has been touched, the mistake was moving one rung. Raising the after-gaps first
# (from 700/520/380/300) fixed the first sentence of a section treading on the heading;
# raising the paragraph gap afterwards, on its own, then put a depth-4 section change at
# 520ms UNDER an ordinary paragraph break at 560, which is backwards.
HEADING_GAPS = {1: (1300, 1150), 2: (1100, 1000), 3: (950, 880), 4: (850, 800)}

# Gap after a full stop INSIDE a paragraph. A planned gap normally lives between two units,
# and a paragraph is one unit, so this one is a target for the synthesis stage: it measures
# the pause Kokoro actually left at that boundary and pads it up to this (see
# tts.widen_sentence_gaps). Kokoro's own is roughly 150-250ms before `speed` shortens it,
# which is why sentences ran into one another.
#
# 380 was the first attempt and was still too short by ear, with every boundary confirmed
# placed (148/148 on the Faggioli build) - so the number was the problem, not the mechanism.
SENTENCE_GAP = 520
# A sentence opening on a discourse marker is a turn in the argument. Profile c marked it by
# slowing down, which needed sentence-sized units; marking it with air instead works while
# the paragraph stays a single synthesis call.
MARKER_GAP_BONUS = 140
# The step from sentence to paragraph has to stay audible, so this moves whenever the rung
# below it does. It was 430 when a sentence break was whatever Kokoro rendered.
PARAGRAPH_GAP = 700

PROSE_TYPES = {"paragraph", "box"}


# A dot that ends one of these ends a word, not a sentence. Splitting there put a planned
# 380ms pause inside the sentence - "Keikha et al. [stop] suggest to..." - 68 times in the
# LLM-as-a-judge survey, and split the read-along cue at the same wrong place. `e.g.` and
# `i.e.` are absent on purpose: the slicing step already turns those into words.
#
# A LONE CAPITAL is deliberately not treated as an initial. It would be the right call on a
# reference list, but the slicing step drops those, so what survives into a narration is maths: all
# eight occurrences in the survey were symbols ending a real sentence ("...the final
# evaluation E. From input to output...") and none were an author's initial. Suppressing eight
# real pauses to guard against zero false ones is the wrong trade.
ABBREVIATIONS = ("al", "cf", "vs", "fig", "eq", "tab", "no", "approx", "dr", "mr",
                 "prof", "st", "vol", "pp", "sec", "ref")

# Two fixed-width lookbehinds rather than one consuming group: a closing quote or bracket
# belongs to the sentence it closes, and consuming it would drop it from the cue text.
_BOUNDARY = re.compile(r"(?:(?<=[.!?])|(?<=[.!?][\"')\]]))\s+")


def sentences_of(text):
    """Sentences, with an abbreviation's dot left alone.

    The closing-quote case runs the other way: a sentence ending `..."` or `...)` has its stop
    INSIDE the punctuation, so a plain lookbehind for [.!?] missed those boundaries entirely
    and they kept whatever short gap Kokoro rendered.
    """
    pieces = [p for p in _BOUNDARY.split(text) if p.strip()]
    sentences = []
    for piece in pieces:
        piece = piece.strip()
        if sentences and _ends_in_abbreviation(sentences[-1]):
            sentences[-1] += " " + piece
        else:
            sentences.append(piece)
    return sentences


def _ends_in_abbreviation(sentence):
    if not sentence.endswith("."):
        return False
    words = sentence[:-1].split()
    if not words:
        return False
    # "al" covers "et al." - the check is on the final word only.
    return words[-1].lstrip("([\"'").lower() in ABBREVIATIONS


def ends_a_sentence(text):
    """Does this piece end on a full stop rather than mid-sentence?

    The closing quote or bracket is allowed to sit after the stop, and an abbreviation's dot
    does not count - the same two rules `sentences_of` applies.
    """
    stripped = text.rstrip().rstrip("\"')]")
    return stripped.endswith((".", "!", "?")) and not _ends_in_abbreviation(stripped)


def starts_with_marker(sentence):
    low = sentence.lower()
    return any(low.startswith(m) for m in DISCOURSE_MARKERS)


def plan_sentences(text, jitter, base=SENTENCE_GAP):
    """(sentences, gap_ms per interior boundary) for one synthesis unit.

    An over-long sentence is split on clauses by `split_paragraph`, so a "sentence" here can
    be a clause; that is the right unit for both the pause and the read-along cue anyway.
    """
    sents = sentences_of(text) or [text]
    gaps = [jitter(base + (MARKER_GAP_BONUS if starts_with_marker(s) else 0))
            for s in sents[1:]]
    return sents, gaps


def split_paragraph(text, max_chars=MAX_CHARS):
    """<= max_chars pieces, splitting on sentence then clause then word boundaries."""
    if len(text) <= max_chars:
        return [text]

    pieces, current = [], ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) > max_chars:
            for part in re.split(r"(?<=[,;:])\s+", sentence):
                part = part.strip()
                if not part:
                    continue
                while len(part) > max_chars:
                    cut = part.rfind(" ", 0, max_chars)
                    cut = cut if cut > 0 else max_chars
                    if current:
                        pieces.append(current)
                        current = ""
                    pieces.append(part[:cut].strip())
                    part = part[cut:].strip()
                if len(current) + len(part) + 1 <= max_chars:
                    current = (current + " " + part).strip()
                else:
                    if current:
                        pieces.append(current)
                    current = part
            continue
        if len(current) + len(sentence) + 1 <= max_chars:
            current = (current + " " + sentence).strip()
        else:
            if current:
                pieces.append(current)
            current = sentence
    if current:
        pieces.append(current)
    return pieces


def plan(nodes, profile="b", base_speed=1.15, seed=7, sentence_gap=SENTENCE_GAP):
    """[{text, speed, gap_before, gap_after, node}] for the chosen profile.

    `nodes` are kept structure blocks - already typed and levelled, so nothing here re-derives
    structure. Gaps are expressed before/after and collapsed to a single silence at render
    time, so a long "after" beside a long "before" does not stack into a dead spot.

    `sentence_gap` is the one gap exposed as a flag rather than tuned here, because it is the
    one that is judged by listening to two builds of the same paper back to back.
    """
    rng = random.Random(seed)
    units = []
    index = 0

    def jitter(ms, pct=0.18):
        """A constant gap is audibly mechanical at several hundred repetitions."""
        if profile == "a" or ms <= 0:
            return ms
        return int(ms * (1.0 + rng.uniform(-pct, pct)))

    def emit(text, speed, gap_before=0, gap_after=0, sentences=None, sentence_gaps=None,
             sentence_boundary=False):
        unit = {"text": text, "speed": round(speed, 3), "gap_before": gap_before,
                "gap_after": gap_after, "node": nodes[index]["id"]}
        if sentence_boundary:
            # So the build can count it: a sentence break that falls between two units is not
            # visible to the audio-splice stage, and a stat that ignores it reads as perfect
            # while a fifth of the breaks are wrong.
            unit["sentence_boundary"] = True
        if sentences:
            # Only profile b carries these: it is the only one where a unit holds more than
            # one sentence, so it is the only one that needs the gaps put back afterwards.
            unit["sentences"] = sentences
            unit["sentence_gaps"] = sentence_gaps or []
        units.append(unit)

    for index, node in enumerate(nodes):
        kind = node["type"]
        previous = nodes[index - 1] if index else None
        opens_section = kind in PROSE_TYPES and previous is not None \
            and previous["type"] == "heading"

        if profile == "a":
            for piece in split_paragraph(node["text"]):
                emit(piece, base_speed, gap_after=60)
            units[-1]["gap_after"] = 400 if kind == "heading" else 250
            continue

        if kind == "heading":
            before, after = HEADING_GAPS.get(min(node.get("level") or 1, 4), HEADING_GAPS[4])
            # An announcement: slower, and slower still the higher it sits.
            depth = min(node.get("level") or 1, 4)
            emit(node["text"], base_speed * (0.84 + 0.03 * depth),
                 gap_before=jitter(before, 0.08), gap_after=jitter(after, 0.08))
            continue

        if kind == "epigraph":
            emit(node["text"], base_speed * 0.90,
                 gap_before=jitter(600, 0.1), gap_after=jitter(1000, 0.1))
            continue

        if kind == "formula":
            # Kept only under --keep-formulas, and read as-is: verbalizing notation is a job
            # for the conversion stage, not for prosody.
            emit(node["text"], base_speed * 0.88,
                 gap_before=jitter(400, 0.1), gap_after=jitter(500, 0.1))
            continue

        if profile == "b":
            # A speaker does not hit cruising pace on the first sentence after a heading.
            speed = base_speed * (0.96 if opens_section else 1.0)
            pieces = split_paragraph(node["text"])
            for i, piece in enumerate(pieces):
                last = i == len(pieces) - 1
                sents, sent_gaps = plan_sentences(piece, jitter, sentence_gap)
                boundary = False
                if last:
                    gap = jitter(PARAGRAPH_GAP)
                elif ends_a_sentence(piece):
                    # `split_paragraph` cuts on a sentence boundary whenever it can, so most
                    # unit breaks inside a paragraph ARE sentence breaks and want the same
                    # pause as one inside a unit. Treating them all as forced splits left them
                    # at 45ms: measured in the finished mp3, 26 of 125 boundaries came out
                    # near 80ms while the median was 650, and the build's own count never
                    # showed it because that only covers boundaries INSIDE a unit.
                    gap = jitter(sentence_gap + (MARKER_GAP_BONUS
                                                 if starts_with_marker(pieces[i + 1]) else 0))
                    boundary = True
                else:
                    # A genuine mid-sentence split (an over-long sentence cut on a clause).
                    # Keep it tight so it reads as a breath, not a break.
                    gap = 45
                emit(piece, speed, gap_after=gap, sentences=sents, sentence_gaps=sent_gaps,
                     sentence_boundary=boundary)
            continue

        # profile c: sentence units, rate by role
        sents = sentences_of(node["text"])
        for i, sentence in enumerate(sents):
            last = i == len(sents) - 1
            speed, gap = base_speed, 190
            if starts_with_marker(sentence):
                speed *= 0.95
                if units:
                    units[-1]["gap_after"] = max(units[-1]["gap_after"], jitter(330))
            if len(sentence) > 240:
                speed *= 0.96      # long and nested: give the listener room
            elif len(sentence) < 90:
                speed *= 1.04      # short: let it land crisply
            if last:
                speed *= 0.96      # settle out of the paragraph
                gap = 430
            if opens_section and i == 0:
                speed *= 0.96
            for piece in split_paragraph(sentence):
                emit(piece, speed, gap_after=60)
            units[-1]["gap_after"] = jitter(gap)

    return units
