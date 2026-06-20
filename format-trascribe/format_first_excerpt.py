from pathlib import Path
import re
import requests
import time

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5:7b"

project_dir = Path.home() / "projects" / "transcribe"
input_file = project_dir / "formatter" / "input" / "00-stock-market-basics_full.txt"
output_dir = project_dir / "formatter" / "output"
output_file = output_dir / "00-stock-market-basics_full.md"

CHUNK_SIZE = 3500
SLEEP_BETWEEN_CALLS = 0.5


def split_text(text, chunk_size):
    text = re.sub(r"\s+", " ", text).strip()
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        if end < len(text):
            split_point = text.rfind(". ", start, end)
            if split_point == -1:
                split_point = text.rfind(" ", start, end)
            if split_point != -1 and split_point > start:
                end = split_point + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end

    return chunks


def call_ollama(prompt):
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0
        }
    }

    response = requests.post(OLLAMA_URL, json=payload, timeout=600)
    response.raise_for_status()
    return response.json()["response"].strip()


def build_prompt(chunk, chunk_index, total_chunks):
    return f"""
You are cleaning up one chunk of a raw transcript.

Task:
- Convert this transcript chunk into clean markdown
- Restore paragraph breaks
- Add a short section heading only if it is clearly justified by the content
- Preserve meaning
- Do not summarize
- Do not omit important information
- Do not invent new content
- Keep the output proportional to the input
- Return only the cleaned markdown for this chunk

This is chunk {chunk_index} of {total_chunks}.

Transcript chunk:
{chunk}
""".strip()


def main():
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_text = input_file.read_text(encoding="utf-8")
    chunks = split_text(raw_text, CHUNK_SIZE)

    print(f"Input file: {input_file}")
    print(f"Total chunks: {len(chunks)}")
    print("")

    formatted_chunks = []

    for i, chunk in enumerate(chunks, start=1):
        print(f"Processing chunk {i}/{len(chunks)}")

        prompt = build_prompt(chunk, i, len(chunks))
        result = call_ollama(prompt)

        chunk_file = output_dir / f"00-stock-market-basics_chunk_{i:02d}.md"
        chunk_file.write_text(result, encoding="utf-8")

        formatted_chunks.append(f"<!-- chunk {i} -->\n\n{result}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    final_text = "\n\n".join(formatted_chunks).strip() + "\n"
    output_file.write_text(final_text, encoding="utf-8")

    print("")
    print(f"Final output: {output_file}")


if __name__ == "__main__":
    main()