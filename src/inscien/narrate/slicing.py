"""The slice step: a paper's planned line ranges -> narration text, by rule, no model.

Input is a work directory holding `paper-raw.txt` (the paper's text, one line per text line) and
`plan.json` (written by `planning.plan_paper`): which line ranges to skip and why, the headings,
lead-ins, paragraph starts, acronym expansions and the slices themselves. Output is one text file
per slice in `<work>/narration/`, ready for `narration_text`.

The rules narrator joins a slice's kept lines into paragraphs from the plan's layout facts, then
one post-processing pass speaks symbols, drops citations and pointer sentences, places headings
and lead-ins by aligning them with the raw text, reads dashes by role and leaves plain ASCII.
The contract: the author's sentences stay verbatim; only skipping, joining, extraction fixes and
spoken forms of symbols are allowed. An acronym is expanded only where the paper glosses it.
"""

import json
import unicodedata
from pathlib import Path

from inscien.narrate import jsre as R

GREEK_CAP = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu",
             "Xi", "Omicron", "Pi", "Rho", "Theta", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"]
GREEK_LOW = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu",
             "xi", "omicron", "pi", "rho", "sigma", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"]
GREEK_EXTRA = ["partial", "epsilon", "theta", "kappa", "phi", "rho", "pi"]

DEFAULT_SYMBOLS = {
    "\u03c4standard": "tau standard", "\u03c4\u2206": "tau delta", "\u03c4\u0394": "tau delta",
    "\u03c0ref": "pi ref", "\u03c0judge": "pi judge", "\u03c0test": "pi test",
    "\u03c4": "tau", "\u2206": "delta", "\u0394": "delta", "\u03b4": "delta", "\u03c0": "pi", "\u03a0": "Pi",
    "\u03b1": "alpha", "\u03b2": "beta", "\u03ba": "kappa", "\u03c1": "rho", "\u03c3": "sigma", "\u03bc": "mu", "\u03bb": "lambda",
    "\u2208": " in ", "\u2209": " not in ", "\u2229": " intersected with ", "\u222a": " united with ",
    "\u2264": " at most ", "\u2265": " at least ", "\u226a": " is much less than ", "\u226b": " is much greater than ",
    "\u227a": " is ranked below ", "\u227b": " is ranked above ",
    "\u2192": " to ", "\u2190": " from ", "\u223c": " drawn from ", "\u2248": " approximately ", "\u2260": " is not equal to ",
    "\u00d7": " times ", "\u00b7": " times ", "\u22c5": " times ", "\u2211": " the sum over ", "\u221a": " the square root of ",
    "\u00b1": " plus or minus ", "\u2212": "-", "\u221e": " infinity ", "\u221d": " proportional to ", "\u2245": " approximately ",
    "\u2243": " approximately ",
    "\u2713": " yes ", "\u2714": " yes ", "\u2717": " no ", "\u2718": " no ", "\u00b0": " degrees ", "\u2030": " per mille ",
    "\u21a6": " maps to ", "\u21d2": " implies ", "\u21d4": " if and only if ", "\u2200": " for all ", "\u2203": " there exists ",
    "\u211d": " the real numbers ", "\u2115": " the natural numbers ", "\u2124": " the integers ", "\u2205": " the empty set ",
    "\u2032": " prime", "\u2217": "", "\u2026": "...", "\u2013": "-", "\u2014": " - ",
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\ufb01": "fi", "\ufb02": "fl", "\u00a0": " ",
}

ORD = {"i": "First", "ii": "Second", "iii": "Third", "iv": "Fourth", "v": "Fifth", "vi": "Sixth",
       "1": "First", "2": "Second", "3": "Third", "4": "Fourth", "5": "Fifth", "6": "Sixth"}

KEEP_HYPHEN = (r"(?:^|[\s(])(?:self|non|pre|post|well|cross|multi|semi|co|anti|inter|intra|meta|sub|pseudo|quasi"
               r"|state-of-the|fine|zero|few|one|two|three|open|closed|human|LLM|end-to|off|on|in|out)-$")
CITE_LEAD = r"(?:e\.g\.|eg|i\.e\.|c\.?f\.|see\s+also|see|also)[,.]?\s*"
DOTTED = {"U.S.A.": "United States of America", "U.S.": "United States", "U.K.": "United Kingdom",
          "E.U.": "European Union", "U.N.": "United Nations"}
LATEX = {"tau": "tau", "delta": "delta", "Delta": "delta", "pi": "pi", "Pi": "the set of systems", "alpha": "alpha",
         "beta": "beta", "kappa": "kappa", "rho": "rho", "sigma": "sigma", "mu": "mu", "lambda": "lambda", "in": "in",
         "leq": "at most", "geq": "at least", "sim": "from", "times": "times", "cdot": "times", "ldots": "...", "dots": "..."}
ASCII_MAP = {"\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " "}


def _utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _norm(s: str) -> str:
    return R.sub(r"\s+", " ", R.sub(r"[^a-z0-9 ]+", " ", s.lower())).strip()


def heading_key(h: str) -> str:
    return R.sub(r"[^a-z0-9]+", " ", h.lower()).strip()


def _math_greek(m) -> str:
    ch = m.group(0)
    cp = ord(ch)
    # Latin and digit styles of the same block
    if 0x1D400 <= cp <= 0x1D6A3:
        r = (cp - 0x1D400) % 52
        return chr(65 + r) if r < 26 else chr(97 + r - 26)
    if 0x1D7CE <= cp <= 0x1D7FF:
        return str((cp - 0x1D7CE) % 10)
    if cp < 0x1D6A8 or cp > 0x1D7CB:
        return ch
    rel = (cp - 0x1D6A8) % 58
    if rel < 25:
        return " " + GREEK_CAP[rel] + " "
    if rel == 25:
        return " nabla "
    if rel < 51:
        return " " + GREEK_LOW[rel - 26] + " "
    return " " + GREEK_EXTRA[rel - 51] + " "


class Narrator:
    def __init__(self, work: Path, log=print):
        self.work = Path(work)
        self.log = log
        self.plan = json.loads((self.work / "plan.json").read_text(encoding="utf-8"))
        self.raw_all = (self.work / "paper-raw.txt").read_text(encoding="utf-8").split("\n")
        plan = self.plan
        drop = [R.js(p) for p in plan.get("drop") or []]
        self.skipped, self.cut_reason = set(), {}
        for rng in plan.get("skip") or []:
            a, b = rng[0], rng[1]
            why = rng[2] if len(rng) > 2 else None
            for i in range(a, b + 1):
                self.skipped.add(i)
                if why:
                    self.cut_reason[i] = why
        self.symbols = {**DEFAULT_SYMBOLS, **(plan.get("symbols") or {})}
        self.symbols.setdefault("\u2022", " ")
        self.symbol_keys = sorted(self.symbols, key=lambda k: -_utf16_len(k))
        self.raw_lines = ["" if (i + 1) in self.skipped or any(d.search(l) for d in drop) else self.say(l)
                          for i, l in enumerate(self.raw_all)]
        self.expand = sorted((plan.get("expand") or {}).items(), key=lambda kv: -_utf16_len(kv[0]))
        self.headings = {heading_key(h): h for h in plan.get("headings") or []}
        # The paper's own usage is the dictionary for line-end hyphens.
        self.compounds = set()
        for l in self.raw_all:
            for m in R.js(r"([A-Za-z]+)-([A-Za-z]+)(?=[^A-Za-z-]|$)").finditer(l):
                if m.end() < len(l):
                    self.compounds.add((m[1] + "-" + m[2]).lower())
        # Neither half of a BREAK counts as evidence for itself ("selec-" / "tively").
        self.words = set()
        for i, l in enumerate(self.raw_all):
            text = R.sub(r"[A-Za-z]+-$", "", l, "")
            prev = self.raw_all[i - 1] if i > 0 else ""
            if R.test(r"[A-Za-z]-$", prev):
                text = R.sub(r"^\s*[A-Za-z]+", "", text, "")
            for w in R.findall(r"[A-Za-z]{3,}", text):
                self.words.add(w.lower())

    # --- symbols --------------------------------------------------------------------------

    def say(self, line: str) -> str:
        line = R.sub(r"[\U0001D400-\U0001D7FF]", _math_greek, line)
        # The tilde is "approximately" before a number, "drawn from" before a distribution.
        line = R.sub(r"[\u223c~]\s*(?=\d)", " approximately ", line)
        line = R.sub(r"[\u223c~]\s*(?=[A-Z])", " drawn from ", line)
        # Set notation in running prose: "|D|" is the size of D; braces are silent.
        line = R.sub(r"\|\s*([A-Za-z][A-Za-z0-9 ]{0,4}?)\s*\|", " the size of $1 ", line)

        def braced(m):
            inner = m.group(1)
            parts = [p for p in R.split(r"\s*,\s*", inner) if p]
            if len(parts) < 2:
                return " " + inner + " "
            return " the set of " + ", ".join(parts[:-1]) + ", and " + parts[-1] + " "
        line = R.sub(r"\{([^{}]{1,80})\}", braced, line)
        line = R.sub(r"[{}]", " ", line)
        for k in self.symbol_keys:
            line = line.replace(k, self.symbols[k])
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*>\s*=\s*(?=[A-Za-z0-9(\[])", " is at least ", line)
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*<\s*=\s*(?=[A-Za-z0-9(\[])", " is at most ", line)
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*>>\s*(?=[A-Za-z0-9(\[])", " is much greater than ", line)
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*<\s*(?=[A-Za-z0-9(\[])", " is less than ", line)
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*>\s*(?=[A-Za-z0-9(\[])", " is greater than ", line)
        line = R.sub(r"(?<=[A-Za-z0-9)\]])\s*=\s*(?=[A-Za-z0-9(\[])", " equals ", line)
        return R.sub(r"[ \t]{2,}", " ", line)

    def _spoken_heading(self, h: str) -> str:
        return "## " + R.sub(r"\s+", " ", self.say(h)).strip()

    def content_cut(self, a: int, b: int) -> bool:
        """A cut that removed CONTENT ends the sentence that ran into it; a cut that removed page
        furniture is transparent. Without a recorded reason, every cut counts as content."""
        for i in range(a, b + 1):
            why = self.cut_reason.get(i)
            if not why or R.test(r"formula|table|figure|caption|equation|front matter|heading", why):
                return True
        return False

    # --- the rules narrator ---------------------------------------------------------------

    def keep_hyphen(self, a: str, b: str) -> bool:
        tail_m, head_m = R.match(r"([A-Za-z]+)-$", a), R.match(r"^([A-Za-z]+)", b)
        tail, head = (tail_m[1] if tail_m else None), (head_m[1] if head_m else None)
        if R.test(KEEP_HYPHEN, a, "i"):
            return True
        if not tail or not head:
            return False
        # an acronym or model name before the hyphen, or a compound suffix after it
        if R.test(r"[A-Z]", tail[1:]):
            return True
        if R.test(r"^(?:based|aware|specific|level|free|driven|oriented|related|dependent|independent|wise|like|style"
                  r"|centric|agnostic|only|scale|shot|tuned|tuning)$", head, "i"):
            return True
        # a function word after the hyphen ("state-" / "of-the-art") is a compound
        if R.test(r"^(?:of|the|to|in|on|by|and|a|an)$", head, "i"):
            return True
        t, h = tail.lower(), head.lower()
        if t + h in self.words:
            return False
        if t + "-" + h in self.compounds:
            return True
        return len(t) >= 5 and len(h) >= 5 and t in self.words and h in self.words

    def narrate_by_rules(self, sl: dict) -> str:
        starts = set(self.plan.get("paragraphs") or [])
        lead_keys = {_norm(self.say(l)) for l in self.plan.get("leadins") or []}
        paras, cur, prev_n = [], "", 0

        def end():
            nonlocal cur
            if cur.strip():
                paras.append(cur.strip())
            cur = ""

        for n in range(sl["from"], sl["to"] + 1):
            line = (self.raw_lines[n - 1] if 0 <= n - 1 < len(self.raw_lines) else "").strip()
            if not line:
                continue
            if cur:
                boundary = n in starts or _norm(line) in lead_keys or _norm(cur) in lead_keys
                if R.test(r"^[.,;:)a-z]", line):
                    boundary = False  # a continuation never opens a paragraph
                if prev_n and n - prev_n > 1 and self.content_cut(prev_n + 1, n - 1):
                    if R.test(r":$", cur):
                        cur = R.sub(r":$", ".", cur, "")
                        boundary = True
                    elif R.test(r"[.!?][\"')\]]?$", cur):
                        boundary = True
                    elif R.test(r"^[A-Z]", line):
                        cur += "."
                        boundary = True
                if boundary:
                    end()
            if not cur:
                cur = line
            elif R.test(r"-$", cur) and R.test(r"^[a-z]", line):
                cur = cur + line if self.keep_hyphen(cur, line) else cur[:-1] + line
            elif R.test(r"^[.,;:)]", line):
                cur += line
            else:
                cur += " " + line
            prev_n = n
        end()
        return "\n\n".join(paras) + "\n"

    # --- post-processing ------------------------------------------------------------------

    def clean(self, text: str) -> str:
        t = text.strip()
        t = R.sub(r"^```[a-z]*\n?", "", t, "i")
        t = R.sub(r"\n?```$", "", t, "").strip()
        t = R.sub(r"\*\*([^*\n]+)\*\*", "$1", t)
        t = R.sub(r"(^|\s)_([^_\n]+)_(\s|$)", "$1$2$3", t)

        def heading_line(line):
            m = R.match(r"^#{1,6}\s*(.+?)\s*[.:]?\s*$", line)
            if not m:
                k = heading_key(line)
                return "## " + self.headings[k] if k in self.headings else line
            k = heading_key(m[1])
            if k in self.headings:
                return "## " + self.headings[k]
            return R.sub(r"[.:]$", "", m[1], "") + "."
        t = "\n".join(heading_line(l) for l in t.split("\n"))
        # Citations: intervals first ("[0, 1]" is never a citation), then numbered brackets with an
        # optional qualifier, author-year brackets, alpha keys, locator brackets, author-year parens.
        t = R.sub(r"\[\s*0\s*,\s*(\d+(?:\.\d+)?)\s*\]", "the interval 0 to $1", t)
        t = R.sub(r"\s*\[\s*(?:" + CITE_LEAD + r")?\d+(?:\s*[,\u2013-]\s*\d+)*\s*\]", "", t)
        t = R.sub(r"\s*\[\s*" + CITE_LEAD + r"[^\[\]]{0,80}(?:19|20)\d{2}[a-z]?\s*\]", "", t)
        t = R.sub(r"\s*\[[A-Z][A-Za-z]{0,4}\+?\d{2}(?:\s*[,;]\s*[A-Z][A-Za-z]{0,4}\+?\d{2})*\]", "", t)
        t = R.sub(r"\s*\[\d+\s*[,;][^\[\]]{0,40}\]", "", t)
        t = R.sub(r"\s*\([^()]*\bet al\b[^()]*\)", "", t)
        t = R.sub(r"\s*\([A-Z][^()]*?\b(?:19|20)\d{2}[a-z]?(?:;[^()]*)?\)", "", t)
        t = R.sub(r"\bet al\.?('s)?\s*\((?:19|20)\d{2}[a-z]?\)", lambda m: "et al." + (m.group(1) or ""), t)
        t = R.sub(r"\b([A-Z][A-Za-z\-]+(?:'s)?)\s+\((?:19|20)\d{2}[a-z]?\)", "$1", t)
        # Inline links, wrapped ones included; a parenthesized one goes with its parentheses.
        t = R.sub(r"\s*\(\s*https?:\/\/[^()]*?\)", "", t)
        t = R.sub(r"\s*https?:\/\/[^\s()]+(?:\s+[a-z0-9][a-z0-9_=?&%/.-]*[a-z0-9=/_%-](?=[\s).,;]|$))*", "", t)
        t = R.sub(r",\s*\)", ")", t)
        t = R.sub(r"\(\s*\)", "", t)
        # A numeric parenthetical is a figure for the page; a bare "(1)" is a list marker and stays.
        t = R.sub(r"\s*\(\s*(?:approximately|about|roughly)?\s*(?!\d{1,2}\s*\))[^A-Za-z()]{1,16}\)", "", t)
        # A one-token parenthetical - "(DL19)", "(Ours)" - is a label for the page.
        t = R.sub(r"\s*\((?=[^()\s]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9.'-]{0,11}\)", "", t)
        # LaTeX residue.
        t = R.sub(r"\\[\[\]()]", "", t)
        t = R.sub(r"\$+", "", t)
        t = R.sub(r"\\([A-Za-z]+)(?:_\{?\\?([A-Za-z0-9]+)\}?)?",
                  lambda m: LATEX.get(m.group(1), m.group(1)) + (" " + LATEX.get(m.group(2), m.group(2)) if m.group(2) else ""), t)
        t = R.sub(r"[{}]", "", t)
        t = R.sub(r"[ \t]{2,}", " ", t)
        t = R.sub(r" ([,.;:])", "$1", t)
        # A sentence that OPENS on a pointer keeps its content and loses the pointer.
        t = R.sub(r"(?:^|(?<=[.!?:]\s))(?:Table|Figure|Fig\.)\s+\d+[a-z]?\s+(?:shows|presents|reports|illustrates|summarizes"
                  r"|summarises|lists|displays|gives|provides|compares|contains)\s+(\w)", lambda m: m.group(1).upper(), t, "gm")
        # Pointer sentences and phrases that only exist for the page.
        t = R.sub(r"(?:^|(?<=[.!?:]\s))(?:Table|Figure|Fig\.)\s+\d+[a-z]?\s+(?:shows|presents|reports|illustrates|summarizes"
                  r"|summarises|lists|displays)\s+(?:these|this|our|the|all)\s+\w+(?:\s+\w+){0,6}\.[ \t]*", "", t)
        t = R.sub(r"\s*\((?:see\s+|cf\.\s+)?(?:Table|Figure|Fig\.|Appendix|Section|Eq\.|Equation)\s+[^()]{0,50}\)", "", t)
        t = R.sub(r",?\s*as\s+(?:shown|reported|seen|illustrated|summarized|summarised)\s+in\s+(?:Table|Figure|Fig\.)\s+\d+[a-z]?", "", t)
        t = R.sub(r"\s+in\s+(?:Table|Figure|Fig\.)\s+\d+[a-z]?(?=[\s.,;:])", "", t)
        t = R.sub(r"(?:^|(?<=[.!?]\s))[^.!?\n]{0,120}\b(?:is|are|were|was)\s+(?:shown|reported|presented|summarized|summarised"
                  r"|listed|given|illustrated|displayed|depicted)\.[ \t]*", "", t)
        # Spoken forms: "model(s)", e.g. / i.e. / etc. / cf. / w.r.t., function notation.
        t = R.sub(r"([A-Za-z])\(s\)", "$1s", t)
        t = R.sub(r"\b[Ff]or e\.g\.,?\s*", lambda m: "For example, " if m.group(0)[0] == "F" else "for example, ", t)
        t = R.sub(r"\be\.g\.,?\s*", "for example, ", t)
        t = R.sub(r"\bi\.e\.,?\s*", "that is, ", t)
        t = R.sub(r"\betc\.(?=[\s,;)])", "and so on", t)
        t = R.sub(r"\bcf\.\s*", "compare ", t)
        t = R.sub(r"\bw\.r\.t\.\s*", "with respect to ", t)
        t = R.sub(r"\b([A-Za-z]{1,8})\(([A-Za-z0-9 ]{1,12}(?:[;,]\s*[A-Za-z0-9 ]{1,12}){0,3})\)",
                  lambda m: m.group(0) if R.test(r"^(?:s|es|\d+)$", m.group(2))
                  else f"{m.group(1)} of {R.sub(r'[;,]\s*', ' and ', m.group(2))}", t)
        t = R.sub(r"\s*\([A-Za-z]{0,2}[A-Z]{2,6}[A-Za-z]{0,2}s?\)", "", t)
        t = R.sub(r"LLM(s?)-as-a-[Jj]udge", "LLM$1 as a judge", t)
        for k, v in DOTTED.items():
            t = t.replace(k, v)
        # Acronyms the paper expanded at first use are said in full, the article fixed.
        for acr, full in self.expand:
            t = R.sub(r"\b([Aa])n? " + acr + r"(?![A-Za-z0-9])",
                      lambda m, full=full: m.group(1) + ("n " if R.test(r"^[aeiouAEIOU]", full) else " ") + full, t)
            t = R.sub(r"(?<![A-Za-z0-9-])" + acr + r"(?![A-Za-z0-9])", lambda m, full=full: full, t)

        # Scientific notation, then number ranges read as "to" (not into a model name).
        def power(sign, n):
            return "10 to the power of " + ("minus " if sign == "-" else "") + n
        t = R.sub(r"(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)\s*[eE]\s*([+-])?\s*(\d{1,3})(?!\d)",
                  lambda m: ("" if m.group(1) == "1" else m.group(1) + " times ") + power(m.group(2), m.group(3)), t)
        t = R.sub(r"(?<=times )10\s*\^?\s*([+-])?\s*(\d{1,3})(?!\d)", lambda m: power(m.group(1), m.group(2)), t)
        t = R.sub(r"(\d)\s*[-\u2013]\s*(\d+)(?![0-9A-Za-z])", "$1 to $2", t)

        # Dashes by role, per sentence: two or more are an aside (commas); one before a capital
        # starts a new sentence; one before lowercase introduces an elaboration (colon).
        def dashes(m):
            sentence = m.group(0)
            parts = R.split(r"\s+(?:-|--|\u2013|\u2014)\s+", sentence)
            if len(parts) == 1:
                return sentence
            if len(parts) >= 3:
                return ", ".join(parts)
            a, b = parts
            a = R.sub(r"[,;:]$", "", a, "")
            return a + ". " + b if R.test(r"^[A-Z]", b) else a + ": " + b
        t = "\n".join(p if p.startswith("## ") else R.sub(r"[^.!?\n]+[.!?]+[\"')]?(?=\s|$)|[^.!?\n]+$", dashes, p)
                      for p in t.split("\n"))
        t = R.sub(r",\s*,", ",", t)

        # Paragraph shape: a lowercase start is the tail of a cut formula; a short line with no
        # terminal punctuation is a bold lead-in left bare.
        def shape(p):
            if not p.strip() or p.startswith("## "):
                return p
            q = R.sub(r"^([a-z])", lambda m: m.group(1).upper(), p, "")
            if len(q) < 90 and not R.test(r"[.!?:\"')\]]$", q):
                q += "."
            return q
        t = "\n".join(shape(p) for p in t.split("\n"))

        # An accented letter is its base letter; anything else non-ASCII is deleted and named.
        def base(m):
            c = m.group(0)
            b = R.sub(r"[\u0300-\u036f]", "", unicodedata.normalize("NFD", c))
            return b if R.test(r"^[A-Za-z]$", b) else c
        t = R.sub(r"[\u00c0-\u024f]", base, t)
        dropped = []

        def ascii_only(m):
            c = m.group(0)
            if c not in ASCII_MAP and c not in dropped:
                dropped.append(c)
            return ASCII_MAP.get(c, "")
        t = R.sub(r"[^\x20-\x7E\n]", ascii_only, t)
        if dropped:
            self.log("  [dropped non-ascii: " + " ".join(f"{c} U+{ord(c):04X}" for c in dropped) + "]")
        return R.sub(r"\n{3,}", "\n\n", t) + "\n"

    def place_headings(self, text: str, sl: dict) -> str:
        """Headings are placed by ALIGNMENT with the raw text: each heading inside the slice is
        found by the first words of the prose after it in the raw text, and inserted before the
        output paragraph holding those words."""
        paras = [p.strip() for p in R.split(r"\n\s*\n", text)]
        paras = [p for p in paras if p and not p.startswith("## ")]
        missing, parent_of = [], []
        raw = self.raw_all

        def raw_at(i):
            return raw[i] if 0 <= i < len(raw) else ""
        in_slice = []
        for h in self.plan.get("headings") or []:
            at, span = -1, 1
            i = sl["from"] - 1
            while i < sl["to"] and at < 0:
                one = _norm(raw_at(i))
                next_ix = i + 1 if raw_at(i + 1).strip() else i + 2
                two = _norm(raw_at(i) + " " + raw_at(next_ix))
                if one and one == _norm(h):
                    at = i
                elif one and two == _norm(h):
                    at, span = i, next_ix - i
                i += 1
            in_slice.append({"h": h, "at": at, "span": span})
        in_slice = sorted([x for x in in_slice if x["at"] >= 0], key=lambda x: x["at"])
        after = 0
        for n, item in enumerate(in_slice):
            h, at, span = item["h"], item["at"], item["span"]
            nxt = in_slice[n + 1] if n + 1 < len(in_slice) else None
            j, words = at + span, []
            while j < sl["to"] and len(words) < 10:
                w = [x for x in _norm(self.raw_lines[j] if j < len(self.raw_lines) else "").split(" ") if x]
                words += w
                j += 1
                if nxt and j >= nxt["at"]:
                    break
            if nxt and nxt["at"] <= at + span + 2:
                parent_of.append((h, nxt["h"]))
                continue
            starts, joined = [], " "
            for i in range(after, len(paras)):
                starts.append((len(joined), i))
                joined += _norm(paras[i]) + " "
            idx, k = -1, 0
            while k + 4 <= len(words) and idx < 0:
                pos = joined.find(" ".join(words[k:k + 4]))
                if pos >= 0:
                    idx = [s for s in starts if s[0] <= pos][-1][1]
                k += 1
            if idx < 0:
                missing.append(h)
                continue
            paras.insert(idx, self._spoken_heading(h))
            after = idx + 1
        for parent, child in parent_of:
            target = self._spoken_heading(child)
            if target not in paras:
                missing.append(parent)
                continue
            paras.insert(paras.index(target), self._spoken_heading(parent))
        if missing:
            self.log(f"  [headings not placed: {' | '.join(missing)}]")
        return "\n\n".join(paras)

    def place_leadins(self, text: str, sl: dict) -> str:
        """Lead-ins (bold phrases that open a paragraph) become their own paragraph ending in a
        period, so the audio pauses after them; found by alignment with the raw text."""
        paras = [p.strip() for p in R.split(r"\n\s*\n", text)]
        paras = [p for p in paras if p]
        lines = self.raw_lines
        for lead in self.plan.get("leadins") or []:
            key = _norm(self.say(lead))
            at = next((i for i, t in enumerate(lines) if sl["from"] - 1 <= i < sl["to"] and t and _norm(t) == key), -1)
            if at < 0:
                continue
            spoken = R.sub(r"\s+", " ", self.say(lead)).strip()
            spoken = R.sub(r"[.:]$", "", spoken, "")
            spoken = R.sub(r"LLM(s?)-as-a-[Jj]udge", "LLM$1 as a judge", spoken) + "."
            own = next((i for i, p in enumerate(paras) if not p.startswith("## ") and _norm(p) == key), -1)
            if own >= 0:
                paras[own] = spoken
                continue
            words = [w for w in key.split(" ") if w]
            inline = R.js("[^A-Za-z0-9]+".join(words), "i")
            following, j = [], at + 1
            while j < sl["to"] and len(following) < 8:
                following += [w for w in _norm(lines[j] if j < len(lines) else "").split(" ") if w]
                j += 1
            follow_key = " ".join(following[:3])
            idx, m = -1, None
            for i, p in enumerate(paras):
                if idx >= 0:
                    break
                if p.startswith("## "):
                    continue
                for mm in inline.finditer(p):
                    after = " ".join([w for w in _norm(p[mm.end():]).split(" ") if w][:3])
                    if (after == follow_key) if follow_key else mm.start() == 0:
                        idx, m = i, mm
                        break
            if idx >= 0:
                p = paras[idx]
                before = R.sub(r":\s*$", ":", R.sub(r"[\s,;-]+$", "", p[:m.start()], ""), "")
                rest = R.sub(r"^[\s.:,;)-]+", "", p[m.end():], "")
                pieces = []
                if before.strip():
                    pieces.append(before if R.test(r"[.!?:]$", before) else before + ".")
                pieces.append(spoken)
                if rest.strip():
                    pieces.append(rest)
                paras[idx:idx + 1] = pieces
                continue
            k = 0
            while k + 4 <= len(following) and idx < 0:
                probe = " ".join(following[k:k + 4])
                idx = next((i for i, p in enumerate(paras) if probe in _norm(p)), -1)
                k += 1
            if idx >= 0:
                paras.insert(idx, spoken)
        return "\n\n".join(p for p in paras if p)

    @staticmethod
    def final_pass(text: str) -> str:
        """List markers become ordinals, after headings and lead-ins are placed."""
        t = "\n".join(p if p.startswith("## ") else
                      R.sub(r"^\(?(i{1,3}|iv|vi?|[1-6])[).]\s+(?=\S)", lambda m: ORD[m.group(1)] + ", ", p, "")
                      for p in text.split("\n"))
        return R.sub(r"\((i{1,3}|iv|vi?)\)\s*", lambda m: ORD[m.group(1)].lower() + ", ", t)

    # --- the whole step -------------------------------------------------------------------

    def run(self, out_name: str = "narration") -> Path:
        out_dir = self.work / out_name
        raw_dir = out_dir / ".raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        slices = self.plan["slices"]
        wanted = {s["out"] for s in slices}
        for d in (out_dir, raw_dir):
            for f in d.glob("*.txt"):
                if f.name not in wanted:
                    f.unlink()
        for idx, sl in enumerate(slices):
            raw_text = self.narrate_by_rules(sl)
            (raw_dir / sl["out"]).write_text(raw_text, encoding="utf-8")
            text = self.final_pass(self.place_leadins(self.place_headings(self.clean(raw_text), sl), sl))
            if idx == 0:
                first = text.split("\n")
                if heading_key(R.sub(r"^## ", "", first[0], "")) == heading_key(self.plan["title_line"]):
                    text = R.sub(r"^\n+", "", "\n".join(first[1:]), "")
                text = self.plan["title_line"] + "\n\n" + text
            if idx == len(slices) - 1:
                text = R.sub(r"\n*End of paper\.\s*$", "", text, "").rstrip() + "\n\nEnd of paper.\n"
            (out_dir / sl["out"]).write_text(text, encoding="utf-8")
        return out_dir
