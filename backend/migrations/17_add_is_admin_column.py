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
        "AND table_name = 'users' "
        "AND column_name = :column_name"
    ), {
        "column_name": column_name,
    })

    return result.scalar() > 0


def migrate():
    with engine.begin() as conn:
        if column_exists(conn, "is_admin"):
            print("users.is_admin already exists")
            return

        conn.execute(text(
            "ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER tier"
        ))
        print("users.is_admin column added")


if __name__ == "__main__":
    migrate()
