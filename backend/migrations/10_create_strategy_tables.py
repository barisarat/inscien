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


def create_table(conn, name, ddl):
    if table_exists(conn, name):
        print(f"{name} already exists")
        return

    conn.execute(text(ddl))
    print(f"{name} table created")


def migrate():
    with engine.begin() as conn:
        create_table(conn, "strategies", """
            CREATE TABLE strategies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(160) NOT NULL,
                ticker VARCHAR(16) NOT NULL,
                strategy_type VARCHAR(40) NOT NULL,
                params JSON NOT NULL,
                frequency VARCHAR(10) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX ix_strategies_user_id (user_id),
                INDEX ix_strategies_ticker (ticker),
                CONSTRAINT fk_strategies_user FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        create_table(conn, "backtests", """
            CREATE TABLE backtests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                strategy_id INT NULL,
                ticker VARCHAR(16) NOT NULL,
                strategy_type VARCHAR(40) NOT NULL,
                params JSON NOT NULL,
                frequency VARCHAR(10) NOT NULL,
                start_date VARCHAR(10) NULL,
                end_date VARCHAR(10) NULL,
                metrics JSON NOT NULL,
                equity_curve JSON NOT NULL,
                trades JSON NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX ix_backtests_user_id (user_id),
                CONSTRAINT fk_backtests_user FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        create_table(conn, "paper_runs", """
            CREATE TABLE paper_runs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                strategy_id INT NULL,
                ticker VARCHAR(16) NOT NULL,
                strategy_type VARCHAR(40) NOT NULL,
                params JSON NOT NULL,
                frequency VARCHAR(10) NOT NULL,
                status VARCHAR(12) NOT NULL DEFAULT 'active',
                starting_cash DECIMAL(18,6) NOT NULL,
                cash DECIMAL(18,6) NOT NULL,
                position_qty DECIMAL(18,6) NOT NULL DEFAULT 0,
                position_avg_price DECIMAL(18,6) NULL,
                last_price DECIMAL(18,6) NULL,
                equity DECIMAL(18,6) NOT NULL,
                realized_pnl DECIMAL(18,6) NOT NULL DEFAULT 0,
                note VARCHAR(255) NOT NULL DEFAULT '',
                last_tick_at DATETIME NULL,
                started_at DATETIME NULL,
                stopped_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX ix_paper_runs_user_id (user_id),
                INDEX ix_paper_runs_status (status),
                CONSTRAINT fk_paper_runs_user FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        create_table(conn, "paper_run_ticks", """
            CREATE TABLE paper_run_ticks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                run_id INT NOT NULL,
                ts DATETIME NOT NULL,
                price DECIMAL(18,6) NOT NULL,
                position_qty DECIMAL(18,6) NOT NULL,
                equity DECIMAL(18,6) NOT NULL,
                INDEX ix_paper_run_ticks_run_ts (run_id, ts),
                CONSTRAINT fk_paper_run_ticks_run FOREIGN KEY (run_id)
                    REFERENCES paper_runs(id) ON DELETE CASCADE
            )
        """)

        create_table(conn, "paper_trades", """
            CREATE TABLE paper_trades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                run_id INT NOT NULL,
                ts DATETIME NOT NULL,
                side VARCHAR(4) NOT NULL,
                qty DECIMAL(18,6) NOT NULL,
                price DECIMAL(18,6) NOT NULL,
                INDEX ix_paper_trades_run_ts (run_id, ts),
                CONSTRAINT fk_paper_trades_run FOREIGN KEY (run_id)
                    REFERENCES paper_runs(id) ON DELETE CASCADE
            )
        """)


if __name__ == "__main__":
    migrate()
