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
    ), {"table_name": table_name})
    return result.scalar() > 0


def create_table(conn, name, ddl):
    if table_exists(conn, name):
        print(f"{name} already exists")
        return
    conn.execute(text(ddl))
    print(f"{name} table created")


def migrate():
    with engine.begin() as conn:
        create_table(conn, "chat_sessions", """
            CREATE TABLE chat_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(200) NOT NULL DEFAULT 'New chat',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX ix_chat_sessions_user (user_id, updated_at),
                CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        create_table(conn, "chat_messages", """
            CREATE TABLE chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                seq INT NOT NULL DEFAULT 0,
                role VARCHAR(12) NOT NULL,
                content MEDIUMTEXT NOT NULL,
                widgets JSON NULL,
                citations JSON NULL,
                context_summary TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX ix_chat_messages_session (session_id, seq),
                CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id)
                    REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
        """)


if __name__ == "__main__":
    migrate()
