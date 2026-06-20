"""
Migration: Add download tracking columns to users table.

Adds:
  - download_count_month  INT NOT NULL DEFAULT 0
  - download_reset_at     DATETIME NULL  (when the current month window resets)

Run once:
    python -m migrations.add_download_tracking

Safe to run multiple times - checks if columns exist first.
"""

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
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = 'users' "
            "AND column_name = 'download_count_month'"
        ))
        exists = result.scalar() > 0

        if exists:
            print("✓ Download tracking columns already exist. Nothing to do.")
            return

        conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN download_count_month INT NOT NULL DEFAULT 0, "
            "ADD COLUMN download_reset_at DATETIME NULL"
        ))
        conn.commit()
        print("✓ Added download_count_month and download_reset_at to users table.")


if __name__ == "__main__":
    migrate()