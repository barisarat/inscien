import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-sqlalchemy-crud",
  kind: "codenote",
  name: "FastAPI SQLAlchemy CRUD with SQLite",
  desc: "A Docker based FastAPI project that combines Pydantic schemas, SQLAlchemy models, SQLite, CRUD routes, and user-post relationships.",
  intro:
    "This setup creates a complete small FastAPI backend slice. It uses Pydantic schemas for request and response contracts, SQLAlchemy models for database tables, SQLite for local persistence, and CRUD routes for users and posts.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the SQLAlchemy CRUD example. This example builds on the Docker setup pattern but adds a database layer, schemas, models, and route handlers.",
          ],
        },
        {
          kind: "code",
          code: `02-sqlalchemy-crud/
  app/
    __init__.py
    database.py
    main.py
    models.py
    schemas.py
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 02-sqlalchemy-crud
cd 02-sqlalchemy-crud
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
            "Create the database setup file at app/database.py. This file defines the SQLAlchemy engine, session factory, Base class, and FastAPI dependency used by routes.",
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

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/app.db")

connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)

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
            "The SessionLocal object creates database sessions. The get_db dependency opens one session for the request and closes it after the route finishes.",
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
            "Create the database models file at app/models.py. User and Post are SQLAlchemy models that map to database tables. The relationship allows a user to own many posts.",
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

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)

    posts = relationship(
        "Post",
        back_populates="author",
        cascade="all, delete-orphan",
    )


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    date_posted = Column(
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
            "The cascade setting means that deleting a user also deletes that user's posts. This keeps the user-post relationship consistent.",
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
            "Create the schema file at app/schemas.py. These Pydantic models define request bodies, update bodies, and response shapes.",
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


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr = Field(max_length=120)


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=120)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PostBase(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1)


class PostResponse(PostBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    date_posted: datetime


class UserWithPosts(UserResponse):
    posts: list[PostResponse] = []`,
        },
        {
          kind: "text",
          text: [
            "UserCreate and PostCreate describe incoming request bodies. UserResponse, PostResponse, and UserWithPosts control what the API sends back.",
          ],
        },
      ],
    },
    {
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main application file at app/main.py. This file creates the database tables on startup and defines the user and post CRUD routes.",
          ],
        },
        {
          kind: "code",
          code: `app/main.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.database import Base, engine, get_db
from app.schemas import (
    PostCreate,
    PostResponse,
    PostUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
    UserWithPosts,
)


@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="02 SQLAlchemy CRUD",
    lifespan=lifespan,
)


@app.get("/")
def home():
    return {
        "message": "FastAPI SQLAlchemy CRUD example"
    }


@app.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    existing_user = db.execute(
        select(models.User).where(
            or_(
                models.User.username == user.username,
                models.User.email == user.email,
            )
        )
    ).scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    db_user = models.User(
        username=user.username,
        email=user.email,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user


@app.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    users = db.execute(
        select(models.User).order_by(models.User.id)
    ).scalars().all()

    return users


@app.get("/users/{user_id}", response_model=UserWithPosts)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(models.User)
        .options(selectinload(models.User.posts))
        .where(models.User.id == user_id)
    ).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@app.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return user


@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.delete(user)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/users/{user_id}/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    user_id: int,
    post: PostCreate,
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db_post = models.Post(
        title=post.title,
        content=post.content,
        user_id=user.id,
    )

    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    return db_post


@app.get("/posts", response_model=list[PostResponse])
def list_posts(db: Session = Depends(get_db)):
    posts = db.execute(
        select(models.Post).order_by(models.Post.id)
    ).scalars().all()

    return posts


@app.get("/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
):
    post = db.get(models.Post, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    return post


@app.patch("/posts/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    payload: PostUpdate,
    db: Session = Depends(get_db),
):
    post = db.get(models.Post, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(post, field, value)

    db.commit()
    db.refresh(post)

    return post


@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
):
    post = db.get(models.Post, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    db.delete(post)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)`,
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. SQLAlchemy handles the database layer and email-validator supports EmailStr in the Pydantic schema.",
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
            "Create the Dockerfile at the project root. The container owns the Python environment and runs the FastAPI app with Uvicorn.",
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
            "Create the Docker Compose file at compose.yaml. The app code is mounted into the container and the SQLite database file is stored in a named Docker volume.",
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
    container_name: fastapi-02-sqlalchemy-crud
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: sqlite:////data/app.db
    volumes:
      - .:/app
      - sqlite_data:/data

volumes:
  sqlite_data:`,
        },
      ],
    },
    {
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder. The app creates the SQLite database tables during FastAPI startup.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up --build`,
        },
        {
          kind: "text",
          text: [
            "Open the API docs page to test the routes from the browser.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Create and read users",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a user through POST /users. The request body is validated by UserCreate and the response is shaped by UserResponse.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "baris",
  "email": "baris@example.com"
}`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "baris",
  "email": "baris@example.com",
  "id": 1
}`,
        },
        {
          kind: "text",
          text: [
            "List users with GET /users or open a single user with GET /users/1.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/users
http://localhost:8000/users/1`,
        },
      ],
    },
    {
      title: "Create and read posts",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a post for an existing user through POST /users/1/posts. The user_id comes from the URL and is assigned by the backend.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "title": "First FastAPI Post",
  "content": "This post belongs to user 1."
}`,
        },
        {
          kind: "text",
          text: [
            "List posts with GET /posts or open a single post with GET /posts/1.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/posts
http://localhost:8000/posts/1`,
        },
      ],
    },
    {
      title: "Read relationship data",
      blocks: [
        {
          kind: "text",
          text: [
            "Open GET /users/1 after creating posts. The UserWithPosts response model returns the user with nested posts.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/users/1`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "baris",
  "email": "baris@example.com",
  "id": 1,
  "posts": [
    {
      "title": "First FastAPI Post",
      "content": "This post belongs to user 1.",
      "id": 1,
      "user_id": 1,
      "date_posted": "2026-01-01T12:00:00"
    }
  ]
}`,
        },
      ],
    },
    {
      title: "Update and delete records",
      blocks: [
        {
          kind: "text",
          text: [
            "Use PATCH routes for partial updates. The schema only applies fields that are sent in the request body.",
          ],
        },
        {
          kind: "code",
          code: `PATCH /users/1
PATCH /posts/1`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "updated-baris"
}`,
        },
        {
          kind: "text",
          text: [
            "Use DELETE routes to remove records. Deleting a user also deletes that user's posts because the relationship uses delete-orphan cascade.",
          ],
        },
        {
          kind: "code",
          code: `DELETE /posts/1
DELETE /users/1`,
        },
      ],
    },
    {
      title: "Mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "This example separates API contracts from database models. Pydantic schemas describe what enters and leaves the API. SQLAlchemy models describe how data is stored.",
          ],
        },
        {
          kind: "code",
          code: `UserCreate
  incoming request body

UserResponse
  outgoing response body

User
  SQLAlchemy database model

Session
  database unit of work for one request

Route function
  validates input
  uses database session
  returns response model`,
        },
      ],
    },
    {
      title: "Stop the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running container from the active Docker Compose terminal or shut it down from another terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Press this in the running terminal
CTRL + C

# Or run this from another terminal
docker compose down`,
        },
      ],
    },
  ],
}

export default entry