"""The narration commands, reached through the top-level `inscien` CLI.

    inscien voices                  what the installed weights carry      (diagnostic)
    inscien sample <voices>         one paragraph per voice, to compare   (diagnostic)
    inscien structure <pdf>         what the ingestion stage saw          (diagnostic)
    inscien score <a> <b>           verbatim fidelity + coverage          (diagnostic)

The diagnostics are first-class, not leftovers. Structure decisions are what determine
whether the audio is right, and being able to inspect them without synthesizing hours of
speech is the difference between iterating in seconds and iterating in minutes.
"""

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

from . import anchors, bundle, convert, cues as cues_mod, lexical, score as score_mod, structure
from ..core.paths import narrations_dir
from .prosody import SENTENCE_GAP, plan
from .tts import SPEED_DEFAULT, VOICE_DEFAULT, VOICE_SHORTLIST, get_backend



def _hms(seconds):
    seconds = int(max(0, seconds))
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}h{minutes:02d}m{secs:02d}s" if hours else f"{minutes}m{secs:02d}s"


# --------------------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------------------

def make_bundle(blocks, stats, *, title_fallback, source_pdf=None, meta_source=None, out=None, slug=None,
                voice=None, speed=SPEED_DEFAULT, profile="b", sentence_gap=SENTENCE_GAP, keep_formulas=False,
                acronyms=None, backend="onnx", device="cpu", room_tone=0.0005):
    """Typed blocks (from `structure.analyze` or `structure.analyze_text`) -> a bundle directory.
    Returns (bundle dir, slug)."""
    title = bundle.document_title(blocks, title_fallback)
    slug = slug or bundle.slugify(title)
    print(f"structure  {stats['blocks']} blocks, {stats['kept_words']:,} words kept")
    lexical.apply(blocks, acronyms or lexical.ACRONYMS)
    nodes = convert.passthrough(blocks, keep_formulas=keep_formulas)
    if not nodes:
        raise ValueError("nothing to narrate")

    units = plan(nodes, profile=profile, base_speed=speed, sentence_gap=sentence_gap)
    words = sum(len(n["text"].split()) for n in nodes)
    headings = sum(1 for n in nodes if n["type"] == "heading")
    print(f"narration  {len(nodes)} nodes ({headings} sections), {len(units)} units, {words:,} words")

    out_dir = Path(out or narrations_dir()) / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    # One or more voices, first is primary. Every voice narrates the SAME units, so only the
    # timings differ - which is why each needs its own cue list. No voice means one of the
    # shortlist at random, recorded in meta.json.
    if voice:
        voices = [v.strip() for v in voice.split(",") if v.strip()] or [VOICE_DEFAULT]
    else:
        voices = [random.choice(VOICE_SHORTLIST)]
        print(f"voice      {voices[0]} (random from shortlist; pass --voice to pin one)")
    engine = get_backend(backend, device, voices[0], speed)
    started = time.perf_counter()

    def progress(done, total, audio_s):
        elapsed = time.perf_counter() - started
        rtf = audio_s / elapsed if elapsed > 0 else 0
        eta = (total - done) * (elapsed / done) if done else 0
        sys.stderr.write(f"\r  [{done:>4}/{total}] {done / total * 100:5.1f}%  "
                         f"audio {_hms(audio_s):>9}  RTF {rtf:5.1f}x  ETA {_hms(eta):>8}   ")
        sys.stderr.flush()

    pauses, tracks = {}, []
    for v in voices:
        engine.voice = v
        started = time.perf_counter()
        if len(voices) > 1:
            print(f"voice      {v}")
        duration, spans, sent_spans = bundle.synthesize(
            units, engine, out_dir / bundle.track_audio(v, voices[0]),
            room_level=room_tone, progress=progress, stats=pauses)
        sys.stderr.write("\n")
        tracks.append({"voice": v, "duration": duration, "spans": spans, "sent_spans": sent_spans})
    duration, spans, sent_spans = tracks[0]["duration"], tracks[0]["spans"], tracks[0]["sent_spans"]
    if pauses.get("boundaries"):
        between = sum(1 for u in units if u.get("sentence_boundary"))
        print(f"pauses     {pauses['widened']}/{pauses['boundaries']} boundaries widened "
              f"in-unit, {between} planned between units")

    cue_list = cues_mod.build(nodes, units, spans, sent_spans)
    outline = cues_mod.outline(cue_list)
    for track in tracks:
        track["cues"] = (cue_list if track["voice"] == voices[0]
                         else cues_mod.build(nodes, units, track["spans"], track["sent_spans"]))

    if source_pdf:
        source_pdf = Path(source_pdf)
        anchor_map, pages, anchor_stats = anchors.build(nodes, cue_list, source_pdf)
        images = anchors.render_pages(source_pdf, out_dir / "pages")
        anchors.write(out_dir, anchor_map, pages, images)
        print(f"anchors    {anchor_stats['anchored']}/{anchor_stats['nodes']} nodes and "
              f"{anchor_stats['sentences']}/{anchor_stats['cues']} sentences located in "
              f"{source_pdf.name}, {len(images)} pages rendered")

    for track in tracks[1:]:
        (out_dir / bundle.track_cues(track["voice"], voices[0])).write_text(
            json.dumps(track["cues"]), encoding="utf-8")
    meta = bundle.make_meta(
        slug=slug, title=title, source=meta_source or (source_pdf.name if source_pdf else title_fallback),
        duration_s=duration, words=words, sections=len(outline), voice=voices[0], voices=voices,
        durations=[round(t["duration"], 1) for t in tracks], speed=speed, profile=profile,
        mode="rules", model=None, backend=backend, device=device, sentence_gap=sentence_gap,
        pauses=pauses or None)
    bundle.write(out_dir, meta, structure.to_records(blocks), nodes, cue_list)

    elapsed = time.perf_counter() - started
    size_mb = (out_dir / bundle.AUDIO).stat().st_size / (1 << 20)
    print(f"audio      {_hms(duration)}  ({size_mb:.0f} MB, {duration / elapsed:.0f}x realtime in {_hms(elapsed)})")
    print(f"bundle     {out_dir}")
    return out_dir, slug


# --------------------------------------------------------------------------------------
# sample
# --------------------------------------------------------------------------------------

SAMPLE_TEXT = (
    "Self-evaluation using large language models has proven valuable not only in "
    "benchmarking but also methods like reward modeling and self-refinement. But do LLMs "
    "actually recognize their own outputs when they give those texts higher scores, or is it "
    "just a coincidence? In this paper, we investigate whether self-recognition contributes "
    "to self-preference. We find a correlation of zero point nine zero on that measure."
)


def cmd_sample(args):
    """One paragraph in several voices, so a voice is chosen by ear rather than by grade.

    The alternative is rebuilding a whole paper per candidate, which is 40 minutes of GPU per
    guess. The text is deliberately a real narration paragraph - questions, an acronym, a
    spoken decimal - because a voice that reads a neutral sentence well can still fall apart
    on the shapes this pipeline actually produces.
    """
    text = Path(args.text).read_text(encoding="utf-8") if args.text else SAMPLE_TEXT
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    voices = list(args.voices)
    if args.all:
        voices = installed_voices()
    if not voices:
        sys.exit("name at least one voice, or --all; `inscien voices` lists them")

    # Through the real planner, so a sample carries the pauses the product has. A voice that
    # reads one flat block well can still stumble at the sentence gaps.
    units = plan([{"id": 0, "type": "paragraph", "level": None, "text": text}],
                 profile="b", base_speed=args.speed)
    # One session, reused: loading the ONNX graph costs seconds and the voice is only an
    # embedding looked up per call.
    backend = get_backend(args.backend, args.device, voices[0], args.speed)
    for voice in voices:
        backend.voice = voice
        target = out_dir / f"{voice}.mp3"
        duration, _, _ = bundle.synthesize(units, backend, target)
        print(f"{voice:<12} {_hms(duration):>8}  {target}")
    print(f"\nlisten     {out_dir.resolve()}")


def installed_voices():
    """Every voice the installed weights actually carry - not a list hardcoded here.

    The voice set is a property of `voices-v1.0.bin`, so asking the file is the only answer
    that stays true when the weights are replaced.

    Read straight out of that file rather than through a `Kokoro` object. Constructing one
    builds an ONNX session, and kokoro-onnx builds its own with TensorRT first and without the
    `preload_dlls()` our backend does - so on the GPU machine, merely listing voice NAMES
    died on a missing libnvinfer/libcudnn. Names are in an npz; no model has to load at all.
    """
    import numpy as np

    from .tts import ensure_weights

    _, voices_file = ensure_weights()
    with np.load(str(voices_file)) as data:
        return sorted(data.files)


def cmd_voices(args):
    names = installed_voices()
    # Grouped by the two-letter prefix Kokoro uses: language, then gender.
    groups = {}
    for name in names:
        groups.setdefault(name[:2], []).append(name)
    for prefix, group in groups.items():
        print(f"{prefix}  {' '.join(group)}")
    print(f"\n{len(names)} voices")



# --------------------------------------------------------------------------------------
# diagnostics
# --------------------------------------------------------------------------------------

def cmd_structure(args):
    blocks, stats = structure.analyze(args.pdf)
    print(f"pages {stats['pages']}   blocks {stats['blocks']}   "
          f"body font {stats['body_size']}pt")
    print("heading levels: " + "  ".join(f"L{v}={k}pt" for k, v in stats["levels"].items()))
    print(f"furniture patterns: {len(stats['furniture'])}")
    for key in stats["furniture"][:6]:
        print(f"    {key!r}")
    hyphens = stats["hyphens"]
    print(f"dehyphenated: {sum(hyphens.values())} breaks (joined {hyphens.get('joined', 0)}, "
          f"kept-hyphen {hyphens.get('kept', 0) + hyphens.get('short', 0)}, "
          f"defaulted {hyphens.get('unknown', 0)})")
    print(f"rejoined split sentences: {stats['merged']}")
    print("block types: " + "  ".join(f"{k}={v}" for k, v in stats["types"].items()))
    print(f"kept for narration: {stats['kept_blocks']} blocks, {stats['kept_words']:,} words")
    if stats["review"]:
        print(f"needs a decision: {stats['review']} box blocks")

    if args.outline:
        print("\nOUTLINE")
        for block in blocks:
            if block["type"] == "heading" and not block.get("drop"):
                level = block.get("level", 1)
                print(f"  {'  ' * (level - 1)}[{level}] {block['text'][:88]}")

    if args.show:
        print(f"\nBLOCKS OF TYPE {args.show!r}")
        for block in blocks:
            if block["type"] == args.show:
                flag = " (dropped)" if block.get("drop") else ""
                print(f"\n  p{block['page']} #{block['id']}{flag}")
                print(f"  {block['text'][:300]}")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            for record in structure.to_records(blocks):
                handle.write(json.dumps(record) + "\n")
        print(f"\nwrote {args.output}")


# --------------------------------------------------------------------------------------

def add_commands(subs):
    """Register the narration subcommands on the top-level `inscien` parser."""
    sample = subs.add_parser("sample", help="one paragraph in several voices, to pick by ear")
    sample.add_argument("voices", nargs="*", help="voice names; see `inscien voices`")
    sample.add_argument("--all", action="store_true", help="every voice in the weights")
    sample.add_argument("--text", help="file to read instead of the built-in paragraph")
    sample.add_argument("--out", default="samples", help="where the mp3s go")
    sample.add_argument("--speed", type=float, default=SPEED_DEFAULT)
    sample.add_argument("--backend", choices=("onnx",), default="onnx")
    sample.add_argument("--device", choices=("cuda", "cpu"),
                        default=os.getenv("INSCIEN_TTS_DEVICE") or "cpu")
    sample.set_defaults(func=cmd_sample)

    voices = subs.add_parser("voices", help="list the voices in the installed weights")
    voices.set_defaults(func=cmd_voices)

    struct = subs.add_parser("structure", help="inspect ingestion without synthesizing")
    struct.add_argument("pdf")
    struct.add_argument("-o", "--output", help="write document.jsonl")
    struct.add_argument("--outline", action="store_true")
    struct.add_argument("--show", help="print blocks of this type")
    struct.set_defaults(func=cmd_structure)

    sc = subs.add_parser("score", help="verbatim fidelity + coverage of a conversion")
    sc.add_argument("rest", nargs=argparse.REMAINDER)
    sc.set_defaults(func=lambda a: score_mod.main(a.rest))
