import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-testing-pytest",
  kind: "codenote",
  name: "FastAPI Testing with Pytest",
  desc: "A Docker based FastAPI testing setup that covers route tests, validation tests, database dependency overrides, authentication tests, and authorization tests.",
  intro:
    "This setup creates a focused FastAPI testing project. It uses pytest, FastAPI TestClient, a separate SQLite test database, dependency overrides, password authentication tests, protected route tests, and authorization behavior tests.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the testing example. The app code is intentionally small, while the test suite shows how to test normal routes, validation errors, authentication, protected routes, and owner based authorization.",
          ],
        },
        {
          kind: "code",
          code: `05-testing-pytest/
  app/
    __init__.py
    auth.py
    database.py
    main.py
    models.py
    schemas.py
  tests/
    __init__.py
    conftest.py
    test_auth.py
    test_posts.py
    test_validation.py
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 05-testing-pytest
cd 05-testing-pytest
mkdir app tests
touch app/__init__.py tests/__init__.py`,
        },
      ],
    },
    {
      title: "Create the database connection",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the database setup file at app/database.py. The application uses SQLite by default, and the tests override get_db with a separate test database session.",
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
            "Create the database models file at app/models.py. The test suite uses User for authentication and Post for protected owner based behavior.",
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
            "Create the schema file at app/schemas.py. Tests will verify that invalid request bodies fail and valid request bodies return controlled response models.",
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
      ],
    },
    {
      title: "Create the authentication utilities",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the authentication utility file at app/auth.py. Tests use the same password hashing, token creation, current-user resolution, and admin checks as the application.",
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
            "Create the main application file at app/main.py. The routes are small but include enough behavior for meaningful tests: registration, login, current user, admin route, post creation, post update, and post deletion.",
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
    title="05 Testing Pytest",
    lifespan=lifespan,
)


@app.get("/")
def home():
    return {
        "message": "FastAPI testing example"
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
      title: "Create the test fixtures",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the pytest fixture file at tests/conftest.py. This file builds an isolated test database, overrides the application database dependency, and exposes helper fixtures for users and auth headers.",
          ],
        },
        {
          kind: "code",
          code: `tests/conftest.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

os.environ["SECRET_KEY"] = "test-secret-key"


@pytest.fixture()
def test_db():
    db_file = tempfile.NamedTemporaryFile(delete=False)
    db_file.close()

    database_url = f"sqlite:///{db_file.name}"

    engine = create_engine(
        database_url,
        connect_args={
            "check_same_thread": False
        },
    )

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    os.unlink(db_file.name)


@pytest.fixture()
def client(test_db):
    return TestClient(app)


@pytest.fixture()
def admin_payload():
    return {
        "username": "admin",
        "email": "admin@example.com",
        "password": "strongpassword123",
    }


@pytest.fixture()
def user_payload():
    return {
        "username": "user",
        "email": "user@example.com",
        "password": "strongpassword123",
    }


def register_user(client, payload):
    return client.post(
        "/auth/register",
        json=payload,
    )


def login_user(client, username, password):
    return client.post(
        "/auth/token",
        data={
            "username": username,
            "password": password,
        },
    )


@pytest.fixture()
def admin_token(client, admin_payload):
    register_user(client, admin_payload)

    response = login_user(
        client,
        admin_payload["username"],
        admin_payload["password"],
    )

    return response.json()["access_token"]


@pytest.fixture()
def user_token(client, admin_payload, user_payload):
    register_user(client, admin_payload)
    register_user(client, user_payload)

    response = login_user(
        client,
        user_payload["username"],
        user_payload["password"],
    )

    return response.json()["access_token"]


@pytest.fixture()
def admin_headers(admin_token):
    return {
        "Authorization": f"Bearer {admin_token}"
    }


@pytest.fixture()
def user_headers(user_token):
    return {
        "Authorization": f"Bearer {user_token}"
    }`,
        },
        {
          kind: "text",
          text: [
            "The dependency override is the key testing pattern. The app normally uses get_db from app/database.py, but tests replace it with a temporary test database session.",
          ],
        },
      ],
    },
    {
      title: "Create authentication tests",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the authentication test file at tests/test_auth.py. These tests cover registration, duplicate users, login, current-user resolution, and admin-only access.",
          ],
        },
        {
          kind: "code",
          code: `tests/test_auth.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from tests.conftest import login_user, register_user


def test_register_user_returns_user_without_password(client, admin_payload):
    response = register_user(client, admin_payload)

    assert response.status_code == 201

    data = response.json()

    assert data["username"] == "admin"
    assert data["email"] == "admin@example.com"
    assert data["is_admin"] is True
    assert "id" in data
    assert "password" not in data
    assert "hashed_password" not in data


def test_duplicate_username_or_email_returns_conflict(client, admin_payload):
    first_response = register_user(client, admin_payload)
    second_response = register_user(client, admin_payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Username or email already exists"


def test_login_returns_bearer_token(client, admin_payload):
    register_user(client, admin_payload)

    response = login_user(
        client,
        admin_payload["username"],
        admin_payload["password"],
    )

    assert response.status_code == 200

    data = response.json()

    assert data["token_type"] == "bearer"
    assert data["access_token"]


def test_login_with_wrong_password_returns_unauthorized(client, admin_payload):
    register_user(client, admin_payload)

    response = login_user(
        client,
        admin_payload["username"],
        "wrong-password",
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"


def test_users_me_requires_token(client):
    response = client.get("/users/me")

    assert response.status_code == 401


def test_users_me_returns_current_user(client, admin_headers):
    response = client.get(
        "/users/me",
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["username"] == "admin"


def test_admin_route_allows_admin(client, admin_headers):
    response = client.get(
        "/admin/users",
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_admin_route_rejects_normal_user(client, user_headers):
    response = client.get(
        "/admin/users",
        headers=user_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"`,
        },
      ],
    },
    {
      title: "Create post authorization tests",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the post test file at tests/test_posts.py. These tests cover protected post creation, listing posts, owner updates, non-owner rejection, and admin override behavior.",
          ],
        },
        {
          kind: "code",
          code: `tests/test_posts.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `def create_post(client, headers):
    return client.post(
        "/posts",
        json={
            "title": "First Post",
            "content": "This is a protected post.",
        },
        headers=headers,
    )


def test_create_post_requires_authentication(client):
    response = client.post(
        "/posts",
        json={
            "title": "First Post",
            "content": "This is a protected post.",
        },
    )

    assert response.status_code == 401


def test_create_post_with_token_returns_post(client, user_headers):
    response = create_post(client, user_headers)

    assert response.status_code == 201

    data = response.json()

    assert data["title"] == "First Post"
    assert data["content"] == "This is a protected post."
    assert data["user_id"] == 2


def test_list_posts_returns_created_posts(client, user_headers):
    create_post(client, user_headers)

    response = client.get("/posts")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_owner_can_update_own_post(client, user_headers):
    create_response = create_post(client, user_headers)
    post_id = create_response.json()["id"]

    response = client.patch(
        f"/posts/{post_id}",
        json={
            "title": "Updated Post"
        },
        headers=user_headers,
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated Post"


def test_non_owner_cannot_update_post(client, admin_headers, user_headers):
    create_response = create_post(client, admin_headers)
    post_id = create_response.json()["id"]

    response = client.patch(
        f"/posts/{post_id}",
        json={
            "title": "Blocked Update"
        },
        headers=user_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only the owner or an admin can update this post"


def test_admin_can_update_other_users_post(client, admin_headers, user_headers):
    create_response = create_post(client, user_headers)
    post_id = create_response.json()["id"]

    response = client.patch(
        f"/posts/{post_id}",
        json={
            "title": "Admin Update"
        },
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Admin Update"


def test_owner_can_delete_own_post(client, user_headers):
    create_response = create_post(client, user_headers)
    post_id = create_response.json()["id"]

    response = client.delete(
        f"/posts/{post_id}",
        headers=user_headers,
    )

    assert response.status_code == 204

    list_response = client.get("/posts")

    assert list_response.status_code == 200
    assert list_response.json() == []`,
        },
      ],
    },
    {
      title: "Create validation tests",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the validation test file at tests/test_validation.py. These tests confirm that FastAPI and Pydantic reject invalid request bodies before route logic succeeds.",
          ],
        },
        {
          kind: "code",
          code: `tests/test_validation.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `def test_register_rejects_invalid_email(client):
    response = client.post(
        "/auth/register",
        json={
            "username": "bademail",
            "email": "not-an-email",
            "password": "strongpassword123",
        },
    )

    assert response.status_code == 422


def test_register_rejects_short_password(client):
    response = client.post(
        "/auth/register",
        json={
            "username": "shortpassword",
            "email": "short@example.com",
            "password": "short",
        },
    )

    assert response.status_code == 422


def test_create_post_rejects_empty_title(client, user_headers):
    response = client.post(
        "/posts",
        json={
            "title": "",
            "content": "Content is present.",
        },
        headers=user_headers,
    )

    assert response.status_code == 422


def test_patch_post_rejects_empty_title(client, user_headers):
    create_response = client.post(
        "/posts",
        json={
            "title": "Valid Title",
            "content": "Valid content.",
        },
        headers=user_headers,
    )

    post_id = create_response.json()["id"]

    response = client.patch(
        f"/posts/{post_id}",
        json={
            "title": ""
        },
        headers=user_headers,
    )

    assert response.status_code == 422`,
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. pytest runs the tests. httpx is used by FastAPI TestClient. python-multipart is required for OAuth2PasswordRequestForm.",
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
python-multipart
pytest
httpx`,
        },
      ],
    },
    {
      title: "Create the Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Dockerfile at the project root. The same image can run the FastAPI app or the pytest test suite.",
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
            "Create the Docker Compose file at compose.yaml. The app service can be used for browser testing, while the same built image can also run pytest commands.",
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
    container_name: fastapi-05-testing-pytest
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: sqlite:////data/app.db
      SECRET_KEY: change-this-dev-secret
    volumes:
      - .:/app
      - testing_data:/data

volumes:
  testing_data:`,
        },
      ],
    },
    {
      title: "Run the application",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the FastAPI application from inside the project folder when the routes need to be tested manually from the browser.",
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
      title: "Run the tests",
      blocks: [
        {
          kind: "text",
          text: [
            "Run pytest inside the Docker environment. The tests use a temporary SQLite file and do not depend on the application database volume.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend pytest`,
        },
        {
          kind: "text",
          text: [
            "Run a single test file when working on a specific behavior.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm backend pytest tests/test_auth.py
docker compose run --rm backend pytest tests/test_posts.py
docker compose run --rm backend pytest tests/test_validation.py`,
        },
      ],
    },
    {
      title: "Testing mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "FastAPI tests should verify behavior from the API boundary. The tests send HTTP requests to the app, assert status codes, inspect JSON responses, and override dependencies when isolation is needed.",
          ],
        },
        {
          kind: "code",
          code: `TestClient
  sends HTTP requests to the FastAPI app

dependency_overrides
  replaces production dependencies during tests

test database
  isolates test records from development records

fixtures
  prepare client, users, tokens, and headers

auth tests
  check register, login, current user, and admin access

authorization tests
  check owner rules and forbidden access

validation tests
  check invalid request bodies return 422`,
        },
      ],
    },
    {
      title: "Stop or reset the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running application container without deleting the SQLite data.",
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
            "Reset the application database volume when manual browser testing data should be cleared.",
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