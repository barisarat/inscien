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
        if table_exists(conn, "gdelt_articles"):
            print("gdelt_articles already exists")
            return

        conn.execute(text("""
            CREATE TABLE gdelt_articles (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                record_id VARCHAR(32) NOT NULL,
                day DATE NOT NULL,
                ts DATETIME NOT NULL,
                url TEXT NULL,
                source VARCHAR(255) NOT NULL DEFAULT '',
                tone DOUBLE NULL,
                positive DOUBLE NULL,
                negative DOUBLE NULL,
                polarity DOUBLE NULL,
                activity_ref_density DOUBLE NULL,
                self_group_ref_density DOUBLE NULL,
                word_count INT NOT NULL DEFAULT 0,
                num_mentions INT NOT NULL DEFAULT 0,
                themes JSON NOT NULL,
                countries JSON NOT NULL,
                page_title TEXT NULL,
                ingested_at DATETIME NOT NULL,
                UNIQUE KEY uq_gdelt_articles_record_id (record_id),
                INDEX ix_gdelt_articles_day (day),
                INDEX ix_gdelt_articles_ts (ts)
            )
        """))
        print("gdelt_articles table created")


if __name__ == "__main__":
    migrate()
