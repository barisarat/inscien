"""
Migration: Add 'password_hash' column to users table.

Required for email/password authentication. Nullable because Google-only
users have no password.

Run once after pulling the updated code:
    python -m migrations.4_add_password_hash

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
            "AND column_name = 'password_hash'"
        ))
        exists = result.scalar() > 0

        if exists:
            print("✓ Column 'password_hash' already exists in users table. Nothing to do.")
            return

        conn.execute(text(
            "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email"
        ))
        conn.commit()
        print("✓ Added 'password_hash' column to users table (nullable).")


if __name__ == "__main__":
    migrate()