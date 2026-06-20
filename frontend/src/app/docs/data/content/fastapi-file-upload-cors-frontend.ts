import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-file-upload-cors-frontend",
  kind: "codenote",
  name: "FastAPI File Upload and Frontend Integration",
  desc: "A Docker based FastAPI project that handles file uploads, serves uploaded media files, enables CORS, and supports frontend multipart form requests.",
  intro:
    "This setup creates a FastAPI API for uploading files from a frontend application. It does not use Jinja templates or static HTML pages. The backend accepts multipart form uploads, saves files under a media directory, serves uploaded files through /media, enables CORS for a frontend origin, and returns JSON responses containing media URLs.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for file upload and frontend integration. This example is API-first and does not use server rendered HTML.",
          ],
        },
        {
          kind: "code",
          code: `09-file-upload-cors-frontend/
  app/
    __init__.py
    config.py
    main.py
    schemas.py
    storage.py
  media/
    uploads/
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 09-file-upload-cors-frontend
cd 09-file-upload-cors-frontend
mkdir -p app media/uploads
touch app/__init__.py`,
        },
      ],
    },
    {
      title: "Create the settings file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the configuration file at app/config.py. This keeps upload paths, public media URL prefix, and frontend CORS origins in one place.",
          ],
        },
        {
          kind: "code",
          code: `app/config.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `import os

APP_NAME = os.getenv("APP_NAME", "FastAPI File Upload API")

MEDIA_ROOT = os.getenv("MEDIA_ROOT", "media")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "media/uploads")
MEDIA_URL = os.getenv("MEDIA_URL", "/media")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

MAX_UPLOAD_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}`,
        },
        {
          kind: "text",
          text: [
            "The frontend origin is usually http://localhost:3000 for Next.js or http://localhost:5173 for Vite.",
          ],
        },
      ],
    },
    {
      title: "Create response schemas",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the schema file at app/schemas.py. The API returns JSON with the original filename, stored filename, content type, size, and public file URL.",
          ],
        },
        {
          kind: "code",
          code: `app/schemas.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from pydantic import BaseModel


class UploadResponse(BaseModel):
    original_filename: str
    stored_filename: str
    content_type: str
    size: int
    url: str


class UploadListResponse(BaseModel):
    files: list[str]`,
        },
      ],
    },
    {
      title: "Create file storage helpers",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the storage helper file at app/storage.py. This file validates upload type and size, creates safe unique filenames, saves files to disk, and builds public media URLs.",
          ],
        },
        {
          kind: "code",
          code: `app/storage.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE, MEDIA_URL, UPLOAD_DIR


def ensure_upload_dir():
    Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def get_file_extension(filename):
    return Path(filename).suffix.lower()


def create_stored_filename(filename):
    extension = get_file_extension(filename)

    return f"{uuid4().hex}{extension}"


def validate_image_upload(file):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, and WEBP images are allowed",
        )


def save_upload_file(file: UploadFile):
    validate_image_upload(file)
    ensure_upload_dir()

    stored_filename = create_stored_filename(file.filename or "upload")
    target_path = Path(UPLOAD_DIR) / stored_filename

    size = 0

    with target_path.open("wb") as buffer:
        while True:
            chunk = file.file.read(1024 * 1024)

            if not chunk:
                break

            size += len(chunk)

            if size > MAX_UPLOAD_SIZE:
                target_path.unlink(missing_ok=True)

                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Uploaded file is too large",
                )

            buffer.write(chunk)

    return {
        "original_filename": file.filename or "upload",
        "stored_filename": stored_filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": size,
        "url": f"{MEDIA_URL}/uploads/{stored_filename}",
    }


def list_uploaded_files():
    ensure_upload_dir()

    return sorted(
        path.name
        for path in Path(UPLOAD_DIR).iterdir()
        if path.is_file()
    )`,
        },
        {
          kind: "text",
          text: [
            "The stored filename is generated with a UUID so user supplied filenames are not trusted as storage names.",
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
            "Create the main application file at app/main.py. This app enables CORS, serves uploaded files under /media, and exposes API routes for uploading and listing files.",
          ],
        },
        {
          kind: "code",
          code: `app/main.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import APP_NAME, CORS_ORIGINS, MEDIA_ROOT, MEDIA_URL
from app.schemas import UploadListResponse, UploadResponse
from app.storage import list_uploaded_files, save_upload_file

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    MEDIA_URL,
    StaticFiles(directory=MEDIA_ROOT),
    name="media",
)


@app.get("/")
def home():
    return {
        "message": "FastAPI file upload API"
    }


@app.post("/uploads/images", response_model=UploadResponse)
def upload_image(file: UploadFile = File(...)):
    return save_upload_file(file)


@app.get("/uploads/images", response_model=UploadListResponse)
def uploaded_images():
    return {
        "files": list_uploaded_files()
    }`,
        },
        {
          kind: "text",
          text: [
            "This uses StaticFiles only to serve uploaded media files. It does not create static HTML pages and does not use Jinja templates.",
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
            "Create the dependency file at requirements.txt. python-multipart is required because file uploads use multipart/form-data.",
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
            "Create the Docker Compose file at compose.yaml. Uploaded files are stored in a named Docker volume so they survive container restarts.",
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
    container_name: fastapi-09-file-upload-cors-frontend
    ports:
      - "8000:8000"
    environment:
      APP_NAME: FastAPI File Upload API
      MEDIA_ROOT: media
      UPLOAD_DIR: media/uploads
      MEDIA_URL: /media
      CORS_ORIGINS: http://localhost:3000,http://localhost:5173
    volumes:
      - .:/app
      - uploaded_media:/app/media/uploads

volumes:
  uploaded_media:`,
        },
      ],
    },
    {
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder.",
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
            "Open the API docs page and test POST /uploads/images from the browser.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Upload from curl",
      blocks: [
        {
          kind: "text",
          text: [
            "Use curl to test the upload endpoint without a frontend. The form field name must be file because the route parameter is named file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -X POST http://localhost:8000/uploads/images \\
  -F "file=@./sample.png"`,
        },
        {
          kind: "text",
          text: [
            "The response returns a JSON object containing the public media URL.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "original_filename": "sample.png",
  "stored_filename": "b7e6f0a0d29a4c7a8c20c7d8c95d2f31.png",
  "content_type": "image/png",
  "size": 42155,
  "url": "/media/uploads/b7e6f0a0d29a4c7a8c20c7d8c95d2f31.png"
}`,
        },
      ],
    },
    {
      title: "Open uploaded media",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the returned URL through the FastAPI server. The uploaded file is served as media, not as a static HTML page.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/media/uploads/b7e6f0a0d29a4c7a8c20c7d8c95d2f31.png`,
        },
        {
          kind: "text",
          text: [
            "List uploaded files with GET /uploads/images.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/uploads/images`,
        },
      ],
    },
    {
      title: "Frontend upload request",
      blocks: [
        {
          kind: "text",
          text: [
            "A frontend should send multipart/form-data with FormData. Do not manually set the Content-Type header because the browser adds the multipart boundary automatically.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `async function uploadImage(file: File) {
  const formData = new FormData()

  formData.append("file", file)

  const response = await fetch("http://localhost:8000/uploads/images", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error("Upload failed")
  }

  return response.json() as Promise<{
    original_filename: string
    stored_filename: string
    content_type: string
    size: number
    url: string
  }>
}`,
        },
      ],
    },
    {
      title: "Frontend image URL handling",
      blocks: [
        {
          kind: "text",
          text: [
            "The backend returns a relative media URL such as /media/uploads/file.png. A separate frontend should prepend the API base URL before displaying the image.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `const API_BASE_URL = "http://localhost:8000"

function buildMediaUrl(url: string) {
  if (url.startsWith("http")) {
    return url
  }

  return \`\${API_BASE_URL}\${url}\`
}`,
        },
        {
          kind: "text",
          text: [
            "In a Next.js app, use the resulting absolute URL as the image source and allow the backend host in next.config if using next/image.",
          ],
        },
      ],
    },
    {
      title: "CORS role",
      blocks: [
        {
          kind: "text",
          text: [
            "CORS is needed when the frontend and backend run on different origins. For example, Next.js may run on localhost:3000 while FastAPI runs on localhost:8000.",
          ],
        },
        {
          kind: "code",
          code: `Frontend
  http://localhost:3000

Backend
  http://localhost:8000

Allowed origin
  http://localhost:3000`,
        },
        {
          kind: "text",
          text: [
            "The backend must explicitly allow the frontend origin. Otherwise, browser requests from the frontend can be blocked even when the API works from curl or Swagger UI.",
          ],
        },
      ],
    },
    {
      title: "File upload rules",
      blocks: [
        {
          kind: "text",
          text: [
            "File upload endpoints should not blindly trust user files. This example validates content type, limits upload size, and replaces the original filename with a generated storage filename.",
          ],
        },
        {
          kind: "code",
          code: `Validate
  content type
  upload size
  required form field

Avoid trusting
  original filename
  file extension alone
  user supplied path

Store
  generated filename
  known upload directory
  public URL in API response

For production
  store metadata in database
  use object storage for large files
  scan risky file types when needed`,
        },
      ],
    },
    {
      title: "Static media mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "Static media does not mean static HTML. In this setup, FastAPI only serves uploaded files so the frontend can display them.",
          ],
        },
        {
          kind: "code",
          code: `Static HTML
  not used here

Jinja templates
  not used here

StaticFiles
  used only for /media

API route
  accepts upload

Media URL
  returned as JSON

Frontend
  uploads file and displays returned URL`,
        },
      ],
    },
    {
      title: "Stop or reset the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running container without deleting uploaded files.",
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
            "Reset the project by removing the Docker volume. This deletes uploaded media files.",
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