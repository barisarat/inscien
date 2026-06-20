import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-postgres-auth-repository-async",
  kind: "codenote",
  name: "FastAPI PostgreSQL Auth with Repository and Async SQLAlchemy",
  desc: "A Docker based FastAPI project that combines PostgreSQL, password authentication, repository pattern, and async SQLAlchemy.",
  intro:
    "This setup creates a stronger FastAPI backend slice. It uses PostgreSQL in Docker Compose, async SQLAlchemy for database access, Pydantic schemas for API contracts, password hashing for authentication, JWT tokens for protected routes, and repository classes to keep database logic outside route handlers.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the PostgreSQL, authentication, repository, and async SQLAlchemy example. This example is a more complete backend structure than the SQLite CRUD setup.",
          ],
        },
        {
          kind: "code",
          code: `03-postgres-auth-repository-async/
  app/
    __init__.py
    auth.py
    database.py
    main.py
    models.py
    repositories.py
    schemas.py
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 03-postgres-auth-repository-async
cd 03-postgres-auth-repository-async
mkdir app
touch app/__init__.py`,
        },
      ],
    },
    {
      title: "Create the async database connection",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the database setup file at app/database.py. This file defines the async PostgreSQL engine, async session factory, Base class, and FastAPI database dependency.",
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

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://app_user:app_password@db:5432/app_db",
)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session`,
        },
        {
          kind: "text",
          text: [
            "The database host is db because Docker Compose services communicate through service names. Inside the backend container, localhost means the backend container itself, not the PostgreSQL container.",
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
            "Create the database models file at app/models.py. User stores login identity and password hash. Post belongs to a user through a foreign key relationship.",
          ],
        },
        {
          kind: "code",
          code: `app/models.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    posts: Mapped[list["Post"]] = relationship(
        "Post",
        back_populates="author",
        cascade="all, delete-orphan",
    )


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    date_posted: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    author: Mapped[User] = relationship(
        "User",
        back_populates="posts",
    )`,
        },
        {
          kind: "text",
          text: [
            "The database model includes hashed_password, but the response schemas do not expose it. This keeps the database structure separate from the API contract.",
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
            "Create the schema file at app/schemas.py. These schemas define registration input, user output, token output, post input, post update, and post output.",
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


class Token(BaseModel):
    access_token: str
    token_type: str


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr = Field(max_length=120)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1)


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    user_id: int
    date_posted: datetime


class UserWithPosts(UserResponse):
    posts: list[PostResponse] = []`,
        },
        {
          kind: "text",
          text: [
            "UserCreate accepts a plain password only at the API boundary. The database stores hashed_password instead. UserResponse excludes password fields completely.",
          ],
        },
      ],
    },
    {
      title: "Create the repository layer",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the repository file at app/repositories.py. Repository classes keep SQLAlchemy query logic outside FastAPI route functions.",
          ],
        },
        {
          kind: "code",
          code: `app/repositories.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int):
        result = await self.db.execute(
            select(models.User).where(models.User.id == user_id)
        )

        return result.scalar_one_or_none()

    async def get_with_posts(self, user_id: int):
        result = await self.db.execute(
            select(models.User)
            .options(selectinload(models.User.posts))
            .where(models.User.id == user_id)
        )

        return result.scalar_one_or_none()

    async def get_by_username(self, username: str):
        result = await self.db.execute(
            select(models.User).where(models.User.username == username)
        )

        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, username: str, email: str):
        result = await self.db.execute(
            select(models.User).where(
                or_(
                    models.User.username == username,
                    models.User.email == email,
                )
            )
        )

        return result.scalar_one_or_none()

    async def create(self, username: str, email: str, hashed_password: str):
        user = models.User(
            username=username,
            email=email,
            hashed_password=hashed_password,
        )

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        return user


class PostRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_all(self):
        result = await self.db.execute(
            select(models.Post).order_by(models.Post.id)
        )

        return result.scalars().all()

    async def get_by_id(self, post_id: int):
        result = await self.db.execute(
            select(models.Post).where(models.Post.id == post_id)
        )

        return result.scalar_one_or_none()

    async def create(self, title: str, content: str, user_id: int):
        post = models.Post(
            title=title,
            content=content,
            user_id=user_id,
        )

        self.db.add(post)
        await self.db.commit()
        await self.db.refresh(post)

        return post

    async def update(self, post, update_data):
        for field, value in update_data.items():
            setattr(post, field, value)

        await self.db.commit()
        await self.db.refresh(post)

        return post

    async def delete(self, post):
        await self.db.delete(post)
        await self.db.commit()`,
        },
        {
          kind: "text",
          text: [
            "The repository is useful here because auth, users, and posts need repeated database access. The route layer can focus on HTTP behavior while repositories handle query details.",
          ],
        },
      ],
    },
    {
      title: "Create the authentication utilities",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the authentication file at app/auth.py. This file hashes passwords, verifies login passwords, creates JWT tokens, and resolves the current authenticated user.",
          ],
        },
        {
          kind: "code",
          code: `app/auth.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `import os
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.repositories import UserRepository

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/token",
)


def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


def get_password_hash(password: str):
    return pwd_context.hash(password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update(
        {
            "exp": expire,
        }
    )

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        username = payload.get("sub")

        if username is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    repo = UserRepository(db)
    user = await repo.get_by_username(username)

    if user is None:
        raise credentials_exception

    return user`,
        },
        {
          kind: "text",
          text: [
            "The token subject stores the username. Protected routes use get_current_user to decode the token and load the user from the database.",
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
            "Create the main application file at app/main.py. This file creates database tables on startup, registers users, logs users in, and protects post creation with JWT authentication.",
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
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.auth import create_access_token, get_current_user, get_password_hash, verify_password
from app.database import Base, engine, get_db
from app.repositories import PostRepository, UserRepository
from app.schemas import (
    PostCreate,
    PostResponse,
    PostUpdate,
    Token,
    UserCreate,
    UserResponse,
    UserWithPosts,
)


@asynccontextmanager
async def lifespan(_app):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield


app = FastAPI(
    title="03 PostgreSQL Auth Repository Async",
    lifespan=lifespan,
)


@app.get("/")
def home():
    return {
        "message": "FastAPI PostgreSQL auth repository async example"
    }


@app.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = UserRepository(db)

    existing_user = await repo.get_by_username_or_email(
        payload.username,
        payload.email,
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    hashed_password = get_password_hash(payload.password)

    user = await repo.create(
        username=payload.username,
        email=payload.email,
        hashed_password=hashed_password,
    )

    return user


@app.post("/auth/token", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = UserRepository(db)
    user = await repo.get_by_username(form_data.username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get("/users/me", response_model=UserResponse)
async def read_current_user(
    current_user: Annotated[models.User, Depends(get_current_user)],
):
    return current_user


@app.get("/users/{user_id}", response_model=UserWithPosts)
async def read_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = UserRepository(db)
    user = await repo.get_with_posts(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@app.post(
    "/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_post(
    payload: PostCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = PostRepository(db)

    post = await repo.create(
        title=payload.title,
        content=payload.content,
        user_id=current_user.id,
    )

    return post


@app.get("/posts", response_model=list[PostResponse])
async def list_posts(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = PostRepository(db)

    return await repo.list_all()


@app.get("/posts/{post_id}", response_model=PostResponse)
async def read_post(
    post_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = PostRepository(db)
    post = await repo.get_by_id(post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    return post


@app.patch("/posts/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    payload: PostUpdate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = PostRepository(db)
    post = await repo.get_by_id(post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can update this post",
        )

    update_data = payload.model_dump(exclude_unset=True)

    return await repo.update(
        post,
        update_data,
    )


@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    repo = PostRepository(db)
    post = await repo.get_by_id(post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete this post",
        )

    await repo.delete(post)

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
            "Create the dependency file at requirements.txt. asyncpg is the async PostgreSQL driver. python-multipart is required for OAuth2PasswordRequestForm in the login route.",
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
asyncpg
email-validator
passlib[bcrypt]
python-jose[cryptography]
python-multipart`,
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
            "Create the Docker Compose file at compose.yaml. This runs the FastAPI backend and PostgreSQL database together. PostgreSQL data is stored in a named Docker volume.",
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
    container_name: fastapi-03-postgres-auth-repository-async
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://app_user:app_password@db:5432/app_db
      SECRET_KEY: change-this-dev-secret
    volumes:
      - .:/app
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    container_name: fastapi-03-postgres-db
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
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder. The backend connects to PostgreSQL through the db service name and creates the tables during FastAPI startup.",
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
            "Open the API docs page to test registration, login, and protected routes.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Register and login",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a user through POST /auth/register. The password is accepted in the request but only the hashed password is stored in the database.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "baris",
  "email": "baris@example.com",
  "password": "strongpassword123"
}`,
        },
        {
          kind: "text",
          text: [
            "Log in through POST /auth/token. In the Swagger UI, use username and password form fields. The response returns a bearer token.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "access_token": "jwt-token-value",
  "token_type": "bearer"
}`,
        },
      ],
    },
    {
      title: "Use protected routes",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the Authorize button in the Swagger UI and paste the access token. Then protected routes can resolve the current user from the token.",
          ],
        },
        {
          kind: "code",
          code: `GET /users/me
POST /posts
PATCH /posts/1
DELETE /posts/1`,
        },
        {
          kind: "text",
          text: [
            "Create a post through POST /posts. The backend assigns user_id from the authenticated user instead of accepting it from the client.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "title": "PostgreSQL Auth Example",
  "content": "This post belongs to the authenticated user."
}`,
        },
      ],
    },
    {
      title: "Repository pattern role",
      blocks: [
        {
          kind: "text",
          text: [
            "The route layer handles HTTP behavior such as status codes, authentication, and validation errors. The repository layer handles SQLAlchemy queries, persistence, updates, and deletes.",
          ],
        },
        {
          kind: "code",
          code: `Route function
  handles request and response behavior

Repository
  handles database query logic

AsyncSession
  works as the database unit of work

SQLAlchemy model
  defines table structure

Pydantic schema
  defines API input and output`,
        },
      ],
    },
    {
      title: "Async SQLAlchemy role",
      blocks: [
        {
          kind: "text",
          text: [
            "Async SQLAlchemy uses await for database operations. This lets the FastAPI server continue handling other work while waiting for PostgreSQL.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `result = await db.execute(
    select(models.User).where(models.User.username == username)
)

user = result.scalar_one_or_none()`,
        },
        {
          kind: "text",
          text: [
            "Use async database access when the application is I/O heavy, uses async libraries, or needs to handle many concurrent requests.",
          ],
        },
      ],
    },
    {
      title: "Inspect PostgreSQL data",
      blocks: [
        {
          kind: "text",
          text: [
            "Open a psql shell inside the PostgreSQL container to inspect the created tables and records.",
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
select id, username, email from users;
select id, title, user_id from posts;`,
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
            "Reset the project by removing the PostgreSQL volume. This deletes the database records.",
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