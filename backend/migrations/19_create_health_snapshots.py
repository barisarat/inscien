import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def table_exists(conn, table_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() "
        "AND table_name = :table_name"
    ), {
        "table_name": table_name,
    })

    return result.scalar() > 0


def migrate():
    with engine.begin() as conn:
        if table_exists(conn, "health_snapshots"):
            print("health_snapshots already exists")
            return

        conn.execute(text("""
            CREATE TABLE health_snapshots (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                checked_at DATETIME NOT NULL,
                healthy TINYINT(1) NOT NULL,
                violations JSON NOT NULL,
                metrics JSON NOT NULL,
                INDEX ix_health_snapshots_checked (checked_at)
            )
        """))
        print("health_snapshots table created")


if __name__ == "__main__":
    migrate()
