import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-alembic-migrations",
  kind: "codenote",
  name: "FastAPI Alembic Migrations with Docker",
  desc: "A Docker based FastAPI project that uses SQLAlchemy models, PostgreSQL, and Alembic migrations instead of creating tables directly at startup.",
  intro:
    "This setup shows the production style database workflow for FastAPI projects. SQLAlchemy models define the table structure, Alembic generates migration files, and Docker Compose runs both the FastAPI backend and PostgreSQL database.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the Alembic migration example. This example uses PostgreSQL because migrations are most useful with a real database service.",
          ],
        },
        {
          kind: "code",
          code: `06-alembic-migrations/
  app/
    __init__.py
    database.py
    main.py
    models.py
    schemas.py
  alembic/
    env.py
    versions/
  alembic.ini
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 06-alembic-migrations
cd 06-alembic-migrations
mkdir app
touch app/__init__.py`,
        },
      ],
    },
    {
      title: "Create the database connection",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the database setup file at app/database.py. The FastAPI app uses SQLAlchemy sessions, while Alembic uses the same metadata to generate and apply migrations.",
          ],
        },
        {
          kind: "code",
          code: `app/database.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://app_user:app_password@db:5432/app_db",
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()`,
        },
        {
          kind: "text",
          text: [
            "The database host is db because backend and database run in the same Docker Compose network. Inside the backend container, db resolves to the PostgreSQL service.",
          ],
        },
      ],
    },
    {
      title: "Create the SQLAlchemy models",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the model file at app/models.py. These SQLAlchemy models are the source that Alembic compares against the current database schema.",
          ],
        },
        {
          kind: "code",
          code: `app/models.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = mapped_column(Integer, primary_key=True, index=True)
    username = mapped_column(String(50), unique=True, nullable=False, index=True)
    email = mapped_column(String(120), unique=True, nullable=False, index=True)

    posts = relationship(
        "Post",
        back_populates="author",
        cascade="all, delete-orphan",
    )


class Post(Base):
    __tablename__ = "posts"

    id = mapped_column(Integer, primary_key=True, index=True)
    title = mapped_column(String(100), nullable=False)
    content = mapped_column(Text, nullable=False)
    user_id = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    date_posted = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    author = relationship(
        "User",
        back_populates="posts",
    )`,
        },
        {
          kind: "text",
          text: [
            "Do not call Base.metadata.create_all as the main schema setup in this project. Alembic should create and update the database schema through migration files.",
          ],
        },
      ],
    },
    {
      title: "Create the Pydantic schemas",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the schema file at app/schemas.py. The schemas keep API request and response shapes separate from SQLAlchemy database models.",
          ],
        },
        {
          kind: "code",
          code: `app/schemas.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr = Field(max_length=120)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    user_id: int
    date_posted: datetime`,
        },
      ],
    },
    {
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main application file at app/main.py. The app does not create tables on startup. Database schema changes are handled by Alembic commands.",
          ],
        },
        {
          kind: "code",
          code: `app/main.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.schemas import PostCreate, PostResponse, UserCreate, UserResponse

app = FastAPI(title="06 Alembic Migrations")


@app.get("/")
def home():
    return {
        "message": "FastAPI Alembic migration example"
    }


@app.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
):
    existing_user = db.execute(
        select(models.User).where(
            or_(
                models.User.username == payload.username,
                models.User.email == payload.email,
            )
        )
    ).scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    user = models.User(
        username=payload.username,
        email=payload.email,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@app.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    users = db.execute(
        select(models.User).order_by(models.User.id)
    ).scalars().all()

    return users


@app.post(
    "/users/{user_id}/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    user_id: int,
    payload: PostCreate,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    post = models.Post(
        title=payload.title,
        content=payload.content,
        user_id=user.id,
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    return post


@app.get("/posts", response_model=list[PostResponse])
def list_posts(db: Session = Depends(get_db)):
    posts = db.execute(
        select(models.Post).order_by(models.Post.id)
    ).scalars().all()

    return posts`,
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. Alembic manages migration files, SQLAlchemy handles the ORM layer, and psycopg connects to PostgreSQL.",
          ],
        },
        {
          kind: "code",
          code: `requirements.txt`,
        },
        {
          kind: "code",
          code: `fastapi
uvicorn[standard]
sqlalchemy
psycopg[binary]
alembic
email-validator`,
        },
      ],
    },
    {
      title: "Create the Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Dockerfile at the project root. The same container image can run the FastAPI app and execute Alembic commands.",
          ],
        },
        {
          kind: "code",
          code: `Dockerfile`,
        },
        {
          kind: "code",
          code: `FROM python:3.12-slim

WORKDIR /app

RUN python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]`,
        },
      ],
    },
    {
      title: "Create the Compose file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Docker Compose file at compose.yaml. The backend service runs FastAPI and the db service runs PostgreSQL with persistent storage.",
          ],
        },
        {
          kind: "code",
          code: `compose.yaml`,
        },
        {
          kind: "code",
          code: `services:
  backend:
    build: .
    container_name: fastapi-06-alembic-migrations
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+psycopg://app_user:app_password@db:5432/app_db
    volumes:
      - .:/app
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    container_name: fastapi-06-alembic-db
    environment:
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: app_password
      POSTGRES_DB: app_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:`,
        },
      ],
    },
    {
      title: "Initialize Alembic",
      blocks: [
        {
          kind: "text",
          text: [
            "Initialize Alembic once from inside the Docker environment. This creates alembic.ini, alembic/env.py, and the alembic/versions folder.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic init alembic`,
        },
        {
          kind: "text",
          text: [
            "After initialization, edit alembic.ini and alembic/env.py so Alembic uses the same database URL and SQLAlchemy metadata as the FastAPI app.",
          ],
        },
      ],
    },
    {
      title: "Configure Alembic settings",
      blocks: [
        {
          kind: "text",
          text: [
            "In alembic.ini, keep the sqlalchemy.url value as a placeholder. The real database URL is read from the DATABASE_URL environment variable in env.py.",
          ],
        },
        {
          kind: "code",
          code: `alembic.ini`,
        },
        {
          kind: "code",
          code: `[alembic]
script_location = alembic

sqlalchemy.url = driver://user:pass@localhost/dbname`,
        },
        {
          kind: "text",
          text: [
            "Create or update alembic/env.py. Import the application models so Base.metadata contains the table definitions. Then read DATABASE_URL from the environment.",
          ],
        },
        {
          kind: "code",
          code: `alembic/env.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.database import Base
from app import models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.getenv("DATABASE_URL")

if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={
            "paramstyle": "named"
        },
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()`,
        },
        {
          kind: "text",
          text: [
            "The import from app import models is required. Without it, Alembic may not see the User and Post tables in Base.metadata.",
          ],
        },
      ],
    },
    {
      title: "Create the initial migration",
      blocks: [
        {
          kind: "text",
          text: [
            "Start PostgreSQL first, then generate the first migration from the SQLAlchemy models.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d db

docker compose run --rm backend alembic revision --autogenerate -m "create users and posts tables"`,
        },
        {
          kind: "text",
          text: [
            "Alembic creates a new file under alembic/versions. Review the generated migration before applying it.",
          ],
        },
        {
          kind: "code",
          code: `alembic/
  versions/
    202601010101_create_users_and_posts_tables.py`,
        },
      ],
    },
    {
      title: "Review generated migration",
      blocks: [
        {
          kind: "text",
          text: [
            "The generated migration should contain upgrade and downgrade functions. upgrade applies the schema change. downgrade reverses it.",
          ],
        },
        {
          kind: "code",
          code: `alembic/versions/<revision>_create_users_and_posts_tables.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from alembic import op
import sqlalchemy as sa


revision = "revision_id"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "posts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date_posted", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_posts_id"), "posts", ["id"], unique=False)
    op.create_index(op.f("ix_posts_user_id"), "posts", ["user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_posts_user_id"), table_name="posts")
    op.drop_index(op.f("ix_posts_id"), table_name="posts")
    op.drop_table("posts")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")`,
        },
        {
          kind: "text",
          text: [
            "The exact revision id and generated code can differ. The important part is that users and posts are created in upgrade and removed in downgrade.",
          ],
        },
      ],
    },
    {
      title: "Apply migrations",
      blocks: [
        {
          kind: "text",
          text: [
            "Apply all pending migrations to PostgreSQL. This creates the database schema.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic upgrade head`,
        },
        {
          kind: "text",
          text: [
            "After the migration is applied, start the FastAPI app.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up --build`,
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Inspect migration state",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Alembic commands to check the current revision, migration history, and pending migration status.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic current
docker compose run --rm backend alembic history
docker compose run --rm backend alembic heads`,
        },
        {
          kind: "text",
          text: [
            "The alembic_version table stores the currently applied migration revision in the database.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec db psql -U app_user -d app_db`,
        },
        {
          kind: "code",
          code: `select * from alembic_version;`,
        },
      ],
    },
    {
      title: "Add a new model field",
      blocks: [
        {
          kind: "text",
          text: [
            "When the model changes, generate a new migration. For example, add a nullable bio field to the User model.",
          ],
        },
        {
          kind: "code",
          code: `app/models.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `class User(Base):
    __tablename__ = "users"

    id = mapped_column(Integer, primary_key=True, index=True)
    username = mapped_column(String(50), unique=True, nullable=False, index=True)
    email = mapped_column(String(120), unique=True, nullable=False, index=True)
    bio = mapped_column(String(250), nullable=True)`,
        },
        {
          kind: "text",
          text: [
            "Generate a second migration from the model change.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic revision --autogenerate -m "add user bio"`,
        },
      ],
    },
    {
      title: "Review field migration",
      blocks: [
        {
          kind: "text",
          text: [
            "The generated migration should add the bio column in upgrade and remove it in downgrade.",
          ],
        },
        {
          kind: "code",
          code: `alembic/versions/<revision>_add_user_bio.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from alembic import op
import sqlalchemy as sa


revision = "revision_id"
down_revision = "previous_revision_id"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("bio", sa.String(length=250), nullable=True),
    )


def downgrade():
    op.drop_column("users", "bio")`,
        },
        {
          kind: "text",
          text: [
            "Review every generated migration before applying it. Autogenerate is a helper, not something to trust blindly.",
          ],
        },
      ],
    },
    {
      title: "Upgrade and rollback",
      blocks: [
        {
          kind: "text",
          text: [
            "Apply the latest migration with upgrade head. Roll back one migration with downgrade -1.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic upgrade head

docker compose run --rm backend alembic downgrade -1`,
        },
        {
          kind: "text",
          text: [
            "After rollback, apply the migration again when the schema change is needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend alembic upgrade head`,
        },
      ],
    },
    {
      title: "Inspect PostgreSQL schema",
      blocks: [
        {
          kind: "text",
          text: [
            "Use psql inside the PostgreSQL container to inspect tables, columns, indexes, and records.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec db psql -U app_user -d app_db`,
        },
        {
          kind: "code",
          code: `\\dt
\\d users
\\d posts
select * from alembic_version;
select id, username, email from users;`,
        },
      ],
    },
    {
      title: "Migration rules",
      blocks: [
        {
          kind: "text",
          text: [
            "Alembic migrations become the database change history. For real projects, keep migrations committed to source control and avoid editing old migrations after they have been applied by other environments.",
          ],
        },
        {
          kind: "code",
          code: `Use create_all
  quick local experiments only

Use Alembic
  real project schema changes

Generate migration
  after changing SQLAlchemy models

Review migration
  before applying

Upgrade
  apply schema changes

Downgrade
  rollback schema changes

Commit migrations
  keep database history with the codebase`,
        },
      ],
    },
    {
      title: "Stop or reset the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running containers without deleting PostgreSQL data.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose down`,
        },
        {
          kind: "text",
          text: [
            "Reset the database by deleting the PostgreSQL Docker volume. This removes all records and migration state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose down -v`,
        },
      ],
    },
  ],
}

export default entry