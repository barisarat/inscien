#!/usr/bin/env python3
"""Grade a narration candidate against the source it was converted from.

The verbatim contract has exactly two independent failure modes, and a single score hides
both, so they are measured separately:

  FIDELITY  of the text that survived, how much is the author's own words? A model told to
            keep prose verbatim will paraphrase anyway - this catches that.
  COVERAGE  how much of the source survived at all? A summarizer scores perfect fidelity on
            the three paragraphs it kept. Fidelity alone cannot see that.

A pass needs both to be high. Claude's own output on the full paper retained 75% of the
source characters, which is a useful reference point: table-heavy sections legitimately
shrink a lot, so coverage well under 100% is expected, not a failure by itself.

  python score.py source.txt candidate.txt
  python score.py source.txt candidate.txt --reference claude-slice.txt --worst 10
"""

import argparse
import difflib
import re
import sys
from collections import defaultdict
from pathlib import Path

NGRAM = 5
WORD = re.compile(r"[a-z0-9]+")


def words_of(text):
    return WORD.findall(text.lower())


def sentences_of(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n\s*\n", text) if s.strip()]


class SourceIndex:
    """N-gram positional index so each candidate sentence can be located in the source
    without an O(source x candidate) scan."""

    def __init__(self, text):
        self.words = words_of(text)
        self.index = defaultdict(list)
        for i in range(len(self.words) - NGRAM + 1):
            self.index[tuple(self.words[i:i + NGRAM])].append(i)

    def best_match(self, cand_words):
        """(ratio, start, end) of the best-aligned source window, or (0.0, -1, -1)."""
        n = len(cand_words)
        if n == 0:
            return 0.0, -1, -1

        size = min(NGRAM, n)
        starts = set()
        for i in range(0, max(1, n - size + 1)):
            gram = tuple(cand_words[i:i + size])
            if size == NGRAM:
                for pos in self.index.get(gram, ()):
                    # Anchor: if candidate word i matched source word pos, the sentence
                    # plausibly starts at pos - i.
                    starts.add(max(0, pos - i))
            else:
                # Short sentence: fall back to a scan for its first word.
                for pos, word in enumerate(self.words):
                    if word == cand_words[0]:
                        starts.add(pos)

        if not starts:
            return 0.0, -1, -1

        best = (0.0, -1, -1)
        for start in list(starts)[:400]:  # bounded: a common opening can anchor everywhere
            end = min(len(self.words), start + n + 6)
            window = self.words[start:end]
            # Containment, not similarity: what fraction of the candidate sentence appears
            # in order in the source. A symmetric ratio would penalise the deliberate window
            # padding and cap a perfect verbatim copy well below 1.0.
            matched = sum(block.size for block in
                          difflib.SequenceMatcher(None, cand_words, window,
                                                  autojunk=False).get_matching_blocks())
            ratio = matched / len(cand_words)
            if ratio > best[0]:
                best = (ratio, start, end)
        return best


def artifact_report(text):
    return {
        "citation brackets": len(re.findall(r"\[\s*\d+(\s*[,-]\s*\d+)*\s*\]", text)),
        "table/figure refs": len(re.findall(r"\b(Table|Fig(ure)?\.?)\s*\d+", text)),
        "page markers": len(re.findall(r"=====\s*PAGE", text)),
        "markdown marks": len(re.findall(r"(\*\*|^#{1,6}\s|^\s*[-*+]\s)", text, re.M)),
        "non-ascii chars": sum(1 for ch in text if ord(ch) > 127),
        "urls": len(re.findall(r"https?://", text)),
        "spoken headings": len(re.findall(r"(?m)^Section[.\s]", text)),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Grade narration fidelity + coverage.")
    ap.add_argument("source")
    ap.add_argument("candidate")
    ap.add_argument("--reference", help="a known-good conversion, for a retention comparison")
    ap.add_argument("--worst", type=int, default=6, help="worst-scoring sentences to print")
    args = ap.parse_args(argv)

    source_text = Path(args.source).read_text(encoding="utf-8", errors="replace")
    cand_text = Path(args.candidate).read_text(encoding="utf-8", errors="replace")
    if not cand_text.strip():
        sys.exit("candidate is empty")

    index = SourceIndex(source_text)
    sents = sentences_of(cand_text)

    buckets = {"verbatim": 0, "near": 0, "edited": 0, "rewritten": 0}
    scored = []
    covered = set()
    for sentence in sents:
        cand_words = words_of(sentence)
        if not cand_words:
            continue
        ratio, start, end = index.best_match(cand_words)
        scored.append((ratio, sentence, start, end))
        if ratio >= 0.95:
            buckets["verbatim"] += 1
        elif ratio >= 0.85:
            buckets["near"] += 1
        elif ratio >= 0.60:
            buckets["edited"] += 1
        else:
            buckets["rewritten"] += 1
        # Only count a span as covered if the match was good enough to be that source text.
        if ratio >= 0.60 and start >= 0:
            covered.update(range(start, min(end, len(index.words))))

    total = len(scored) or 1
    source_words = len(index.words) or 1
    cand_words_total = len(words_of(cand_text))

    print(f"source    : {source_words:,} words")
    print(f"candidate : {cand_words_total:,} words   ({cand_words_total / source_words:.0%} of source)")
    print(f"sentences : {total}")
    print()
    print("FIDELITY - is the surviving text the author's own words?")
    for name, count in buckets.items():
        bar = "#" * int(40 * count / total)
        print(f"  {name:<10} {count:>4}  {count / total:>5.0%}  {bar}")
    faithful = (buckets["verbatim"] + buckets["near"]) / total
    print(f"  verbatim or near-verbatim: {faithful:.0%}")
    print()
    print("COVERAGE - how much of the source survived?")
    print(f"  source words matched: {len(covered):,} / {source_words:,}  "
          f"({len(covered) / source_words:.0%})")
    print()
    print("ARTIFACTS - these should all be 0 except spoken headings")
    for name, count in artifact_report(cand_text).items():
        flag = "" if (count == 0 or name == "spoken headings") else "  <-- FAIL"
        print(f"  {name:<20} {count}{flag}")

    if args.reference:
        ref = Path(args.reference).read_text(encoding="utf-8", errors="replace")
        ref_words = len(words_of(ref))
        print()
        print(f"REFERENCE : {ref_words:,} words ({ref_words / source_words:.0%} of source)")
        print(f"  candidate is {cand_words_total / max(ref_words, 1):.0%} the length of the reference")

    if args.worst:
        print()
        print(f"WORST {args.worst} SENTENCES (lowest fidelity - read these, the number alone lies)")
        for ratio, sentence, start, end in sorted(scored, key=lambda s: s[0])[: args.worst]:
            print(f"\n  ratio {ratio:.2f}")
            print(f"  cand: {sentence[:220]}")
            if start >= 0:
                print(f"  src : {' '.join(index.words[start:end])[:220]}")
            else:
                print("  src : (no anchor found - invented, or heavily rewritten)")


if __name__ == "__main__":
    main()
