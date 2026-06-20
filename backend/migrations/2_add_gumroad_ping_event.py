"""
Migration: Create gumroad_ping_event table.

Run once:
    python -m migrations.add_gumroad_ping_event

Safe to run multiple times - checks if table exists first.
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
        # Check if table already exists
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() "
            "AND table_name = 'gumroad_ping_event'"
        ))
        exists = result.scalar() > 0

        if exists:
            print("✓ Table 'gumroad_ping_event' already exists. Nothing to do.")
            return

        conn.execute(text("""
            CREATE TABLE gumroad_ping_event (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id VARCHAR(64) NOT NULL UNIQUE,
                product_id VARCHAR(64) NULL,
                subscription_id VARCHAR(64) NULL,
                email VARCHAR(254) NULL,
                user_id INT NULL,
                plan_id VARCHAR(16) NULL,
                refunded TINYINT(1) NOT NULL DEFAULT 0,
                raw_payload TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sale_id (sale_id),
                INDEX idx_product_id (product_id),
                INDEX idx_subscription_id (subscription_id),
                INDEX idx_email (email),
                INDEX idx_user_id (user_id),
                INDEX idx_plan_id (plan_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        conn.commit()
        print("✓ Created 'gumroad_ping_event' table.")


if __name__ == "__main__":
    migrate()