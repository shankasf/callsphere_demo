"""
Knowledge base module for URackIT AI Service.

Provides semantic search over the knowledge text file using pgvector
(replaces ChromaDB).  Embeddings are generated with sentence-transformers
(all-MiniLM-L6-v2) and stored / queried in a `knowledge_base_chunks`
table via psycopg2.
"""

import os
import logging
from pathlib import Path
from typing import List, Optional

from agents import function_tool

logger = logging.getLogger(__name__)

_BASE_DIR = Path(__file__).resolve().parent.parent
_DATA_FILE = _BASE_DIR / "urackit_knowledge.txt"

# Lazy-loaded sentence-transformer model
_model = None


def _get_embedding_model():
    """Return the shared SentenceTransformer instance (lazy-loaded)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Loaded sentence-transformers model: all-MiniLM-L6-v2")
    return _model


def _split_text(text: str, chunk_size: int = 600, overlap: int = 120) -> List[str]:
    """Split text into overlapping chunks for embedding."""
    chunks: List[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == length:
            break
        start = end - overlap
        if start < 0:
            start = 0

    return chunks


def reload_knowledge_base(file_path: Optional[str] = None) -> str:
    """Reload the knowledge base from the text file into pgvector."""
    from db.connection import get_db

    if file_path is None:
        file_path = str(_DATA_FILE)

    if not os.path.exists(file_path):
        return f"Knowledge file not found: {file_path}"

    with open(file_path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    chunks = _split_text(raw_text)
    if not chunks:
        return "No chunks produced from the knowledge file."

    model = _get_embedding_model()
    embeddings = model.encode(chunks)

    db = get_db()
    source_name = os.path.basename(file_path)

    # Clear old chunks for this source
    db.execute(
        "DELETE FROM knowledge_base_chunks WHERE source = %s",
        (source_name,),
    )

    # Insert new chunks with embeddings
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.execute(
            """
            INSERT INTO knowledge_base_chunks
                (document_id, chunk_index, content, embedding, source)
            VALUES (%s, %s, %s, %s::vector, %s)
            """,
            (f"doc_{i // 10}", i, chunk, embedding.tolist(), source_name),
        )

    msg = f"Reloaded {len(chunks)} chunks into knowledge base (source: {source_name})"
    logger.info(msg)
    return msg


@function_tool
def lookup_support_info(question: str, top_k: int = 4) -> str:
    """
    Search the URackIT knowledge base for relevant support information.
    Use this to find troubleshooting steps, procedures, and support information.

    Args:
        question: The question or topic to search for
        top_k: Number of results to return (default 4)

    Returns:
        Relevant support information from the knowledge base
    """
    try:
        from db.connection import get_db

        model = _get_embedding_model()
        query_embedding = model.encode([question])[0].tolist()

        db = get_db()
        results = db.select(
            """
            SELECT content, source,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge_base_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (query_embedding, query_embedding, top_k),
        )

        if not results:
            return "No relevant information found in the knowledge base."

        context_parts = []
        for r in results:
            sim = r.get("similarity")
            sim_str = f"{sim:.2f}" if sim is not None else "N/A"
            context_parts.append(
                f"[Source: {r['source']}, Relevance: {sim_str}]\n{r['content']}"
            )

        return "Knowledge Base Results:\n\n" + "\n\n---\n\n".join(context_parts)
    except Exception as e:
        logger.error(f"Knowledge base search failed: {e}")
        return f"Knowledge base search error: {str(e)}"


def get_knowledge_base_stats() -> dict:
    """Get statistics about the knowledge base."""
    try:
        from db.connection import get_db

        db = get_db()
        row = db.select_one("SELECT COUNT(*) AS cnt FROM knowledge_base_chunks")
        count = (row or {}).get("cnt", 0)

        return {
            "available": True,
            "count": count,
            "file_exists": _DATA_FILE.exists(),
            "file_path": str(_DATA_FILE),
        }
    except Exception:
        return {
            "available": False,
            "count": 0,
            "file_exists": _DATA_FILE.exists(),
            "file_path": str(_DATA_FILE),
        }
