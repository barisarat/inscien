import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


INDEX_NAME = "ix_chat_messages_session_seq"


def index_exists(conn, table_name, index_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() "
        "AND table_name = :table_name "
        "AND index_name = :index_name"
    ), {
        "table_name": table_name,
        "index_name": index_name,
    })

    return result.scalar() > 0


def migrate():
    with engine.begin() as conn:
        if index_exists(conn, "chat_messages", INDEX_NAME):
            print(f"{INDEX_NAME} already exists")
            return

        # History loads ORDER BY (seq, id); this lets MySQL read in index
        # order instead of filesorting full rows (large widget JSON included).
        conn.execute(text(
            f"CREATE INDEX {INDEX_NAME} ON chat_messages (session_id, seq)"
        ))
        print(f"{INDEX_NAME} created")


if __name__ == "__main__":
    migrate()
