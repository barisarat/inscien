import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def column_exists(conn, column_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() "
        "AND table_name = 'chat_sessions' "
        "AND column_name = :column_name"
    ), {
        "column_name": column_name,
    })

    return result.scalar() > 0


def migrate():
    with engine.begin() as conn:
        if column_exists(conn, "working_set"):
            print("chat_sessions.working_set already exists")
            return

        conn.execute(text(
            "ALTER TABLE chat_sessions ADD COLUMN working_set JSON NULL AFTER title"
        ))
        print("chat_sessions.working_set column added")


if __name__ == "__main__":
    migrate()
