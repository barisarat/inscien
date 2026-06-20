import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def migrate():
    # Backtests now live in the chat session history; the separate table is unused.
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS backtests"))
    print("backtests table dropped (if it existed)")


if __name__ == "__main__":
    migrate()
