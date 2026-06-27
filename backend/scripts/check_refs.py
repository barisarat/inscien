"""Diagnose "mapped but empty" papers.

A paper can resolve in OpenAlex (status=mapped -> it gets the "Citations ready" check) yet have an
EMPTY reference list: OpenAlex's *record* coverage is far better than its *reference-list* coverage.
Such a paper renders as an isolated node (just itself) in the References lens - which is exactly the
"labeled retrieved but nothing shows" case.

This counts them off the cached data only (data/openalex.json) - no network - and prints example
OpenAlex links so you can confirm the empty reference list is OpenAlex's, not ours.

Run:  cd backend && .venv/bin/python scripts/check_refs.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from services.refs import refstore


def _short(oaid):
    return (oaid or "").rstrip("/").rsplit("/", 1)[-1]


def main():
    cache = refstore._load()
    if not cache:
        print("OpenAlex cache is empty - fetch some citations first.")
        return

    by_status = {}
    refs_empty, refs_some, citers_fetched = [], [], []
    ref_counts = []
    for key, rec in cache.items():
        st = rec.get("status")
        by_status[st] = by_status.get(st, 0) + 1
        if refstore._is_mapped(rec):
            n = len(rec.get("references") or [])
            ref_counts.append(n)
            (refs_some if n else refs_empty).append((key, rec))
            if rec.get("citingWorks"):
                citers_fetched.append(key)

    mapped = len(ref_counts)
    print("=" * 64)
    print(f"OpenAlex cache: {len(cache)} records")
    for st, c in sorted(by_status.items(), key=lambda x: str(x[0])):
        print(f"  status={st}: {c}")
    print()
    print(f"mapped (have a record -> show the 'Citations ready' check): {mapped}")
    if mapped:
        pct = lambda n: f"{100 * n // mapped}%"
        rc = sorted(ref_counts)
        print(f"  with >=1 reference:    {len(refs_some):4d}  ({pct(len(refs_some))})")
        print(f"  with ZERO references:  {len(refs_empty):4d}  ({pct(len(refs_empty))})   <- render isolated in References")
        print(f"  references/mapped paper: median {rc[len(rc)//2]}, mean {sum(rc)/mapped:.1f}, max {rc[-1]}")
        print(f"  cited-by lists fetched: {len(citers_fetched)} (the rest fetch lazily on the Cited-by lens)")

    if refs_empty:
        print()
        print("Examples of mapped-but-no-references - open the link to see OpenAlex's own")
        print("referenced_works for that paper (empty there == genuine OpenAlex coverage gap):")
        for key, rec in refs_empty[:10]:
            oa = _short(rec.get("openalexId"))
            print(f"  {key}  doi={rec.get('doi')}  citedBy={rec.get('citedBy')}")
            print(f"      https://api.openalex.org/works/{oa}?select=referenced_works")
    print()


if __name__ == "__main__":
    main()
