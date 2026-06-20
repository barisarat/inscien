import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


table_sql = """
    CREATE TABLE lab_query_events (
        id INT AUTO_INCREMENT PRIMARY KEY,

        user_id INT NULL,
        user_email VARCHAR(254) NULL,
        user_tier VARCHAR(40) NULL,

        anonymous_id VARCHAR(120) NULL,

        query_text TEXT NOT NULL,
        answer_text MEDIUMTEXT NOT NULL,

        citations_json JSON NOT NULL,
        selected_sources_json JSON NOT NULL,

        retrieved_count INT NOT NULL DEFAULT 0,
        insufficient_context BOOLEAN NOT NULL DEFAULT 0,

        answer_model VARCHAR(120) NOT NULL DEFAULT '',
        embedding_model VARCHAR(160) NOT NULL DEFAULT '',

        route VARCHAR(160) NOT NULL DEFAULT '',
        client_ip VARCHAR(80) NULL,
        client_user_agent TEXT NULL,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX ix_lab_query_events_user_id (user_id),
        INDEX ix_lab_query_events_anonymous_id (anonymous_id),
        INDEX ix_lab_query_events_created_at (created_at),

        CONSTRAINT fk_lab_query_events_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    )
"""


def table_exists(conn, table_name):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name"
        ),
        {"table_name": table_name},
    )

    return result.scalar() > 0


def migrate():
    with engine.connect() as conn:
        if table_exists(conn, "lab_query_events"):
            print("Table 'lab_query_events' already exists. Skipping.")
            return

        conn.execute(text(table_sql))
        conn.commit()
        print("Table 'lab_query_events' created.")


if __name__ == "__main__":
    migrate()