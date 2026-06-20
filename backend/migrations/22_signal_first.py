"""Signal-first refactor: drop the legacy technical-strategy schema.

The product dropped the generic strategy catalog. Saved entities are now Signals
(news/sentiment indexes) → SignalTests (a rule on a signal) → paper runs. Legacy
`strategies`/`backtests`/`paper_runs` data is wiped (pre-prod). This migration only
performs the destructive drops; the new tables (`signals`, `signal_tests`, and the
rebuilt `paper_runs`/`paper_run_ticks`/`paper_trades`) are created by
`Base.metadata.create_all` at app startup from the models.

Idempotent: the drops are guarded on old-schema markers, so re-running after the new
tables exist is a no-op (it will NOT drop the freshly created tables).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def table_exists(conn, table_name):
    return conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    ), {"t": table_name}).scalar() > 0


def column_exists(conn, table_name, column_name):
    return conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": table_name, "c": column_name}).scalar() > 0


def migrate():
    with engine.begin() as conn:
        # Legacy paper-run schema is detected by the old `strategy_type` column. Only
        # then do we wipe the paper-run tables (and their FK children first).
        if table_exists(conn, "paper_runs") and column_exists(conn, "paper_runs", "strategy_type"):
            conn.execute(text("DROP TABLE IF EXISTS paper_trades"))
            conn.execute(text("DROP TABLE IF EXISTS paper_run_ticks"))
            conn.execute(text("DROP TABLE IF EXISTS paper_runs"))
            print("dropped legacy paper_runs / paper_run_ticks / paper_trades")
        else:
            print("paper_runs already on the new schema (or absent) — left untouched")

        for legacy in ("strategies", "backtests"):
            if table_exists(conn, legacy):
                conn.execute(text(f"DROP TABLE IF EXISTS {legacy}"))
                print(f"dropped legacy table {legacy}")
            else:
                print(f"{legacy} absent — nothing to drop")

    print("Done. New tables (signals / signal_tests / paper_runs) are created at app "
          "startup by create_all.")


if __name__ == "__main__":
    migrate()
