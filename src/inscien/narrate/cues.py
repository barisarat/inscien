"""Per-unit synthesis timings -> sentence-level read-along cues.

Profile `b` synthesizes a whole paragraph in one call, so unit timings are paragraph-level.
Sentence times come from the pause-widening pass, which locates each sentence boundary in the
rendered audio (see tts.widen_sentence_gaps) - those are measured, not estimated, and using
them is not optional any more: that pass INSERTS silence, so character-share interpolation
over the whole paragraph would now drift by the amount inserted and never snap back.

The old interpolation survives as the fallback, for a boundary that could not be located and
for anything without sentence spans (headings, profiles `a` and `c`).
"""

from .prosody import sentences_of


def build(nodes, units, spans, sent_spans=None):
    """[{node, type, level, sent, text, start, end}] in document order.

    `spans` maps a unit's index to its (start, end) in the finished audio; `sent_spans` maps
    it to one (start, end) per sentence of that unit, where the plan asked for sentence gaps.
    """
    sent_spans = sent_spans or {}
    by_node = {}
    measured = {}
    units_of_node, measured_units = {}, {}
    for i, unit in enumerate(units):
        node_id = unit["node"]
        units_of_node[node_id] = units_of_node.get(node_id, 0) + 1
        if i not in spans:
            continue
        start, end = spans[i]
        previous = by_node.get(node_id)
        by_node[node_id] = ((start, end) if previous is None
                            else (min(previous[0], start), max(previous[1], end)))
        if i in sent_spans:
            measured.setdefault(node_id, []).extend(
                zip(unit["sentences"], sent_spans[i]))
            measured_units[node_id] = measured_units.get(node_id, 0) + 1

    cues = []
    for node in nodes:
        if node["id"] not in by_node:
            continue
        # Measured sentences are used only when EVERY unit of the node produced them, so a
        # paragraph is never half measured and half interpolated against different clocks.
        exact = measured.get(node["id"])
        if node["type"] != "heading" and exact \
                and measured_units.get(node["id"]) == units_of_node[node["id"]]:
            for sent_index, (sentence, (start, end)) in enumerate(exact):
                cues.append({
                    "node": node["id"],
                    "type": node["type"],
                    "level": node.get("level"),
                    "sent": sent_index,
                    "text": sentence,
                    "display": sentence,
                    "start": round(start, 3),
                    "end": round(end, 3),
                })
            continue
        node_start, node_end = by_node[node["id"]]
        duration = max(node_end - node_start, 0.001)
        # A heading is ONE display unit, however many sentences it is spoken as. Splitting it
        # emits a cue per spoken sentence, and since every one of them displays the same
        # node["display"], the page renders the heading once per sentence: "Section one.
        # Introduction." showed as "1 INTRODUCTION 1 INTRODUCTION", and the extra span put the
        # follow-along a step out of register with the audio.
        if node["type"] == "heading":
            sents = [node["text"]]
        else:
            sents = sentences_of(node["text"]) or [node["text"]]
        total = sum(len(s) for s in sents) or 1
        cursor = node_start
        for sent_index, sentence in enumerate(sents):
            last = sent_index == len(sents) - 1
            end = node_end if last else cursor + duration * len(sentence) / total
            # A heading is spoken as "Section. Introduction." but should read as
            # "INTRODUCTION" on the page - the ear and the eye want different things.
            display = node["display"] if node["type"] == "heading" else sentence
            cues.append({
                "node": node["id"],
                "type": node["type"],
                "level": node.get("level"),
                "sent": sent_index,
                "text": sentence,
                "display": display,
                "start": round(cursor, 3),
                "end": round(end, 3),
            })
            cursor = end
    return cues


def outline(cues):
    """Heading cues only - the table of contents, with the time to seek to."""
    return [{"text": c["display"], "level": c["level"] or 1, "start": c["start"],
             "cue": i}
            for i, c in enumerate(cues) if c["type"] == "heading" and c["sent"] == 0]
