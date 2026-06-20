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
        if table_exists(conn, "task_runs"):
            print("task_runs already exists")
            return

        conn.execute(text("""
            CREATE TABLE task_runs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                task_name VARCHAR(64) NOT NULL,
                task_id VARCHAR(36) NOT NULL,
                status VARCHAR(10) NOT NULL,
                started_at DATETIME NOT NULL,
                finished_at DATETIME NOT NULL,
                duration_ms INT NOT NULL,
                result JSON NULL,
                error TEXT NULL,
                INDEX ix_task_runs_name_started (task_name, started_at),
                INDEX ix_task_runs_started (started_at)
            )
        """))
        print("task_runs table created")


if __name__ == "__main__":
    migrate()
