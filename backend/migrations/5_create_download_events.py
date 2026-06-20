import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def migrate():
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() "
            "AND table_name = 'download_events'"
        ))
        exists = result.scalar() > 0

        if exists:
            print("Table 'download_events' already exists. Nothing to do.")
            return

        conn.execute(text(
            "CREATE TABLE download_events ("
            "id INT NOT NULL AUTO_INCREMENT, "
            "user_id INT NOT NULL, "
            "notebook_id VARCHAR(255) NOT NULL, "
            "notebook_name VARCHAR(255) NOT NULL, "
            "notebook_category VARCHAR(150) NOT NULL, "
            "notebook_desc TEXT NOT NULL, "
            "file_basename VARCHAR(255) NOT NULL, "
            "user_tier VARCHAR(20) NOT NULL DEFAULT 'free', "
            "downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
            "PRIMARY KEY (id), "
            "INDEX ix_download_events_user_id (user_id), "
            "INDEX ix_download_events_notebook_id (notebook_id), "
            "INDEX ix_download_events_notebook_category (notebook_category), "
            "INDEX ix_download_events_downloaded_at (downloaded_at), "
            "CONSTRAINT fk_download_events_user_id "
            "FOREIGN KEY (user_id) REFERENCES users(id) "
            "ON DELETE CASCADE"
            ")"
        ))
        conn.commit()
        print("Created 'download_events' table.")


if __name__ == "__main__":
    migrate()