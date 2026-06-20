import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-settings-environment",
  kind: "codenote",
  name: "FastAPI Settings and Environment Variables",
  desc: "A Docker based FastAPI project that uses Pydantic settings, .env files, Docker Compose environment values, and validated application configuration.",
  intro:
    "This setup creates a clean configuration pattern for FastAPI projects. Settings are loaded from environment variables, .env files, and Docker Compose values, then exposed through a typed settings object used by the application, database layer, CORS setup, and authentication configuration.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the settings and environment configuration example. This project keeps configuration in app/config.py and uses .env files for local values.",
          ],
        },
        {
          kind: "code",
          code: `07-settings-environment/
  app/
    __init__.py
    config.py
    database.py
    main.py
  .env
  .env.example
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 07-settings-environment
cd 07-settings-environment
mkdir app
touch app/__init__.py`,
        },
      ],
    },
    {
      title: "Create the example environment file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create .env.example as the safe reference file that can be committed to source control. It documents all required settings without storing real secrets.",
          ],
        },
        {
          kind: "code",
          code: `.env.example`,
        },
        {
          kind: "code",
          code: `APP_NAME=FastAPI Settings Example
ENVIRONMENT=development
DEBUG=true

DATABASE_URL=sqlite:////data/app.db

SECRET_KEY=change-this-dev-secret
ACCESS_TOKEN_EXPIRE_MINUTES=30

CORS_ORIGINS=http://localhost:3000,http://localhost:8000`,
        },
      ],
    },
    {
      title: "Create the local environment file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create .env for local development values. This file can contain secrets and should not be committed to source control.",
          ],
        },
        {
          kind: "code",
          code: `.env`,
        },
        {
          kind: "code",
          code: `APP_NAME=FastAPI Settings Example
ENVIRONMENT=development
DEBUG=true

DATABASE_URL=sqlite:////data/app.db

SECRET_KEY=local-dev-secret-value
ACCESS_TOKEN_EXPIRE_MINUTES=30

CORS_ORIGINS=http://localhost:3000,http://localhost:8000`,
        },
        {
          kind: "text",
          text: [
            "Add .env to .gitignore in real projects so local secrets do not enter the repository.",
          ],
        },
        {
          kind: "code",
          code: `.gitignore`,
        },
        {
          kind: "code",
          code: `.env
__pycache__/
.pytest_cache/
*.db`,
        },
      ],
    },
    {
      title: "Create the settings object",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the settings file at app/config.py. This file loads environment values into one validated Settings object that the rest of the app can import.",
          ],
        },
        {
          kind: "code",
          code: `app/config.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "FastAPI Settings Example"
    environment: str = "development"
    debug: bool = False

    database_url: str = "sqlite:////data/app.db"

    secret_key: str = Field(min_length=16)
    access_token_expire_minutes: int = Field(default=30, ge=1)

    cors_origins: list[str] = []

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            return [
                item.strip()
                for item in value.split(",")
                if item.strip()
            ]

        return value

    @property
    def is_development(self):
        return self.environment == "development"

    @property
    def is_production(self):
        return self.environment == "production"


@lru_cache
def get_settings():
    return Settings()`,
        },
        {
          kind: "text",
          text: [
            "The lru_cache wrapper keeps one settings instance instead of rebuilding it on every import or request.",
          ],
        },
      ],
    },
    {
      title: "Create the database connection",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the database setup file at app/database.py. The database URL comes from the shared settings object instead of being hardcoded in the database file.",
          ],
        },
        {
          kind: "code",
          code: `app/database.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

connect_args = {}

if settings.database_url.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False
    }

engine = create_engine(
    settings.database_url,
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
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main application file at app/main.py. The app reads settings for the application title, debug flag, CORS origins, and safe runtime configuration output.",
          ],
        },
        {
          kind: "code",
          code: `app/main.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "FastAPI settings environment example",
        "environment": settings.environment,
    }


@app.get("/config/public")
def public_config():
    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "debug": settings.debug,
        "cors_origins": settings.cors_origins,
        "access_token_expire_minutes": settings.access_token_expire_minutes,
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }`,
        },
        {
          kind: "text",
          text: [
            "The public config route intentionally excludes SECRET_KEY and DATABASE_URL. Secrets should not be returned from API routes.",
          ],
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. pydantic-settings provides the BaseSettings class for environment based configuration.",
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
pydantic-settings`,
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
            "Create the Docker Compose file at compose.yaml. The env_file loads .env values into the backend container, and the environment block can override specific values when needed.",
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
    container_name: fastapi-07-settings-environment
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      DATABASE_URL: sqlite:////data/app.db
    volumes:
      - .:/app
      - settings_data:/data

volumes:
  settings_data:`,
        },
        {
          kind: "text",
          text: [
            "When the same setting exists in both env_file and environment, the explicit environment value takes priority inside the container.",
          ],
        },
      ],
    },
    {
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder. The app starts with values loaded from .env and Docker Compose.",
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
            "Open the public config route to verify which safe settings are active.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/config/public`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "app_name": "FastAPI Settings Example",
  "environment": "development",
  "debug": true,
  "cors_origins": [
    "http://localhost:3000",
    "http://localhost:8000"
  ],
  "access_token_expire_minutes": 30
}`,
        },
      ],
    },
    {
      title: "Override a setting from Docker Compose",
      blocks: [
        {
          kind: "text",
          text: [
            "Override a setting temporarily from the shell without editing .env. This is useful for quick checks or CI style commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose run --rm \
  -e ENVIRONMENT=staging \
  -e DEBUG=false \
  backend python -c "from app.config import get_settings; s = get_settings(); print(s.environment, s.debug)"`,
        },
        {
          kind: "text",
          text: [
            "The command should print the overridden values from the container process.",
          ],
        },
        {
          kind: "code",
          code: `staging False`,
        },
      ],
    },
    {
      title: "Use separate environment files",
      blocks: [
        {
          kind: "text",
          text: [
            "For larger projects, keep separate files for local, test, and production style values. Commit only safe example files and avoid committing real secrets.",
          ],
        },
        {
          kind: "code",
          code: `.env.example
.env.local
.env.test
.env.production.example`,
        },
        {
          kind: "text",
          text: [
            "Run Compose with a different environment file when needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose --env-file .env.test up --build`,
        },
      ],
    },
    {
      title: "Validate required settings",
      blocks: [
        {
          kind: "text",
          text: [
            "Settings validation should fail early when required values are missing or invalid. For example, secret_key requires at least 16 characters and access_token_expire_minutes must be greater than or equal to 1.",
          ],
        },
        {
          kind: "code",
          code: `.env`,
        },
        {
          kind: "code",
          code: `SECRET_KEY=short
ACCESS_TOKEN_EXPIRE_MINUTES=0`,
        },
        {
          kind: "text",
          text: [
            "Starting the app with invalid settings should fail during startup instead of failing later during authentication or runtime behavior.",
          ],
        },
      ],
    },
    {
      title: "Production settings pattern",
      blocks: [
        {
          kind: "text",
          text: [
            "In production, provide secrets through the deployment environment rather than committing them in files. Docker, CI systems, cloud services, and secret managers can inject environment variables at runtime.",
          ],
        },
        {
          kind: "code",
          code: `Development
  .env file is acceptable

Repository
  commit .env.example only

Production
  inject real values from environment or secret manager

Never expose
  SECRET_KEY
  DATABASE_URL with credentials
  API keys
  OAuth client secrets`,
        },
      ],
    },
    {
      title: "Settings mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "A settings object keeps environment access in one place. Application files import settings instead of calling os.getenv everywhere.",
          ],
        },
        {
          kind: "code",
          code: `.env
  local values

Docker Compose env_file
  loads values into container

Docker Compose environment
  overrides selected values

Settings object
  validates and normalizes values

Application modules
  import settings from app.config

Routes
  do not expose secrets`,
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
            "Reset the project by removing the Docker volume. This deletes the SQLite database file.",
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