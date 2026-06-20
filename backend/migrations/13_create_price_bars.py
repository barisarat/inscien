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
        if table_exists(conn, "price_bars"):
            print("price_bars already exists")
            return

        conn.execute(text("""
            CREATE TABLE price_bars (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                ticker VARCHAR(16) NOT NULL,
                frequency VARCHAR(8) NOT NULL,
                ts DATETIME NOT NULL,
                open DOUBLE NULL,
                high DOUBLE NULL,
                low DOUBLE NULL,
                close DOUBLE NOT NULL,
                volume BIGINT NULL,
                fetched_at DATETIME NOT NULL,
                UNIQUE KEY uq_price_bars_ticker_freq_ts (ticker, frequency, ts),
                INDEX ix_price_bars_freq_ts (frequency, ts)
            )
        """))
        print("price_bars table created")


if __name__ == "__main__":
    migrate()
