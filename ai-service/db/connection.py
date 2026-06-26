"""
PostgreSQL Database Interface for URackIT AI Service.

Provides a connection pool and convenience methods for database operations
using psycopg2 with RealDictCursor (replaces Supabase REST API).
"""

import os
import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class PostgresDB:
    """Direct PostgreSQL connection pool (replaces Supabase REST)."""

    _pool: Optional[pool.ThreadedConnectionPool] = None

    @classmethod
    def initialize(cls, database_url: Optional[str] = None) -> None:
        """Create the connection pool (idempotent)."""
        if cls._pool is not None:
            return

        url = database_url or os.getenv("DATABASE_URL", "")
        if not url:
            raise RuntimeError(
                "DATABASE_URL is not set. Cannot initialise PostgreSQL pool."
            )

        cls._pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=url,
        )
        logger.info("PostgreSQL connection pool initialized")

    @classmethod
    @contextmanager
    def get_connection(cls):
        """Yield a connection from the pool; returns it when done."""
        if cls._pool is None:
            cls.initialize()
        conn = cls._pool.getconn()
        try:
            yield conn
        finally:
            cls._pool.putconn(conn)

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    @classmethod
    def select(cls, query: str, params=None) -> List[Dict[str, Any]]:
        """Execute a SELECT and return all rows as dicts."""
        with cls.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()

    @classmethod
    def select_one(cls, query: str, params=None) -> Optional[Dict[str, Any]]:
        """Execute a SELECT and return the first row (or None)."""
        with cls.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchone()

    @classmethod
    def execute(cls, query: str, params=None) -> List[Dict[str, Any]]:
        """Execute an INSERT / UPDATE / DELETE with RETURNING, commit, and
        return any rows the statement produces."""
        with cls.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                conn.commit()
                try:
                    return cur.fetchall()
                except psycopg2.ProgrammingError:
                    # Statement had no result set (e.g. DELETE without RETURNING)
                    return []

    @classmethod
    def insert(cls, table: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Insert a single row into *table* and return the inserted row.

        This is a convenience wrapper that builds the INSERT ... RETURNING *
        statement from a dict.  For complex inserts use execute() directly.
        """
        columns = list(data.keys())
        placeholders = ["%s"] * len(columns)
        query = (
            f'INSERT INTO {table} ({", ".join(columns)}) '
            f'VALUES ({", ".join(placeholders)}) '
            f"RETURNING *"
        )
        rows = cls.execute(query, list(data.values()))
        return rows[0] if rows else None

    @classmethod
    def close(cls) -> None:
        """Shut down the pool (call on application exit)."""
        if cls._pool:
            cls._pool.closeall()
            cls._pool = None
            logger.info("PostgreSQL connection pool closed")


# ------------------------------------------------------------------
# Module-level accessor (matches the old get_db() API)
# ------------------------------------------------------------------

_db: Optional[type] = None


def get_db() -> type:
    """Return the PostgresDB *class* (already has classmethods).

    Initialises the pool on first call so the rest of the code can do:
        db = get_db()
        db.select(...)
    """
    global _db
    if _db is None:
        PostgresDB.initialize()
        _db = PostgresDB
    return _db
