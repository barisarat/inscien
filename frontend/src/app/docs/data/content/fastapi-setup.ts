import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-setup",
  kind: "codenote",
  name: "FastAPI Setup with Docker",
  desc: "A FastAPI setup project that runs fully inside Docker and exposes basic JSON routes.",
  intro:
    "This setup creates the smallest FastAPI project. The app runs inside Docker, installs Python dependencies inside the container, and exposes a basic route.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a small project folder with one FastAPI app file, one requirements file, one Dockerfile, one Compose file.",
          ],
        },
        {
          kind: "code",
          code: `01-basic-route/
  app/
    main.py
  requirements.txt
  Dockerfile
  compose.yaml
  README.md`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 01-basic-route
cd 01-basic-route
mkdir app`,
        },
      ],
    },
    {
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main FastAPI application file at app/main.py. This file defines the FastAPI application instance and two simple GET routes. The root route returns a basic message and the health route returns a status response.",
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

app = FastAPI(title="01 Basic Route")


@app.get("/")
def home():
    return {
        "message": "Hello from FastAPI running in Docker"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }`,
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. This file installs FastAPI and Uvicorn. FastAPI is the framework and Uvicorn is the ASGI server that runs the application.",
          ],
        },
        {
          kind: "code",
          code: `requirements.txt`,
        },
        {
          kind: "code",
          code: `fastapi
uvicorn[standard]`,
        },
      ],
    },
    {
      title: "Create the Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Dockerfile at the project root. The Dockerfile uses a small Python image, creates a virtual environment inside the container, installs the dependencies, copies the project files, and starts Uvicorn.",
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
        {
          kind: "text",
          text: [
            "The app.main:app value means the app folder, the main.py file, and the FastAPI instance named app.",
          ],
        },
      ],
    },
    {
      title: "Create the Compose file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Docker Compose file at compose.yaml. Docker Compose builds the backend container, maps port 8000 from the container to the host, and mounts the project folder into the container for live reload during development.",
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
    container_name: fastapi-01-basic-route
    ports:
      - "8000:8000"
    volumes:
      - .:/app`,
        },
      ],
    },
    {
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder. The build step creates the image, installs the dependencies, and starts the FastAPI server.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up --build`,
        },
        {
          kind: "text",
          text: ["The server should show a Uvicorn startup message."],
        },
        {
          kind: "code",
          code: `Uvicorn running on http://0.0.0.0:8000`,
        },
      ],
    },
    {
      title: "Verify the routes",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the root route in the browser to confirm that the FastAPI app returns JSON.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "message": "Hello from FastAPI running in Docker"
}`,
        },
        {
          kind: "text",
          text: ["Open the health route to confirm that the app is running."],
        },
        {
          kind: "code",
          code: `http://localhost:8000/health`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "status": "ok"
}`,
        },
        {
          kind: "text",
          text: ["Open the automatic FastAPI documentation page."],
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Stop the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running container from the terminal where Docker Compose is running or shut it down from another terminal.",
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