import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-authentication-authorization",
  kind: "codenote",
  name: "FastAPI Authentication and Authorization",
  desc: "A Docker based FastAPI project that separates password authentication, JWT current-user resolution, role based authorization, and owner based permissions.",
  intro:
    "This setup creates a focused FastAPI authentication and authorization example. It shows how to register users, hash passwords, log in with JWT tokens, resolve the current user, protect routes, check admin role access, and enforce owner based permissions.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the authentication and authorization example. This project keeps auth logic, database setup, models, schemas, and routes in separate files.",
          ],
        },
        {
          kind: "code",
          code: `04-authentication-authorization/
  app/
    __init__.py
    auth.py
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
          code: `mkdir 04-authentication-authorization
cd 04-authentication-authorization
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
            "Create the database setup file at app/database.py. This example uses SQLite in a Docker volume so the auth flow can run without a separate database container.",
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
      ],
    },
    {
      title: "Create the SQLAlchemy models",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the database models file at app/models.py. User stores login identity, password hash, and role. Post belongs to a user and is used for owner based authorization.",
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

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)

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
      ],
    },
    {
      title: "Create the Pydantic schemas",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the schema file at app/schemas.py. These schemas define registration input, token output, user output, post creation, post update, and post response.",
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
    is_admin: bool


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
    date_posted: datetime`,
        },
        {
          kind: "text",
          text: [
            "The request schema accepts a plain password only during registration. The database stores hashed_password, and the response schema never exposes password fields.",
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
            "Create the authentication utility file at app/auth.py. This file handles password hashing, password verification, JWT creation, current user resolution, and admin authorization.",
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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

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


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data):
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


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
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

    user = db.execute(
        select(models.User).where(models.User.username == username)
    ).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


def require_admin(
    current_user: Annotated[models.User, Depends(get_current_user)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return current_user`,
        },
      ],
    },
    {
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main application file at app/main.py. This file creates the tables, registers users, logs users in, protects routes, checks admin access, and checks post ownership.",
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
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import models
from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    require_admin,
    verify_password,
)
from app.database import Base, engine, get_db
from app.schemas import (
    PostCreate,
    PostResponse,
    PostUpdate,
    Token,
    UserCreate,
    UserResponse,
)


@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="04 Authentication Authorization",
    lifespan=lifespan,
)


@app.get("/")
def home():
    return {
        "message": "FastAPI authentication and authorization example"
    }


@app.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
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

    user_count = db.execute(
        select(models.User)
    ).scalars().all()

    user = models.User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        is_admin=len(user_count) == 0,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@app.post("/auth/token", response_model=Token)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.execute(
        select(models.User).where(models.User.username == form_data.username)
    ).scalar_one_or_none()

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
def read_current_user(
    current_user: Annotated[models.User, Depends(get_current_user)],
):
    return current_user


@app.get("/admin/users", response_model=list[UserResponse])
def list_users_for_admin(
    _admin_user: Annotated[models.User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    users = db.execute(
        select(models.User).order_by(models.User.id)
    ).scalars().all()

    return users


@app.post(
    "/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    payload: PostCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    post = models.Post(
        title=payload.title,
        content=payload.content,
        user_id=current_user.id,
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    return post


@app.get("/posts", response_model=list[PostResponse])
def list_posts(
    db: Annotated[Session, Depends(get_db)],
):
    posts = db.execute(
        select(models.Post).order_by(models.Post.id)
    ).scalars().all()

    return posts


@app.patch("/posts/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    payload: PostUpdate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    post = db.get(models.Post, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    if post.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner or an admin can update this post",
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
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    post = db.get(models.Post, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    if post.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner or an admin can delete this post",
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
            "Create the dependency file at requirements.txt. python-multipart is required for OAuth2PasswordRequestForm. passlib handles password hashing. python-jose handles JWT tokens.",
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
            "Create the Docker Compose file at compose.yaml. The SQLite database is stored in a named Docker volume and SECRET_KEY is passed as an environment variable.",
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
    container_name: fastapi-04-authentication-authorization
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: sqlite:////data/app.db
      SECRET_KEY: change-this-dev-secret
    volumes:
      - .:/app
      - auth_data:/data

volumes:
  auth_data:`,
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
            "Open the API docs page to test registration, login, protected routes, and authorization rules.",
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
            "Create the first user through POST /auth/register. The first registered user becomes admin in this sample so the admin route can be tested immediately.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "admin",
  "email": "admin@example.com",
  "password": "strongpassword123"
}`,
        },
        {
          kind: "text",
          text: [
            "Log in through POST /auth/token. The Swagger UI shows username and password form fields for this route.",
          ],
        },
        {
          kind: "code",
          code: `username: admin
password: strongpassword123`,
        },
        {
          kind: "text",
          text: [
            "The response returns a bearer token.",
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
            "Use the Authorize button in Swagger UI and paste the access token. After that, protected routes can resolve the current user.",
          ],
        },
        {
          kind: "code",
          code: `GET /users/me
POST /posts
PATCH /posts/{post_id}
DELETE /posts/{post_id}`,
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
  "title": "Authenticated Post",
  "content": "This post belongs to the current user."
}`,
        },
      ],
    },
    {
      title: "Authorization rules",
      blocks: [
        {
          kind: "text",
          text: [
            "Authentication checks who the user is. Authorization checks what the user is allowed to do.",
          ],
        },
        {
          kind: "code",
          code: `GET /users/me
  requires any logged in user

GET /admin/users
  requires admin user

PATCH /posts/{post_id}
  requires post owner or admin

DELETE /posts/{post_id}
  requires post owner or admin`,
        },
        {
          kind: "text",
          text: [
            "The current user is loaded from the JWT token. Admin access is checked with require_admin. Owner access is checked by comparing post.user_id with current_user.id.",
          ],
        },
      ],
    },
    {
      title: "Mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "The authentication layer should not be mixed with the authorization rules. Keep current-user resolution, role checks, and ownership checks as separate concepts.",
          ],
        },
        {
          kind: "code",
          code: `Password hashing
  stores safe password hash

JWT token
  carries login identity

get_current_user
  converts token into database user

require_admin
  checks role based permission

owner check
  compares resource owner with current user

route function
  combines the required access rule with the operation`,
        },
      ],
    },
    {
      title: "Stop or reset the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running container without deleting the SQLite data.",
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
            "Reset the project by removing the Docker volume. This deletes the SQLite database records.",
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