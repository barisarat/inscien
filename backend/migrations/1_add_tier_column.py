"""
Migration: Add 'tier' column to users table.

Run once after pulling the updated code:
    python -m migrations.add_tier_column

Safe to run multiple times - checks if column exists first.
"""

import os
import sys

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def migrate():
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = 'users' "
            "AND column_name = 'tier'"
        ))
        exists = result.scalar() > 0

        if exists:
            print("✓ Column 'tier' already exists in users table. Nothing to do.")
            return

        conn.execute(text(
            "ALTER TABLE users ADD COLUMN tier VARCHAR(20) NOT NULL DEFAULT 'free' AFTER google_sub"
        ))
        conn.commit()
        print("✓ Added 'tier' column to users table (default: 'free').")


if __name__ == "__main__":
    migrate()