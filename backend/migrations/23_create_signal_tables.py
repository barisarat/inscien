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
        if not table_exists(conn, "student_labels"):
            conn.execute(text("""
                CREATE TABLE student_labels (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    record_id VARCHAR(64) NOT NULL,
                    day DATE NOT NULL,
                    source VARCHAR(255) NOT NULL DEFAULT '',
                    title TEXT NULL,
                    url TEXT NULL,
                    tone DOUBLE NULL,
                    spread INT NOT NULL DEFAULT 1,
                    gate_prob DOUBLE NULL,
                    domains JSON NOT NULL,
                    impact VARCHAR(16) NULL,
                    region VARCHAR(64) NULL,
                    finbert DOUBLE NULL,
                    finbert_label VARCHAR(16) NULL,
                    model_version VARCHAR(64) NOT NULL DEFAULT '',
                    enriched_at DATETIME NOT NULL,
                    UNIQUE KEY uq_student_labels_record_id (record_id),
                    INDEX ix_student_labels_day (day)
                )
            """))
            print("student_labels table created")
        else:
            print("student_labels already exists")

        if not table_exists(conn, "news_events"):
            conn.execute(text("""
                CREATE TABLE news_events (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    day DATE NOT NULL,
                    size INT NOT NULL DEFAULT 1,
                    n_outlets INT NOT NULL DEFAULT 1,
                    weight DOUBLE NOT NULL DEFAULT 0,
                    finbert DOUBLE NULL,
                    tone DOUBLE NULL,
                    impact VARCHAR(16) NULL,
                    region VARCHAR(64) NULL,
                    domains JSON NOT NULL,
                    rep_title TEXT NULL,
                    model_version VARCHAR(64) NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL,
                    INDEX ix_news_events_day (day)
                )
            """))
            print("news_events table created")
        else:
            print("news_events already exists")


if __name__ == "__main__":
    migrate()
