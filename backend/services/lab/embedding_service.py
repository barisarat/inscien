from fastembed import TextEmbedding

from services.lab.settings import get_lab_settings


_model = None


def get_embedding_model():
    global _model

    if _model is None:
        settings = get_lab_settings()
        _model = TextEmbedding(
            model_name=settings["embedding_model"],
            cache_dir=settings["fastembed_cache_path"],
        )

    return _model


def embed_texts(texts):
    model = get_embedding_model()
    embeddings = model.embed(texts)

    return [
        embedding.tolist()
        for embedding in embeddings
    ]