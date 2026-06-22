def build_context_blocks(results):
    """Render retrieved passages as numbered sources. Each block carries the
    document title and page so the model can produce page-precise [n] citations."""
    blocks = []

    for index, result in enumerate(results, start=1):
        meta = result.get("metadata") or {}
        page = meta.get("page")

        lines = [
            f"[{index}]",
            f"Title: {result.get('title', '')}",
        ]
        if page is not None:
            lines.append(f"Page: {page}")
        lines += [
            "Text:",
            result.get("text", ""),
        ]
        blocks.append("\n".join(lines))

    return "\n\n---\n\n".join(blocks)
