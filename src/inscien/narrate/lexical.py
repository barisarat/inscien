"""Text cleanups that are mechanical, and therefore belong in code rather than in a model.

Citation brackets, acronym expansion and ASCII folding are all deterministic. A model asked
to do them by hand misses some, and the misses are invisible until you hear them. Running
them here also means the conversion stage - whatever drives it - never has to spend attention
on work that a regex does perfectly.

Acronyms are read for the EAR, which is not the same as for the page:

  - Initialisms a TTS engine garbles are replaced by their full name at every occurrence
    ("LLMs" -> "large language models"). Never respelled phonetically - "ell ell em" is worse.
  - Acronyms a speaker says as a WORD (RAG, BLEU, GLUE) and initialisms every engine reads
    correctly (AI, ML, NLP, API) are left exactly as written.
  - Model, dataset and benchmark proper nouns are never touched, including when they contain
    an acronym: `CritiqueLLM` and `LLMEval2` keep their LLM.
  - Numeronyms (`L2R`) are the exception to the paragraph below: they carry a digit where a
    word should be, so no engine can say them and the full name is always right.

Expansion is OFF by default. The narration text arrives from the slicing step, which
already expands the acronyms the paper itself glosses - a second pass here would
re-expand what it deliberately left as an acronym. One paper carrying 575 uses of "LLM"
came out with 1188 long-form mentions and 10 acronyms. `make_bundle(acronyms=...)` opts in
for text that has NOT been through the slicing step.
"""

import re

# Empty on purpose - see the module docstring. Nothing is expanded unless a map
# is passed to `make_bundle`.
ACRONYMS = {}

# The former built-in ML table, kept as a starting point to copy into an
# `acronyms` map for text that has not been through the slicing step. NOT
# applied by default.
ML_ACRONYMS = {
    "LLM-as-a-judge": "large language model as a judge",
    "LLMs-as-judges": "large language models as judges",
    "MLLMs": "multimodal large language models",
    "MLLM": "multimodal large language model",
    "LVLMs": "large vision-language models",
    "LLM-based": "large language model based",
    "LLMs": "large language models",
    "LLM": "large language model",
    "CoT": "chain of thought",
    "RLHF": "reinforcement learning from human feedback",
    "SFT": "supervised fine-tuning",
    "DPO": "direct preference optimization",
    "PPO": "proximal policy optimization",
    "MCTS": "Monte Carlo tree search",
    "ICL": "in-context learning",
}

# Proper nouns that merely contain an acronym's letters and must survive the sweep intact.
PROTECTED = (
    "LLMEval2", "CritiqueLLM", "JudgeLM", "PandaLM", "LLaMA", "LLaVA", "AlpacaEval",
)

_ASCII = {
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-",
    "—": " - ", "…": "...", " ": " ", "−": "-", "ﬁ": "fi",
    "ﬂ": "fl", "×": " times ", "≤": " less than or equal to ",
    "≥": " greater than or equal to ", "≠": " not equal to ",
    "≈": " approximately ", "±": " plus or minus ",
}

# Types whose text is notation, not prose - expanding acronyms inside them turns `P_LLM`
# into "P large language model", which is worse than leaving it alone.
NOTATION_TYPES = {"formula"}


# A bracket may open with a qualifier rather than the number - "[e.g. 13, 15]", "[see 4]" - and
# every pattern here was anchored on a leading digit, so those passed through both this and the
# runner's own rules and were read aloud.
_CITE_LEAD = r"(?:e\.g\.|eg|i\.e\.|c\.?f\.|see\s+also|see|also)[,.]?\s*"


def strip_citations(text):
    """Citation brackets: "[12]", "[34, 56]", "[7-9]", "[e.g. 13, 15]", "[TAB+23]"."""
    text = re.sub(rf"\s*\[\s*(?:{_CITE_LEAD})?\d+(?:\s*[,\u2013-]\s*\d+)*\s*\]", "", text)
    # The author-year form, anchored on the qualifier so a bracket of prose is not at risk.
    text = re.sub(rf"\s*\[\s*{_CITE_LEAD}[^\[\]]{{0,80}}(?:19|20)\d{{2}}[a-z]?\s*\]", "", text)
    # The alpha bibliography style: initials then a two-digit year, which leaves prompt-template
    # brackets like "[All Fields]" alone.
    text = re.sub(r"\s*\[[A-Z][A-Za-z]{0,4}\+?\d{2}(?:\s*[,;]\s*[A-Z][A-Za-z]{0,4}\+?\d{2})*\]", "", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()


DIGITS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")

CURRENCIES = ((r"USD\s*", " US dollars"), (r"\$\s*", " dollars"), (r"EUR\s*", " euros"),
              (r"GBP\s*", " pounds"))


TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
TEENS = ("ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
         "seventeen", "eighteen", "nineteen")


def words_for(number):
    """"0" -> "zero", "12" -> "twelve", "2021" -> "2021".

    Only the small integers that appear in front of a decimal point. Leaving even the "0" as
    a digit was not enough: "0 point nine zero" still put a numeral next to a period and the
    engine still treated it as an abbreviation ending a sentence. Spelling the whole thing
    hands it no digit to interpret. Anything big stays a numeral, where the engine's own
    number reading is better than a hand-rolled one.
    """
    value = int(number)
    if value >= 100:
        return number
    if value < 10:
        return DIGITS[value]
    if value < 20:
        return TEENS[value - 10]
    tens, unit = divmod(value, 10)
    return TENS[tens] + ("-" + DIGITS[unit] if unit else "")


# Acronyms a speaker says as a WORD. Kokoro spells any all-caps token letter by letter, so
# "RAG" came out as "ar ey gee" - the acronym policy assumed an engine would know the
# difference and it does not. Title case is the whole fix: a mixed-case token is read as a
# word. It costs the reader pane seeing "Rag" instead of "RAG", which is the cheaper loss.
# Written form -> the spelling the engine reads correctly. Usually just title case, which is
# enough to stop it spelling an all-caps token letter by letter.
#
# The two model names need more than that (SPOKEN_AS_WORD_PATTERNS below). Title-casing
# "LLaMA" to "Llama" left the double L and it came out "ell-ama"; the English word is
# pronounced exactly like "lama", so that is what it is handed. Same for LLaVA. The reader
# pane then shows "Lama-13B" where the paper says "LLaMA-13B" - a real cost, paid because
# the alternative is hearing it wrong every time.
SPOKEN_AS_WORD = {
    "RAG": "Rag", "BLEU": "Bleu", "ROUGE": "Rouge", "GLUE": "Glue", "BERT": "Bert",
    "EMBER": "Ember", "SQuAD": "Squad", "MAUVE": "Mauve",
    "COMET": "Comet", "GEM": "Gem",
}

# The two model names are matched by PATTERN, not by exact token, because papers attach a
# version to them without a separator ("LLaMA3-instruct-8B", "LLaMa2-7b-ins", "LLAMA 3.2")
# and spell the inner letters however they like. The exact-token rule above requires a
# non-alphanumeric on both sides, so "LLaMA3" slipped through and was voiced "ell-ama three".
# The digit is allowed to follow; a letter is not,
# so "LLaMAgic" would stay whatever it is.
SPOKEN_AS_WORD_PATTERNS = [
    (re.compile(r"(?<![A-Za-z0-9])L[Ll][Aa][Mm][Aa](?![A-Za-z])"), "Lama"),
    (re.compile(r"(?<![A-Za-z0-9])L[Ll][Aa][Vv][Aa](?![A-Za-z])"), "Lava"),
    # UMBRELA is said as the word "umbrella", which is not what one L spells: title case
    # alone gave "um-BRAY-la". It is handed the English word, the same
    # trade as Lama above - the reader pane shows "Umbrella" where the paper says "UMBRELA".
    # A pattern rather than a table entry because papers case it three ways ("UMBRELA",
    # "UMbrela", "Umbrela") and the exact-token rule would only catch one.
    (re.compile(r"(?<![A-Za-z0-9])[Uu][Mm][Bb][Rr][Ee][Ll][Aa](?![A-Za-z])"), "Umbrella"),
    # "LoRA" is said as the word "lora"; the mixed
    # case is what stops the all-caps rule from catching it.
    (re.compile(r"(?<![A-Za-z0-9])LoRA(?![A-Za-z])"), "Lora"),
]

# Model names whose lowercase tail is an INITIALISM, not a word. Kokoro reads a lowercase
# token as a word, so "gpt-oss" came out as "oss" rhyming with "loss" where
# the name is said "G P T O S S". Upper-casing the tail is the whole fix - the same lever the
# table above uses in the other direction - and it is per-name rather than a blanket rule,
# because most lowercase tails ARE words ("-turbo", "-instruct", "-mini"). A size suffix may
# follow ("gpt-oss-20b"), so the name itself is rewritten and the suffix left alone.
SPELLED_OUT_PATTERNS = [
    (re.compile(r"(?<![A-Za-z0-9])[Gg][Pp][Tt]-[Oo][Ss][Ss](?![A-Za-z])"), "GPT-OSS"),
]


# Numeronyms: an initialism with a digit standing in for a word ("L2R" for learning to rank).
# Neither lever above reaches them - the engine says "ell two arr", and title case cannot help
# because the digit is not a letter - so the only reading is the full name. That makes them the
# one expansion this module does by DEFAULT, where the ACRONYMS map stays empty and opt-in: an
# acronym is a judgement the slicing step makes per paper, a numeronym is unsayable by
# construction. Spelled out at every occurrence, so "L2R reranking" is "learning to rank
# reranking" - the redundancy is the paper's, and it is better than a letter salad.
NUMERONYMS = [
    (re.compile(r"(?<![A-Za-z0-9])L2R(?![A-Za-z0-9])"), "learning to rank"),
]


def say_numeronyms(text):
    """"L2R" -> "learning to rank", and the gloss that introduced it dropped.

    A paper writes the full name once with the numeronym in brackets after it. Expanding
    inside the brackets makes the sentence say the same four words twice, which is the one
    place this rewrite is audible as a mistake, so the gloss goes.
    """
    for pattern, spoken in NUMERONYMS:
        text = re.sub(rf"({re.escape(spoken)})\s*\({pattern.pattern}\)", r"\1", text,
                      flags=re.IGNORECASE)
        text = pattern.sub(spoken, text)
    return text


# A section reference in running prose. The number needs the same treatment the heading
# announcements already give it ("Section three point four"), and for the same reason a
# decimal did: "Section 3.4." hands the engine a numeral against a period. The prefix is what
# separates this from a decimal - a section number is spoken part by part ("three point ten")
# where a decimal is spoken digit by digit ("point one zero").
SECTION_REF = re.compile(
    r"\b(Sections?|Appendix|Appendices|Figures?|Tables?|Algorithms?|Equations?)\s+"
    r"(\d+(?:\.\d+)+)")


def say_as_word(text):
    """"RAG" -> "Rag", so the engine says it instead of spelling it - and "gpt-oss" -> "GPT-OSS",
    so it spells one it was saying as a word."""
    for acronym, spoken in SPOKEN_AS_WORD.items():
        text = re.sub(rf"(?<![A-Za-z0-9]){re.escape(acronym)}(?![A-Za-z0-9])", spoken, text)
    for pattern, spoken in SPOKEN_AS_WORD_PATTERNS:
        text = pattern.sub(spoken, text)
    for pattern, spelled in SPELLED_OUT_PATTERNS:
        text = pattern.sub(spelled, text)
    return text


def say_section_refs(text):
    """"as shown in Section 3.4" -> "as shown in Section three point four"."""
    return SECTION_REF.sub(
        lambda m: m.group(1) + " " + " point ".join(words_for(p) for p in m.group(2).split(".")),
        text)


def drop_plural_possessive(text):
    """"the LLMs' ordering" -> "the LLMs ordering".

    A plural possessive is silent: "LLMs" and "LLMs'" are homophones, as are "others" and
    "others'". The apostrophe therefore carries nothing for the ear, and it does carry
    something for the engine - "LLMs'" came out spelled as separate letters. Dropping it is
    the rare case where deleting a character loses no information at all.

    The singular "'s" is left alone: that one is pronounced.
    """
    return re.sub(r"(?<=[A-Za-z])s'(?![A-Za-z])", "s", text)


def say_et_al(text):
    """"Zhang et al. propose" -> "Zhang and colleagues propose".

    The dot is the problem. Kokoro reads "al." as the end of a sentence - falling intonation
    and a stop - in the middle of the sentence, 80 times in one survey. Not splitting there
    (see prosody.ABBREVIATIONS) stops US adding a pause on top, but nothing at the audio stage
    can undo the intonation, because by then the model has already decided the sentence ended.
    The only fix is to not hand it the dot.
    """
    return re.sub(r"\bet\s+al\.?", "and colleagues", text)


def say_vs(text):
    """"recall vs. precision" -> "recall versus precision".

    Same dot problem as "et al.", one word later: "vs." was voiced "vee-ess" and the period
    ended the sentence. The slicing step already writes "versus" in
    prose, but a heading is verbatim by contract, so this is the
    stage that has to say it. Word-bounded so "vs" inside an identifier is left alone.
    """
    return re.sub(r"(?<![A-Za-z0-9_])vs\.?(?![A-Za-z0-9_])", "versus", text)


def say_numbers(text):
    """Currency before its amount, and decimals as a spoken point.

    "USD 111" is read as two unrelated tokens; a person says "111 US dollars". And "0.90" is
    a full stop as far as the engine's sentence logic is concerned - "a tau of 0." then a new
    sentence starting "90 for mean". The fractional digits are spoken one by one because
    "point ninety" is not what the number means.
    """
    for pattern, spoken in CURRENCIES:
        text = re.sub(pattern + r"(\d[\d,]*(?:\.\d+)?)", r"\1" + spoken, text)

    def spell(match):
        whole, frac = match.group(1), match.group(2)
        return words_for(whole) + " point " + " ".join(DIGITS[int(d)] for d in frac)

    # The comma in the lookbehind leaves "1,000.50" alone rather than reading the group after
    # the separator as its own number ("000 point five zero"). The lookahead allows a
    # SENTENCE-ending period after the number - "an agreement of 0.90." was the common case
    # and the old `(?![\w.])` refused it - while still refusing a second dotted group, so a
    # bare "3.4.1" is left whole rather than half-spoken.
    return re.sub(r"(?<![\w.,])(\d+)\.(\d+)(?!\w)(?!\.\d)", spell, text)


def expand_acronyms(text, mapping=ACRONYMS, protected=PROTECTED):
    """Longest-first, case-sensitive, boundary-guarded expansion.

    Proper names are masked out first so a name that merely contains the letters survives.
    """
    holes = {}
    for i, name in enumerate(protected):
        if name in text:
            token = f"\x00{i}\x00"
            holes[token] = name
            text = text.replace(name, token)

    for acronym in sorted(mapping, key=len, reverse=True):
        text = re.sub(rf"(?<![A-Za-z0-9]){re.escape(acronym)}(?![A-Za-z0-9])",
                      mapping[acronym], text)

    # Expansion forces two rewrites. The paper's own gloss becomes a stutter - "large language
    # models (large language models)" - and a "<full name>, or <acronym>" first mention becomes
    # an echo. Both are consequences of the substitution, not edits to the prose.
    text = re.sub(r"\s*\((large language models?|multimodal large language models?)\)", "", text)
    text = re.sub(r"(large language models?),?\s+or\s+\1", r"\1", text, flags=re.I)

    for token, name in holes.items():
        text = text.replace(token, name)
    return text


def to_ascii(text):
    """Fold to plain ASCII. Kokoro voices stray glyphs as noise or skips them silently."""
    for bad, good in _ASCII.items():
        text = text.replace(bad, good)
    return text.encode("ascii", "ignore").decode("ascii")


def clean_block(text):
    """Everything except acronyms - safe for notation as well as prose."""
    text = to_ascii(strip_citations(text))
    return say_numeronyms(say_as_word(say_vs(say_et_al(drop_plural_possessive(text)))))


def apply(blocks, mapping=ACRONYMS, protected=PROTECTED):
    """Clean every block in place. Notation blocks are cleaned but never acronym-expanded."""
    for block in blocks:
        text = clean_block(block["text"])
        if block.get("type") not in NOTATION_TYPES:
            text = expand_acronyms(text, mapping, protected)
        # NOT on a heading: `convert.spoken_heading` strips the leading number by matching
        # `block["number"]` against the text, and a "2.3" rewritten to "2 point three" no
        # longer matches - the heading comes out as "Section two point three. 2 point three
        # Fully Automated Test Collections."
        if block.get("type") != "heading":
            # Section references first: they win the dotted number, and once spelled the
            # decimal rule below cannot touch them.
            text = say_numbers(say_section_refs(text))
        block["text"] = re.sub(r"\s{2,}", " ", text).strip()
    return blocks
