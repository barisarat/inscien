"""Shared guard for derived-state mutation.

The index, manifest, sync ledger, OpenAlex cache, and job artifacts are rebuildable
derived state. Reset must not interleave with a background writer, and a writer that was
already running before reset must not commit after reset completes. The lock serializes
commits; the generation token invalidates stale workers that were doing expensive work
outside the lock.
"""

import threading

DERIVED_STATE_LOCK = threading.RLock()

_generation = 0
_resetting = False
_generation_lock = threading.Lock()


class DerivedStateReset(Exception):
    """Raised by a background writer when reset invalidated its run."""


def current_generation():
    with _generation_lock:
        return _generation


def begin_reset():
    global _generation, _resetting
    with _generation_lock:
        _generation += 1
        _resetting = True
        return _generation


def end_reset():
    global _resetting
    with _generation_lock:
        _resetting = False


def claim_generation():
    with _generation_lock:
        if _resetting:
            raise DerivedStateReset("cancelled by reset")
        return _generation


def ensure_current_generation(generation):
    if current_generation() != generation:
        raise DerivedStateReset("cancelled by reset")
