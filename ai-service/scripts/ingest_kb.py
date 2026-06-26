"""
Per-industry knowledge-base ingestion for the CallSphere Demo.

Usage:
    python -m scripts.ingest_kb <industry_slug> <path-to-txt-or-dir>

Reads a .txt file (or every .txt/.md file in a directory), chunks the text
(~800 tokens with overlap), embeds each chunk with text-embedding-3-small
(1536 dims), and INSERTs rows into `knowledge_base` with the resolved
industry_id. Re-running appends new rows (it does not dedupe), so clear the
industry's rows first if you want a clean re-ingest.

Run from the ai-service directory so the package imports resolve, e.g.:
    cd /home/ubuntu/apps/demo/ai-service
    ./venv/bin/python -m scripts.ingest_kb healthcare ./kb/healthcare.txt
"""

import logging
import os
import sys
import time
from typing import List

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ingest_kb")

EMBED_MODEL = "text-embedding-3-small"
EMBED_URL = "https://api.openai.com/v1/embeddings"

# ~800 tokens ≈ ~3200 chars (4 chars/token heuristic); ~150 token overlap.
CHUNK_CHARS = 3200
OVERLAP_CHARS = 600


def chunk_text(text: str, size: int = CHUNK_CHARS, overlap: int = OVERLAP_CHARS) -> List[str]:
    """Split text into overlapping chunks, preferring paragraph boundaries."""
    text = text.strip()
    if not text:
        return []

    # First pass: accumulate paragraphs up to ~size, then start a new chunk.
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    buf = ""
    for para in paragraphs:
        if len(buf) + len(para) + 2 <= size:
            buf = f"{buf}\n\n{para}" if buf else para
        else:
            if buf:
                chunks.append(buf)
            # If a single paragraph is larger than size, hard-split it.
            if len(para) > size:
                start = 0
                while start < len(para):
                    chunks.append(para[start:start + size])
                    start += size - overlap
                buf = ""
            else:
                buf = para
    if buf:
        chunks.append(buf)

    # Add character overlap between consecutive chunks for context continuity.
    if overlap > 0 and len(chunks) > 1:
        overlapped: List[str] = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = chunks[i - 1][-overlap:]
            overlapped.append(f"{tail}\n\n{chunks[i]}")
        chunks = overlapped

    return [c.strip() for c in chunks if c.strip()]


def embed(text: str) -> List[float]:
    """Embed text via the OpenAI embeddings API (1536-dim)."""
    import requests

    key = os.getenv("OPENAI_API_KEY", "")
    resp = requests.post(
        EMBED_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": EMBED_MODEL, "input": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


def resolve_industry_id(slug: str):
    from db.connection import get_db

    db = get_db()
    row = db.select_one("SELECT id, name FROM industries WHERE slug = %s", (slug,))
    if not row:
        return None, None
    return row["id"], row["name"]


def collect_files(path: str) -> List[str]:
    if os.path.isdir(path):
        files = []
        for name in sorted(os.listdir(path)):
            if name.lower().endswith((".txt", ".md")):
                files.append(os.path.join(path, name))
        return files
    return [path]


def ingest(slug: str, path: str) -> int:
    from db.connection import get_db

    industry_id, industry_name = resolve_industry_id(slug)
    if industry_id is None:
        logger.error(f"Unknown industry slug: {slug!r}. Aborting.")
        return 0

    files = collect_files(path)
    if not files:
        logger.error(f"No .txt/.md files found at {path!r}")
        return 0

    db = get_db()
    inserted = 0

    for fpath in files:
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                content = fh.read()
        except Exception as e:
            logger.error(f"Could not read {fpath}: {e}")
            continue

        title = os.path.splitext(os.path.basename(fpath))[0]
        chunks = chunk_text(content)
        logger.info(f"{fpath}: {len(chunks)} chunk(s)")

        for idx, chunk in enumerate(chunks):
            try:
                vec = _vec_literal(embed(chunk))
            except Exception as e:
                logger.error(f"Embed failed for {fpath} chunk {idx}: {e}")
                continue

            try:
                db.execute(
                    """
                    INSERT INTO knowledge_base
                        (industry_id, title, content, source, embedding)
                    VALUES (%s, %s, %s, %s, %s::vector)
                    """,
                    (
                        industry_id,
                        f"{title} [{idx + 1}/{len(chunks)}]",
                        chunk,
                        os.path.basename(fpath),
                        vec,
                    ),
                )
                inserted += 1
            except Exception as e:
                logger.error(f"Insert failed for {fpath} chunk {idx}: {e}")
            time.sleep(0.05)  # gentle pacing on the embeddings API

    logger.info(
        f"Done. Inserted {inserted} chunk(s) for industry "
        f"{slug!r} (id={industry_id}, {industry_name})."
    )
    return inserted


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.ingest_kb <industry_slug> <path-to-txt-or-dir>")
        sys.exit(1)
    slug = sys.argv[1].strip().lower()
    path = sys.argv[2]
    if not os.path.exists(path):
        print(f"Path not found: {path}")
        sys.exit(1)
    ingest(slug, path)


if __name__ == "__main__":
    main()
