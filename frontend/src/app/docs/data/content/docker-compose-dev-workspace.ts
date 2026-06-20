import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-compose-dev-workspace",
  kind: "codenote",
  name: "Docker Compose Dev Workspace Setup",
  desc: "Development setup with Ubuntu based Docker containers for backend, frontend, Redis, MySQL, Celery worker, and Celery beat.",
  intro:
    "This setup uses Docker Compose to create separate backend and frontend development environments, plus Redis, MySQL, Celery worker, and Celery beat services. Project files stay in the local backend and frontend folders on the host, and each development container mounts that folder to /workspace. The backend image installs Python dependencies into /opt/venv during build, while /workspace stays focused on source code.",
  sections: [
    {
      title: "Backend Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "This prepares an Ubuntu 24.04 based Python development image. The image installs system packages, creates a Docker-managed virtual environment at /opt/venv, installs requirements.txt into that environment, and exposes it through PATH.",
            "The backend source code is still mounted later into /workspace by Docker Compose. This keeps source files on the host while dependencies are managed by the Docker image.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt update && apt install -y \\
    python3 \\
    python3-venv \\
    python3-pip \\
    git \\
    curl \\
    ca-certificates \\
    build-essential \\
    default-libmysqlclient-dev \\
    pkg-config \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY requirements.txt /tmp/requirements.txt

RUN python3 -m venv /opt/venv
RUN /opt/venv/bin/pip install --upgrade pip
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

ENV PATH="/opt/venv/bin:$PATH"`,
        },
      ],
    },
    {
      title: "Frontend Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "This prepares a Node.js development environment on Ubuntu 24.04. The frontend source code is mounted later into /workspace by Docker Compose.",
            "This image installs the Node.js runtime and basic tools only. Project dependencies are normally installed and managed from inside the mounted frontend workspace.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y \\
    curl \\
    ca-certificates \\
    git \\
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\
    && apt install -y nodejs \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace`,
        },
      ],
    },
    {
      title: "compose.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "This Compose file defines the local development stack. The backend and frontend services mount local source folders into /workspace. Redis is used by Celery as broker and result backend. MySQL stores application data. Celery worker and Celery beat use the same backend image and the same mounted backend source folder.",
            "The backend, worker, and beat services all use the backend image dependencies from /opt/venv. No manual /workspace/.venv activation is needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  backend:
    build:
      context: ./backend
    env_file:
      - .env.dev
    container_name: project-backend
    working_dir: /workspace
    volumes:
      - ./backend:/workspace
    ports:
      - "8000:8000"
    stdin_open: true
    tty: true
    depends_on:
      - redis
      - mysql
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0

  celery_worker:
    build:
      context: ./backend
    env_file:
      - .env.dev
    container_name: project-celery-worker
    working_dir: /workspace
    volumes:
      - ./backend:/workspace
    depends_on:
      - redis
      - mysql
      - backend
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    command: celery -A celery_app:app worker -l info --concurrency=1 -P solo
    stdin_open: true
    tty: true

  celery_beat:
    build:
      context: ./backend
    env_file:
      - .env.dev
    container_name: project-celery-beat
    working_dir: /workspace
    volumes:
      - ./backend:/workspace
    depends_on:
      - redis
      - mysql
      - backend
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    command: celery -A celery_app:app beat -l info --pidfile=
    stdin_open: true
    tty: true

  frontend:
    build:
      context: ./frontend
    env_file:
      - .env.dev
    container_name: project-frontend
    working_dir: /workspace
    volumes:
      - ./frontend:/workspace
    ports:
      - "3000:3000"
    stdin_open: true
    tty: true

  redis:
    image: redis:7-alpine
    container_name: project-redis
    ports:
      - "6379:6379"

  mysql:
    image: mysql:8
    container_name: project-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: "change-this-root-password"
      MYSQL_DATABASE: "project_db"
      TZ: "UTC"
    ports:
      - "3306:3306"
    volumes:
      - project_mysql_data:/var/lib/mysql
    command:
      - "--character-set-server=utf8mb4"
      - "--collation-server=utf8mb4_0900_ai_ci"

volumes:
  project_mysql_data:`,
        },
      ],
    },
    {
      title: "Workspace mapping",
      blocks: [
        {
          kind: "text",
          bullets: [
            "In the backend container, /workspace is the local backend folder.",
            "In the frontend container, /workspace is the local frontend folder.",
            "The Celery worker and Celery beat containers also mount the local backend folder to /workspace.",
            "Backend Python packages are installed into /opt/venv inside the backend image.",
            "Port 8000 connects the host machine to port 8000 in the backend container.",
            "Port 3000 connects the host machine to port 3000 in the frontend container.",
            "Port 6379 exposes Redis locally for development and debugging.",
            "Port 3306 exposes MySQL locally for development and debugging.",
          ],
        },
      ],
    },
    {
  title: "Backend dependencies",
  blocks: [
    {
      kind: "text",
      text: [
        "Backend dependencies should be added to requirements.txt. The backend Docker image creates a virtual environment at /opt/venv and installs requirements.txt into that environment during image build.",
        "This keeps Python packages inside the Docker image while /workspace remains the mounted source-code folder from the host. Backend, Celery worker, and Celery beat all use the same image dependency environment.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose build backend celery_worker celery_beat`,
    },
    {
      kind: "text",
      text: [
        "Confirm that the backend container is using the Docker-managed Python environment.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec backend bash -lc "which python && which pip && which uvicorn && which celery"`,
    },
    {
      kind: "text",
      text: [
        "Expected paths should point to /opt/venv.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `/opt/venv/bin/python
/opt/venv/bin/pip
/opt/venv/bin/uvicorn
/opt/venv/bin/celery`,
    },
  ],
},
{
  title: "Manual dependency installs during development",
  blocks: [
    {
      kind: "text",
      text: [
        "During active development, it is fine to install a package manually inside the running backend container to test it quickly. This changes the current container environment only.",
        "After confirming the package works, add it to requirements.txt so future Docker builds can reproduce the same environment.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec backend bash
pip install package-name
pip show package-name`,
    },
    {
      kind: "text",
      text: [
        "A rebuild is not required after every manual install during development. Rebuild when requirements.txt changes need to be verified, before committing, before deployment, or when Celery worker and beat must use the same new dependency set.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose build backend celery_worker celery_beat
docker compose up -d backend celery_worker celery_beat`,
    },
  ],
},
    {
      title: "Daily usage",
      blocks: [
        {
          kind: "text",
          text: ["Start the full development stack from the folder where compose.yaml is located:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d`,
        },
        {
          kind: "text",
          text: ["Open a shell in the backend or frontend container:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend bash
docker compose exec frontend bash`,
        },
        {
          kind: "text",
          text: ["Run the FastAPI development server inside the backend container:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend bash -lc "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"`,
        },
        {
          kind: "text",
          text: ["Run the frontend development server inside the frontend container:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec frontend bash -lc "npm run dev"`,
        },
        {
          kind: "text",
          text: ["Rebuild the images after changing a Dockerfile, requirements.txt, or system-level dependencies:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d --build`,
        },
      ],
    },
    {
      title: "Celery usage",
      blocks: [
        {
          kind: "text",
          text: [
            "Celery worker and Celery beat run as separate Compose services. They use the same backend image and source mount as the backend container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d celery_worker celery_beat`,
        },
        {
          kind: "text",
          text: [
            "Follow live Celery logs. The --tail=0 option skips old logs and shows only new events.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose logs --tail=0 -f celery_worker celery_beat`,
        },
        {
          kind: "text",
          text: [
            "Follow backend, worker, and beat logs together.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose logs --tail=0 -f backend celery_worker celery_beat`,
        },
        {
          kind: "text",
          text: [
            "Call a test task manually when a smoke test task exists in the Celery app.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend celery -A celery_app:app call test.echo --args='["manual trigger works"]'`,
        },
      ],
    },
    {
      title: "Compose checks",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands to inspect the local stack and verify that all services are running.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose ps
docker compose logs --tail=50 backend
docker compose logs --tail=50 celery_worker
docker compose logs --tail=50 celery_beat`,
        },
        {
          kind: "text",
          text: [
            "Use live logs when debugging startup or scheduled task execution.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose logs --tail=0 -f backend frontend celery_worker celery_beat`,
        },
      ],
    },
    {
      title: "Cleanup old workspace venv",
      blocks: [
        {
          kind: "text",
          text: [
            "After the Docker image installs backend dependencies into /opt/venv and the services run correctly, the old /workspace/.venv folder is no longer needed for Docker usage.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend bash
cd /workspace
rm -rf .venv`,
        },
        {
          kind: "text",
          text: [
            "Keep .venv ignored so it is not committed if it is recreated later by editor tooling or local experiments.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `.venv/
celerybeat-schedule`,
        },
      ],
    },
  ],
}

export default entry