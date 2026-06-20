import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


columns = {
    "email_verification_code": "ALTER TABLE users ADD COLUMN email_verification_code VARCHAR(20) NULL",
    "email_verification_sent_at": "ALTER TABLE users ADD COLUMN email_verification_sent_at DATETIME NULL",
    "email_verified_at": "ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL",
    "reset_password_code": "ALTER TABLE users ADD COLUMN reset_password_code VARCHAR(20) NULL",
    "reset_password_sent_at": "ALTER TABLE users ADD COLUMN reset_password_sent_at DATETIME NULL",
    "marketing_opt_in": "ALTER TABLE users ADD COLUMN marketing_opt_in BOOLEAN NOT NULL DEFAULT 0",
    "terms_accepted": "ALTER TABLE users ADD COLUMN terms_accepted BOOLEAN NOT NULL DEFAULT 0",
    "terms_accepted_at": "ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL",
    "updated_at": "ALTER TABLE users ADD COLUMN updated_at DATETIME NULL",
}


def column_exists(conn, column_name):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = 'users' "
            "AND column_name = :column_name"
        ),
        {"column_name": column_name},
    )

    return result.scalar() > 0


def migrate():
    with engine.connect() as conn:
        for column_name, statement in columns.items():
            if column_exists(conn, column_name):
                print(f"Column '{column_name}' already exists. Skipping.")
                continue

            conn.execute(text(statement))
            print(f"Column '{column_name}' added.")

        conn.execute(
            text(
                "UPDATE users "
                "SET auth_provider = 'google' "
                "WHERE google_sub IS NOT NULL "
                "AND auth_provider IS NULL"
            )
        )

        conn.execute(
            text(
                "UPDATE users "
                "SET auth_provider = 'email' "
                "WHERE google_sub IS NULL "
                "AND auth_provider IS NULL"
            )
        )

        conn.commit()
        print("Updated users auth fields.")


if __name__ == "__main__":
    migrate()