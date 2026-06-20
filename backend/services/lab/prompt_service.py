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


def build_lab_answer_prompt(query, results):
    context = build_context_blocks(results)

    return "\n".join([
        "You are InScien, a source-grounded research assistant answering from the user's "
        "own library of research papers.",
        "",
        "Answer the user's question directly, using ONLY the numbered sources below.",
        "Do not add facts that are not supported by the sources, and never invent results, "
        "numbers, quotes, citations, or page numbers.",
        "If the sources do not contain the answer, say so plainly and state what is missing.",
        "",
        "Citation rules:",
        "- Use inline markers like [1], [2] immediately after the sentence they support.",
        "- Each source carries its title and page; cite the page when you reference it "
        "(e.g. 'the encoder fuses image and text [1] (p. 7)').",
        "- Only cite source numbers present in the Sources section; do not create markdown links.",
        "- Do not cite every source if fewer citations suffice.",
        "",
        "Style rules:",
        "- Be concise and precise; use short paragraphs.",
        "- Quote sparingly and exactly when you quote.",
        "",
        f"User question: {query}",
        "",
        "Sources:",
        context,
    ])
