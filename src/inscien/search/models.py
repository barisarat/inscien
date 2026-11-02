"""The local models: the passage embedder and the cross-encoder for the neural rerank.

Both run through fastembed (onnxruntime) and are downloaded into INSCIEN_HOME/search/models on
first use. They run on the CPU by default. INSCIEN_SEARCH_DEVICE=cuda runs them on an NVIDIA GPU,
which needs onnxruntime-gpu installed in place of onnxruntime (as for narration); a GPU that
onnxruntime does not accept is an error, never a quiet fall back to the CPU.

    INSCIEN_SEARCH_DEVICE   cpu (default) or cuda
    INSCIEN_EMBED_THREADS   CPU threads for onnxruntime; default all cores
    INSCIEN_RERANK_MODEL    cross-encoder; default Xenova/ms-marco-MiniLM-L-12-v2
"""

import os
import threading
import warnings

from inscien.core.paths import search_models_dir

EMBED_MODEL = "BAAI/bge-small-en-v1.5"
DIM = 384
RERANK_MODEL = os.getenv("INSCIEN_RERANK_MODEL") or "Xenova/ms-marco-MiniLM-L-12-v2"
THREADS = int(os.getenv("INSCIEN_EMBED_THREADS")) if os.getenv("INSCIEN_EMBED_THREADS") else None
DEVICE = (os.getenv("INSCIEN_SEARCH_DEVICE") or "cpu").strip().lower()

_embedder = None
_cross = None
_lock = threading.Lock()


def batch_size() -> int:
    return 256 if DEVICE == "cuda" else 64


def _options() -> dict:
    """fastembed options for the device; on cuda, checks onnxruntime can use the GPU at all."""
    if DEVICE != "cuda":
        return {"threads": THREADS, "providers": ["CPUExecutionProvider"]}
    import onnxruntime as ort
    # onnxruntime >=1.19 ships without CUDA/cuDNN; they come from the nvidia-*-cu12 wheels,
    # which are not on the default library path.
    if hasattr(ort, "preload_dlls"):
        try:
            ort.preload_dlls()
        except Exception:
            pass
    if "CUDAExecutionProvider" not in ort.get_available_providers():
        raise RuntimeError(f"INSCIEN_SEARCH_DEVICE=cuda, but onnxruntime sees {ort.get_available_providers()}. "
                           "Install onnxruntime-gpu in place of onnxruntime, or unset INSCIEN_SEARCH_DEVICE.")
    return {"cuda": True, "device_ids": [0]}


def _build(make, probe):
    """make(**options), then one probe inference; onnxruntime's CUDA fall-back warning is an error."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = make(**_options())
        probe(model)
    failed = [str(w.message) for w in caught if "CUDAExecutionProvider" in str(w.message)]
    if DEVICE == "cuda" and failed:
        raise RuntimeError(f"the GPU did not work: {failed[0].splitlines()[0][:200]}")
    return model


def embedder():
    global _embedder
    with _lock:
        if _embedder is None:
            from fastembed import TextEmbedding
            _embedder = _build(lambda **o: TextEmbedding(model_name=EMBED_MODEL, cache_dir=search_models_dir(), **o),
                               lambda m: list(m.embed(["probe"])))
    return _embedder


def passages(texts) -> list[list[float]]:
    """Vectors for a batch of passages."""
    texts = list(texts)
    return [vector.tolist() for vector in embedder().embed(texts, batch_size=batch_size())] if texts else []


def query(text: str) -> list[float]:
    """Vector for one query; bge models prefix queries with an instruction, which query_embed adds."""
    return list(embedder().query_embed([text]))[0].tolist()


def cross_encoder():
    global _cross
    with _lock:
        if _cross is None:
            from fastembed.rerank.cross_encoder import TextCrossEncoder
            _cross = _build(lambda **o: TextCrossEncoder(model_name=RERANK_MODEL, cache_dir=search_models_dir(), **o),
                            lambda m: list(m.rerank("probe", ["probe"])))
    return _cross
