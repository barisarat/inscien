import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def column_exists(conn, table_name, column_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() "
        "AND table_name = :table_name "
        "AND column_name = :column_name"
    ), {
        "table_name": table_name,
        "column_name": column_name,
    })

    return result.scalar() > 0


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


def table_exists(conn, table_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() "
        "AND table_name = :table_name"
    ), {
        "table_name": table_name,
    })

    return result.scalar() > 0


def add_column(conn, table_name, column_name, ddl):
    if column_exists(conn, table_name, column_name):
        print(f"{table_name}.{column_name} already exists")
        return

    conn.execute(text(ddl))
    print(f"{table_name}.{column_name} added")


def migrate():
    with engine.begin() as conn:
        add_column(conn, "strategies", "public_id",
                   "ALTER TABLE strategies ADD COLUMN public_id VARCHAR(40) NULL")
        add_column(conn, "strategies", "is_published",
                   "ALTER TABLE strategies ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0")
        add_column(conn, "strategies", "published_at",
                   "ALTER TABLE strategies ADD COLUMN published_at DATETIME NULL")

        if index_exists(conn, "strategies", "ix_strategies_public_id"):
            print("ix_strategies_public_id already exists")
        else:
            conn.execute(text(
                "CREATE UNIQUE INDEX ix_strategies_public_id ON strategies (public_id)"
            ))
            print("ix_strategies_public_id created")

        if table_exists(conn, "api_keys"):
            print("api_keys already exists")
        else:
            conn.execute(text("""
                CREATE TABLE api_keys (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    name VARCHAR(80) NOT NULL,
                    key_prefix VARCHAR(16) NOT NULL,
                    key_hash VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_used_at DATETIME NULL,
                    revoked_at DATETIME NULL,
                    UNIQUE INDEX ix_api_keys_key_hash (key_hash),
                    INDEX ix_api_keys_user_id (user_id),
                    CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id)
                        REFERENCES users(id) ON DELETE CASCADE
                )
            """))
            print("api_keys table created")


if __name__ == "__main__":
    migrate()
