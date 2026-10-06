"""JavaScript regex semantics on Python's `regex` module.

The narration rules were written against JavaScript, where \\b, \\w and \\d are ASCII-only but
\\s is Unicode. No single Python flag gives that mix, so `js()` rewrites \\b, \\w, \\W, \\d and \\D
into explicit ASCII classes and leaves everything else as written. `$` is rewritten to `\\Z`
outside MULTILINE patterns: in JavaScript it matches only at the very end, while Python's also
matches before a trailing newline.
"""

import functools

import regex

_W = "A-Za-z0-9_"
_B = rf"(?:(?<=[{_W}])(?![{_W}])|(?<![{_W}])(?=[{_W}]))"
_NB = rf"(?:(?<=[{_W}])(?=[{_W}])|(?<![{_W}])(?![{_W}]))"


def translate(pattern: str, multiline: bool = False) -> str:
    out = []
    i, in_class = 0, False
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\" and i + 1 < len(pattern):
            nxt = pattern[i + 1]
            if nxt == "w":
                out.append(_W if in_class else f"[{_W}]")
            elif nxt == "W":
                out.append(f"[^{_W}]")
            elif nxt == "d":
                out.append("0-9" if in_class else "[0-9]")
            elif nxt == "D":
                out.append("[^0-9]")
            elif nxt == "b" and not in_class:
                out.append(_B)
            elif nxt == "B" and not in_class:
                out.append(_NB)
            else:
                out.append(ch + nxt)
            i += 2
            continue
        if ch == "[" and not in_class:
            in_class = True
            out.append(ch)
            # a leading "]" or "^]" is literal inside a class
            if pattern[i + 1:i + 2] == "^":
                out.append("^")
                i += 1
            i += 1
            continue
        if ch == "]" and in_class:
            in_class = False
        if ch == "$" and not in_class and not multiline:
            out.append(r"\Z")
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


@functools.lru_cache(maxsize=None)
def js(pattern: str, flags: str = "") -> "regex.Pattern":
    """Compile a JavaScript regex body; `flags` takes i, m (s/g/u are implied or irrelevant)."""
    f = regex.V0
    if "i" in flags:
        f |= regex.IGNORECASE
    if "m" in flags:
        f |= regex.MULTILINE
    return regex.compile(translate(pattern, "m" in flags), f)


def sub(pattern: str, repl, text: str, flags: str = "g") -> str:
    """String.prototype.replace: every match with "g" in flags, else only the first."""
    count = 0 if "g" in flags else 1
    if isinstance(repl, str):
        repl = _js_repl(repl)
    return js(pattern, flags.replace("g", "")).sub(repl, text, count=count)


def _js_repl(template: str):
    """A JavaScript replacement string ($1, $&) as a function; an unmatched group is ""."""
    def fn(m):
        out, i = [], 0
        while i < len(template):
            c = template[i]
            if c == "$" and i + 1 < len(template):
                n = template[i + 1]
                if n.isdigit():
                    j = i + 1
                    while j < len(template) and template[j].isdigit() and int(template[i + 1:j + 1]) <= len(m.groups()):
                        j += 1
                    num = int(template[i + 1:j]) if j > i + 1 else None
                    if num is not None:
                        out.append(m.group(num) or "")
                        i = j
                        continue
                if n == "&":
                    out.append(m.group(0))
                    i += 2
                    continue
                if n == "$":
                    out.append("$")
                    i += 2
                    continue
            out.append(c)
            i += 1
        return "".join(out)
    return fn


def test(pattern: str, text: str, flags: str = "") -> bool:
    return js(pattern, flags).search(text) is not None


def match(pattern: str, text: str, flags: str = ""):
    """String.prototype.match without "g": the first match object, or None."""
    return js(pattern, flags).search(text)


def findall(pattern: str, text: str, flags: str = "") -> list[str]:
    """String.prototype.match with "g": every whole match, [] for none."""
    return [m.group(0) for m in js(pattern, flags).finditer(text)]


def split(pattern: str, text: str, flags: str = "") -> list[str]:
    """String.prototype.split with a regex (no capture groups in the patterns used here)."""
    return js(pattern, flags).split(text)
