import os
import sqlite3
from contextlib import contextmanager
from typing import Iterable

from .models import MessageIn, MessageOut


DB_PATH = os.getenv(
    "DATABASE_URL",
    os.path.join(os.path.dirname(__file__), "messages.db"),
)


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                handle TEXT NOT NULL,
                ciphertext TEXT NOT NULL,
                nonce TEXT NOT NULL,
                epk TEXT NOT NULL,
                nickname TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_conn() -> Iterable[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def insert_message(msg: MessageIn, created_at: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO messages (handle, ciphertext, nonce, epk, nickname, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (msg.handle, msg.ciphertext, msg.nonce, msg.epk, msg.nickname, created_at),
        )
        conn.commit()


def fetch_messages(handle: str) -> list[MessageOut]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE handle = ? ORDER BY id DESC", (handle,)
        ).fetchall()
        return [
            MessageOut(
                id=row["id"],
                handle=row["handle"],
                ciphertext=row["ciphertext"],
                nonce=row["nonce"],
                epk=row["epk"],
                nickname=row["nickname"],
                created_at=row["created_at"],
            )
            for row in rows
        ]
