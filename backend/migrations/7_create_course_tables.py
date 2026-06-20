import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


old_tables = [
    "user_lecture_part_progress",
    "lecture_parts",
    "course_lectures",
    "course_groups",
]


tables = {
    "courses": """
        CREATE TABLE courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id VARCHAR(160) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(255) NOT NULL,
            href VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            source VARCHAR(255) NOT NULL DEFAULT '',
            content JSON NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

            INDEX ix_courses_course_id (course_id),
            INDEX ix_courses_category (category),
            INDEX ix_courses_sort_order (sort_order)
        )
    """,
    "user_course_progress": """
        CREATE TABLE user_course_progress (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            course_id VARCHAR(160) NOT NULL,
            completed_parts JSON NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

            UNIQUE KEY uq_user_course_progress (user_id, course_id),
            INDEX ix_user_course_progress_user_id (user_id),
            INDEX ix_user_course_progress_course_id (course_id),

            CONSTRAINT fk_user_course_progress_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    """,
}


def table_exists(conn, table_name):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name"
        ),
        {"table_name": table_name},
    )

    return result.scalar() > 0


def column_exists(conn, table_name, column_name):
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name "
            "AND column_name = :column_name"
        ),
        {
            "table_name": table_name,
            "column_name": column_name,
        },
    )

    return result.scalar() > 0


def drop_old_tables(conn):
    for table_name in old_tables:
        conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
        print(f"Old table '{table_name}' dropped if it existed.")


def prepare_courses_table(conn):
    if table_exists(conn, "courses") and not column_exists(conn, "courses", "content"):
        conn.execute(text("DROP TABLE IF EXISTS courses"))
        print("Old table 'courses' dropped.")

    if table_exists(conn, "courses"):
        print("Table 'courses' already exists. Skipping.")
        return

    conn.execute(text(tables["courses"]))
    print("Table 'courses' created.")


def prepare_user_course_progress_table(conn):
    if table_exists(conn, "user_course_progress"):
        print("Table 'user_course_progress' already exists. Skipping.")
        return

    conn.execute(text(tables["user_course_progress"]))
    print("Table 'user_course_progress' created.")


def migrate():
    with engine.connect() as conn:
        drop_old_tables(conn)
        prepare_courses_table(conn)
        prepare_user_course_progress_table(conn)
        conn.commit()
        print("Course JSON tables migration completed.")


if __name__ == "__main__":
    migrate()