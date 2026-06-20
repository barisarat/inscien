from pathlib import Path
import re
import time
import requests


OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5:7b"

PROJECT_DIR = Path.home() / "projects" / "transcribe"
INPUT_ROOT = PROJECT_DIR / "transcripts"
OUTPUT_ROOT = PROJECT_DIR / "formatted"

CHUNK_SIZE = 3500
SLEEP_BETWEEN_CALLS = 0.5
MAX_RETRIES = 3
OVERWRITE = False

START_NUMBER = 21
END_NUMBER = 41


def find_transcript_files(root_dir):
    files = []
    for path in root_dir.rglob("*.txt"):
        if path.is_file():
            files.append(path)
    files.sort(key=lambda p: str(p).lower())
    return files


def extract_leading_number(path):
    match = re.match(r"^(\d+)", path.stem)
    if not match:
        return None
    return int(match.group(1))


def filter_files_by_number(files, start_number=None, end_number=None):
    selected = []

    for path in files:
        number = extract_leading_number(path)

        if number is None:
            continue

        if start_number is not None and number < start_number:
            continue

        if end_number is not None and number > end_number:
            continue

        selected.append(path)

    return selected


def clean_text(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def split_text(text, chunk_size):
    text = clean_text(text)
    text = re.sub(r"\s+", " ", text).strip()

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        if end < len(text):
            split_point = text.rfind(". ", start, end)
            if split_point == -1:
                split_point = text.rfind("? ", start, end)
            if split_point == -1:
                split_point = text.rfind("! ", start, end)
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

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=600)
            response.raise_for_status()
            data = response.json()
            return data["response"].strip()
        except Exception as exc:
            last_error = exc
            print(f"  Request failed on attempt {attempt}/{MAX_RETRIES}: {exc}")
            time.sleep(2)

    raise last_error


def build_prompt(chunk, chunk_index, total_chunks, title):
    return f"""
You are cleaning up one chunk of a raw transcript.

Document title:
{title}

Task:
- Convert this transcript chunk into clean markdown
- Restore paragraph breaks
- Add a short section heading only if clearly justified by the content
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


def make_output_paths(input_file):
    relative_parent = input_file.parent.relative_to(INPUT_ROOT)
    stem = input_file.stem

    output_dir = OUTPUT_ROOT / relative_parent
    final_md = output_dir / f"{stem}.md"
    chunks_dir = output_dir / f"{stem}_chunks"

    return output_dir, chunks_dir, final_md


def process_file(input_file):
    output_dir, chunks_dir, final_md = make_output_paths(input_file)

    if final_md.exists() and not OVERWRITE:
        print(f"Skipping existing: {input_file}")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    raw_text = input_file.read_text(encoding="utf-8")
    raw_text = clean_text(raw_text)

    if not raw_text:
        print(f"Skipping empty file: {input_file}")
        return

    chunks = split_text(raw_text, CHUNK_SIZE)
    title = input_file.stem.replace("_", " ").strip()

    print("")
    print(f"Processing: {input_file}")
    print(f"Chunks: {len(chunks)}")

    formatted_chunks = []

    for i, chunk in enumerate(chunks, start=1):
        print(f"  Chunk {i}/{len(chunks)}")

        prompt = build_prompt(chunk, i, len(chunks), title)
        result = call_ollama(prompt)

        chunk_file = chunks_dir / f"{input_file.stem}_chunk_{i:03d}.md"
        chunk_file.write_text(result, encoding="utf-8")

        formatted_chunks.append(f"<!-- chunk {i} -->\n\n{result}")

        time.sleep(SLEEP_BETWEEN_CALLS)

    final_text = f"# {title}\n\n" + "\n\n".join(formatted_chunks).strip() + "\n"
    final_md.write_text(final_text, encoding="utf-8")

    print(f"Completed: {final_md}")


def main():
    if not INPUT_ROOT.exists():
        raise FileNotFoundError(f"Input root does not exist: {INPUT_ROOT}")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    files = find_transcript_files(INPUT_ROOT)
    files = filter_files_by_number(files, START_NUMBER, END_NUMBER)

    if not files:
        print("No transcript .txt files found for the selected range.")
        return

    print(f"Found {len(files)} transcript files.")
    print(f"Input root:     {INPUT_ROOT}")
    print(f"Output root:    {OUTPUT_ROOT}")
    print(f"Selected range: {START_NUMBER} to {END_NUMBER}")

    for input_file in files:
        process_file(input_file)

    print("")
    print("All done.")


if __name__ == "__main__":
    main()